import type {
  BuzzerColor,
  PlayerSlotState,
  RedLedMode,
  RoomPhase,
  RoundType,
} from '@buzz/shared';
import { AVATAR_PRESETS, BUZZER_COLORS, BUZZER_SOUNDS } from '@buzz/shared';
import { randomUUID } from 'node:crypto';

export interface ActiveRoom {
  roomCode: string;
  hostSocketId: string;
  phase: RoomPhase;
  format: 'SHORT' | 'NORMAL' | 'LONG' | 'CUSTOM';
  currentRoundIndex: number;
  totalRounds: number;
  currentRoundType?: RoundType;
  players: Map<number, PlayerSlotState & { socketId?: string; reconnectToken: string; tauntCount: number }>;
  buzzLockedSlot: number | null;
  questionOpenedAtMs: number | null;
  activeWatchdogTimer?: NodeJS.Timeout;
}

export class RoomManager {
  private rooms = new Map<string, ActiveRoom>();
  // Verrou atomique mémoire en fallback si Redis n'est pas lancé en dev local
  private localLocks = new Map<string, { slotIndex: number; expiresAt: number }>();

  createRoom(hostSocketId: string, format: 'SHORT' | 'NORMAL' | 'LONG' | 'CUSTOM', customRounds?: number): ActiveRoom {
    const roomCode = this.generateRoomCode();
    const totalRounds =
      format === 'SHORT'
        ? 3
        : format === 'NORMAL'
          ? 5
          : format === 'LONG'
            ? 8
            : Math.min(12, Math.max(2, customRounds ?? 4));

    const room: ActiveRoom = {
      roomCode,
      hostSocketId,
      phase: 'LOBBY',
      format,
      currentRoundIndex: 0,
      totalRounds,
      players: new Map(),
      buzzLockedSlot: null,
      questionOpenedAtMs: null,
    };

    this.rooms.set(roomCode, room);
    return room;
  }

  getRoom(roomCode: string): ActiveRoom | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  /**
   * Connexion ou reconnexion transparente d'un smartphone (Section 7 - Tolérance aux Déconnexions)
   */
  joinOrReconnectPlayer(
    roomCode: string,
    socketId: string,
    payload: { userId?: string; guestName?: string; reconnectToken?: string }
  ): { slotIndex: number; reconnectToken: string; displayName: string } | null {
    const room = this.getRoom(roomCode);
    if (!room) return null;

    // 1. Tentative de reconnexion via reconnectToken
    if (payload.reconnectToken) {
      for (const [slotIndex, player] of room.players.entries()) {
        if (player.reconnectToken === payload.reconnectToken) {
          player.socketId = socketId;
          player.isConnected = true;
          return {
            slotIndex,
            reconnectToken: player.reconnectToken,
            displayName: player.displayName,
          };
        }
      }
    }

    // 2. Nouveau joueur (max 8 pupitres : 0..7)
    if (room.players.size >= 8) return null;
    let assignedSlot = 0;
    while (room.players.has(assignedSlot)) {
      assignedSlot++;
    }

    const reconnectToken = randomUUID();
    const displayName = payload.guestName?.trim() || `Joueur ${assignedSlot + 1}`;
    const avatarPreset = AVATAR_PRESETS[assignedSlot % AVATAR_PRESETS.length]!;
    const avatarColor = BUZZER_COLORS[assignedSlot % BUZZER_COLORS.length]!.hex;
    const buzzerSound = BUZZER_SOUNDS[assignedSlot % BUZZER_SOUNDS.length]!;

    room.players.set(assignedSlot, {
      slotIndex: assignedSlot,
      userId: payload.userId,
      displayName,
      avatarPreset,
      avatarColor,
      buzzerSound,
      score: 0,
      isConnected: true,
      riveState: 0,
      socketId,
      reconnectToken,
      tauntCount: 0,
    });

    return { slotIndex: assignedSlot, reconnectToken, displayName };
  }

  /**
   * Verrou Atomique de Buzzer (Section 7) :
   * Équivalent Redis : SET room:{code}:buzz_lock {slotIndex} NX PX 4000
   */
  async tryAcquireBuzzLock(
    roomCode: string,
    slotIndex: number,
    redisClient?: { set: (...args: unknown[]) => Promise<unknown> }
  ): Promise<boolean> {
    const key = `room:${roomCode}:buzz_lock`;
    if (redisClient) {
      const res = await redisClient.set(key, String(slotIndex), 'NX', 'PX', 4000);
      return res === 'OK';
    }

    const now = Date.now();
    const existing = this.localLocks.get(key);
    if (existing && existing.expiresAt > now) {
      return false;
    }
    this.localLocks.set(key, { slotIndex, expiresAt: now + 4000 });
    return true;
  }

  /**
   * Calcule l'état des LED et des 4 boutons couleurs du contrôleur selon la phase courante
   */
  computeControllerSyncState(room: ActiveRoom, slotIndex: number): {
    phase: RoomPhase;
    redLedMode: RedLedMode;
    activeColors: [boolean, boolean, boolean, boolean];
    statusBanner: string;
  } {
    switch (room.phase) {
      case 'LOBBY':
      case 'ROUND_LEADERBOARD':
      case 'PODIUM_END':
        return {
          phase: room.phase,
          redLedMode: 'PULSE_READY',
          activeColors: [true, true, true, true], // Mimiques d'avatar hors-question
          statusBanner: 'REGARDEZ LA TÉLÉVISION — MODE TAUNT ACTIF',
        };

      case 'QUESTION_ACTIVE':
        return {
          phase: room.phase,
          redLedMode: 'PULSE_READY',
          activeColors: [true, true, true, true],
          statusBanner: 'RÉPONDEZ SUR LA TV !',
        };

      case 'BUZZ_LOCKED_DECISION': {
        const isHolder = room.buzzLockedSlot === slotIndex;
        return {
          phase: room.phase,
          redLedMode: isHolder ? 'SOLID_LOCKED' : 'OFF',
          activeColors: isHolder ? [true, true, true, true] : [false, false, false, false],
          statusBanner: isHolder ? 'À VOUS LA MAIN (3s) !' : 'VERROUILLÉ PAR UN ADVERSAIRE',
        };
      }

      case 'PIE_AIMING': {
        const isShooter = room.buzzLockedSlot === slotIndex;
        return {
          phase: room.phase,
          redLedMode: isShooter ? 'AIM_TRIGGER' : 'OFF',
          activeColors: [false, false, false, false],
          statusBanner: isShooter ? 'APPUYEZ SUR ROUGE POUR ENTARTER !' : 'ATTENTION À LA TARTE !',
        };
      }

      default:
        return {
          phase: room.phase,
          redLedMode: 'OFF',
          activeColors: [false, false, false, false],
          statusBanner: 'REGARDEZ LA TÉLÉVISION',
        };
    }
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return this.rooms.has(code) ? this.generateRoomCode() : code;
  }
}
