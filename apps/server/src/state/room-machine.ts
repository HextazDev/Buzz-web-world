import type {
  AwardedBuzzTitle,
  BuzzerColor,
  PlayerAwardTelemetry,
  PlayerSlotState,
  RedLedMode,
  RoomPhase,
  RoundType,
} from '@buzz/shared';
import {
  AVATAR_PRESETS,
  BUZZER_COLORS,
  BUZZER_SOUNDS,
  HIGH_STAKES_BETS,
  ROUND_TYPES,
  ScoringMath,
} from '@buzz/shared';
import { randomUUID } from 'node:crypto';

import type {
  AppRepositories,
  QuestionEntity,
  QuizPackEntity,
} from '../repositories/interfaces.js';

export interface LoserPickOption {
  roundType: RoundType;
  packTitle: string;
}

export interface RoomInteractionEntry {
  attackerSlot: number;
  victimSlot: number;
  kind: 'PIE_HIT' | 'POINT_STEAL';
  pointsStolen?: number;
}

export interface ActiveRoom {
  roomCode: string;
  hostSocketId: string;
  phase: RoomPhase;
  format: 'SHORT' | 'NORMAL' | 'LONG' | 'CUSTOM';
  currentRoundIndex: number;
  totalRounds: number;
  currentRoundType?: RoundType;
  currentQuestionIndex: number;
  answers: Map<number, { color: BuzzerColor; reactionSec: number }>;
  players: Map<
    number,
    PlayerSlotState & { socketId?: string; reconnectToken: string; tauntCount: number }
  >;
  buzzLockedSlot: number | null;
  questionAttemptsCount: number;
  questionDisabledSlots: Set<number>;
  questionOpenedAtMs: number | null;
  loserPickerSlot: number | null;
  loserPickOptions: LoserPickOption[];
  pieTargetCursorSlot: number | null;
  pieAimIntervalTimer?: NodeJS.Timeout;
  bombHolderSlot: number | null;
  bombFuseRemainingMs: number | null;
  onTheSpotTargetSlot: number | null;
  onTheSpotVotes: Map<number, 0 | 1>;
  pointStealTargetOptions: number[];
  questionPool: QuestionEntity[];
  packTitlesPool: string[];
  interactionLog: RoomInteractionEntry[];
  playerAnswerStats: Map<
    number,
    {
      totalAnswered: number;
      correctAnswers: number;
      reactionSecSum: number;
      bombAndHighStakesLossPts: number;
      rankBeforeFinal?: number;
    }
  >;
  awards: AwardedBuzzTitle[];
  winnerSlot: number | null;
  activeWatchdogTimer?: NodeJS.Timeout;
}

export class RoomManager {
  private rooms = new Map<string, ActiveRoom>();
  // Verrou atomique mémoire en fallback Cloud-First si Redis n'est pas configuré
  private localLocks = new Map<string, { slotIndex: number; expiresAt: number }>();

  createRoom(
    hostSocketId: string,
    format: 'SHORT' | 'NORMAL' | 'LONG' | 'CUSTOM',
    customRounds?: number
  ): ActiveRoom {
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
      currentQuestionIndex: -1,
      answers: new Map(),
      players: new Map(),
      buzzLockedSlot: null,
      questionAttemptsCount: 0,
      questionDisabledSlots: new Set(),
      questionOpenedAtMs: null,
      loserPickerSlot: null,
      loserPickOptions: [],
      pieTargetCursorSlot: null,
      bombHolderSlot: null,
      bombFuseRemainingMs: null,
      onTheSpotTargetSlot: null,
      onTheSpotVotes: new Map(),
      pointStealTargetOptions: [],
      questionPool: [],
      packTitlesPool: [],
      interactionLog: [],
      playerAnswerStats: new Map(),
      awards: [],
      winnerSlot: null,
    };

    this.rooms.set(roomCode, room);
    return room;
  }

  getActiveRoomsCount(): number {
    return this.rooms.size;
  }

  getRoom(roomCode: string): ActiveRoom | undefined {
    if (!roomCode || typeof roomCode !== 'string') return undefined;
    return this.rooms.get(roomCode.trim().toUpperCase());
  }

  syncRoomQuestionPool(
    roomCode: string,
    packs: QuizPackEntity[],
    questions: QuestionEntity[]
  ): void {
    const room = this.getRoom(roomCode);
    if (!room) return;
    room.packTitlesPool = packs.map((p) => p.title);
    room.questionPool = [...questions];
  }

  getRoomPlayerUserIds(roomCode: string): string[] {
    const room = this.getRoom(roomCode);
    if (!room) return [];
    const ids = new Set<string>();
    for (const player of room.players.values()) {
      if (player.userId) {
        ids.add(player.userId);
      }
    }
    return Array.from(ids);
  }

  /**
   * Connexion ou reconnexion transparente d'un smartphone (Section 7 - Tolérance aux Déconnexions)
   */
  joinOrReconnectPlayer(
    roomCode: string,
    socketId: string,
    payload: {
      userId?: string;
      guestName?: string;
      avatarPreset?: string;
      buzzerSound?: string;
      reconnectToken?: string;
    }
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
    const avatarPreset =
      payload.avatarPreset ?? AVATAR_PRESETS[assignedSlot % AVATAR_PRESETS.length] ?? 'rocker';
    const avatarColor = BUZZER_COLORS[assignedSlot % BUZZER_COLORS.length]?.hex ?? '#0066FF';
    const buzzerSound =
      payload.buzzerSound ?? BUZZER_SOUNDS[assignedSlot % BUZZER_SOUNDS.length] ?? 'classic_tv';

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

  markPlayerDisconnected(roomCode: string, slotIndex: number): boolean {
    const room = this.getRoom(roomCode);
    if (!room) return false;
    const player = room.players.get(slotIndex);
    if (!player) return false;

    player.isConnected = false;
    player.socketId = undefined;
    return true;
  }

  areAllConnectedPlayersAnswered(roomCode: string): boolean {
    const room = this.getRoom(roomCode);
    if (!room) return false;

    const connectedSlots: number[] = [];
    for (const [slotIndex, player] of room.players.entries()) {
      if (player.isConnected) {
        connectedSlots.push(slotIndex);
      }
    }

    if (connectedSlots.length === 0) return false;
    return connectedSlots.every((slot) => room.answers.has(slot));
  }

  destroyRoom(roomCode: string): boolean {
    const room = this.getRoom(roomCode);
    if (!room) return false;

    if (room.activeWatchdogTimer) {
      clearTimeout(room.activeWatchdogTimer);
      room.activeWatchdogTimer = undefined;
    }
    if (room.pieAimIntervalTimer) {
      clearInterval(room.pieAimIntervalTimer);
      room.pieAimIntervalTimer = undefined;
    }

    this.localLocks.delete(`room:${room.roomCode}:buzz_lock`);
    return this.rooms.delete(room.roomCode);
  }

  clearBuzzLock(roomCode: string): void {
    const normalizedCode = roomCode.trim().toUpperCase();
    this.localLocks.delete(`room:${normalizedCode}:buzz_lock`);
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
    const normalizedCode = roomCode.trim().toUpperCase();
    const key = `room:${normalizedCode}:buzz_lock`;
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

  // ==========================================================================
  // MÉCANIQUE DU « CHOIX DU PERDANT » (LOSER_PICK_ROUND — MASTER_RFC §4)
  // ==========================================================================

  getLowestScoringConnectedPlayerSlot(room: ActiveRoom): number | null {
    let minScore = Infinity;
    let chosenSlot: number | null = null;
    for (const [slotIndex, player] of room.players.entries()) {
      if (player.isConnected && player.score < minScore) {
        minScore = player.score;
        chosenSlot = slotIndex;
      }
    }
    return chosenSlot;
  }

  getHighestScoringConnectedPlayerSlot(room: ActiveRoom): number | null {
    let maxScore = -Infinity;
    let chosenSlot: number | null = null;
    for (const [slotIndex, player] of room.players.entries()) {
      if (player.isConnected && player.score > maxScore) {
        maxScore = player.score;
        chosenSlot = slotIndex;
      }
    }
    return chosenSlot;
  }

  startLoserPickRound(
    roomCode: string,
    customOptions?: LoserPickOption[]
  ): { loserPickerSlot: number | null; options: LoserPickOption[] } | null {
    const room = this.getRoom(roomCode);
    if (!room) return null;

    const regularRounds = ROUND_TYPES.slice(0, 8);
    const defaultPacks = [
      'Culture Générale & Pop',
      'Jeux Vidéo Cultes',
      'Cinéma & Séries',
      'Musique & Blindtest',
    ];
    const options: LoserPickOption[] =
      customOptions ??
      ([0, 1, 2, 3].map((idx) => ({
        roundType:
          regularRounds[(room.currentRoundIndex + idx) % regularRounds.length] ?? 'POINT_BUILDER',
        packTitle: defaultPacks[idx] ?? 'Pack Officiel',
      })) as LoserPickOption[]);

    room.phase = 'LOSER_PICK_ROUND';
    room.loserPickerSlot = this.getLowestScoringConnectedPlayerSlot(room);
    room.loserPickOptions = options;
    return { loserPickerSlot: room.loserPickerSlot, options };
  }

  handleLoserPickSelection(
    roomCode: string,
    slotIndex: number,
    colorIndex: BuzzerColor
  ): RoundType | null {
    const room = this.getRoom(roomCode);
    if (!room || room.phase !== 'LOSER_PICK_ROUND') return null;
    if (room.loserPickerSlot !== null && room.loserPickerSlot !== slotIndex) return null;

    const picked = room.loserPickOptions[colorIndex]?.roundType ?? 'POINT_BUILDER';
    room.currentRoundType = picked;
    room.currentRoundIndex += 1;
    this.initRoundState(roomCode, picked);
    return picked;
  }

  // ==========================================================================
  // INITIALISATION & ORCHESTRATION DES 10 MANCHES (MASTER_RFC §4)
  // ==========================================================================

  initRoundState(roomCode: string, roundType: RoundType, initialBombFuseMs?: number): boolean {
    const room = this.getRoom(roomCode);
    if (!room) return false;

    room.currentRoundType = roundType;
    room.buzzLockedSlot = null;
    room.pieTargetCursorSlot = null;
    room.onTheSpotTargetSlot = null;
    room.onTheSpotVotes.clear();

    if (roundType === 'PIE_FIGHT') {
      for (const player of room.players.values()) {
        player.roundMeta = { ...player.roundMeta, lives: 2 };
      }
    } else if (roundType === 'PASS_THE_BOMB') {
      const leaderSlot = this.getHighestScoringConnectedPlayerSlot(room);
      room.bombHolderSlot = leaderSlot;
      room.bombFuseRemainingMs = initialBombFuseMs ?? ScoringMath.passTheBombInitialFuseMs();
      for (const [slot, player] of room.players.entries()) {
        player.roundMeta = { ...player.roundMeta, hasBomb: slot === leaderSlot };
      }
    } else if (roundType === 'BOILING_POINT') {
      for (const player of room.players.values()) {
        player.roundMeta = { ...player.roundMeta, thermometer: 0 };
      }
    } else if (roundType === 'FINAL_COUNTDOWN') {
      const scoresBySlot: Record<number, number> = {};
      for (const [slot, player] of room.players.entries()) {
        scoresBySlot[slot] = player.score;
      }
      const heights = ScoringMath.finalCountdownInitialHeights(scoresBySlot);
      for (const [slot, player] of room.players.entries()) {
        player.roundMeta = {
          ...player.roundMeta,
          pillarHeightSec: heights[slot] ?? 6.0,
        };
      }
      room.phase = 'FINAL_COUNTDOWN';
    } else if (roundType === 'FINAL_FLASHPOINT') {
      room.phase = 'FINAL_FLASHPOINT';
    }

    return true;
  }

  /**
   * Prépare une question sans démarrer le chrono serveur tant que host:ready_for_timer n'est pas reçu (TIME-01)
   */
  prepareQuestion(roomCode: string, roundType: RoundType, questionIndex: number): boolean {
    const room = this.getRoom(roomCode);
    if (!room) return false;

    room.currentRoundType = roundType;
    room.currentQuestionIndex = questionIndex;
    room.answers.clear();
    room.buzzLockedSlot = null;
    room.questionAttemptsCount = 0;
    room.questionDisabledSlots.clear();
    room.questionOpenedAtMs = null;
    room.phase = roundType === 'FINAL_FLASHPOINT' ? 'FINAL_FLASHPOINT' : 'QUESTION_ACTIVE';
    this.clearBuzzLock(roomCode);

    for (const p of room.players.values()) {
      p.riveState = 1; // Thinking
    }

    return true;
  }

  /**
   * Déclenché par host:ready_for_timer (ou fallback watchdog) pour ouvrir le chronomètre (TIME-01)
   */
  markReadyForTimer(roomCode: string, expectedPhase: RoomPhase): boolean {
    const room = this.getRoom(roomCode);
    if (!room || room.phase !== expectedPhase) return false;
    if (room.questionOpenedAtMs === null) {
      room.questionOpenedAtMs = Date.now();
    }
    return true;
  }

  /**
   * Prise de main au Buzzer Rouge pour les manches 3 (POINT_STEALER), 4 (PIE_FIGHT) et 10 (FINAL_FLASHPOINT)
   */
  async handleRedBuzz(
    roomCode: string,
    slotIndex: number,
    redisClient?: { set: (...args: unknown[]) => Promise<unknown> }
  ): Promise<{ acquired: boolean; phase?: RoomPhase }> {
    const room = this.getRoom(roomCode);
    if (!room) return { acquired: false };
    if (room.questionDisabledSlots.has(slotIndex)) return { acquired: false };

    const player = room.players.get(slotIndex);
    if (!player || !player.isConnected) return { acquired: false };

    // En PIE_FIGHT, un joueur éliminé (lives <= 0) ne peut plus buzzer
    if (room.currentRoundType === 'PIE_FIGHT' && (player.roundMeta?.lives ?? 2) <= 0) {
      return { acquired: false };
    }

    const validBuzzerRounds: RoundType[] = ['POINT_STEALER', 'PIE_FIGHT', 'FINAL_FLASHPOINT'];
    if (
      (room.phase !== 'QUESTION_ACTIVE' && room.phase !== 'FINAL_FLASHPOINT') ||
      !room.currentRoundType ||
      !validBuzzerRounds.includes(room.currentRoundType)
    ) {
      return { acquired: false };
    }

    const acquired = await this.tryAcquireBuzzLock(roomCode, slotIndex, redisClient);
    if (!acquired) return { acquired: false };

    room.buzzLockedSlot = slotIndex;
    room.phase = 'BUZZ_LOCKED_DECISION';
    player.riveState = 3; // Buzz_Slam
    return { acquired: true, phase: room.phase };
  }

  /**
   * Manche 3 : Stop ou Encore (POINT_STEALER)
   * Juste : vole jusqu'à 300 pts (si 1 seul adversaire, vol immédiat ; sinon sélection de cible ou adversaire le plus riche).
   * Faux : -150 pts (plancher 0) et réouverture aux autres joueurs (max 2 essais/question).
   */
  handlePointStealerDecision(
    roomCode: string,
    slotIndex: number,
    chosenColor: BuzzerColor,
    correctColor: BuzzerColor,
    explicitTargetSlot?: number
  ): {
    outcome: 'STEAL_APPLIED' | 'SELECT_TARGET' | 'REOPENED' | 'QUESTION_FAILED';
    buzzerDelta: number;
    targetSlot?: number;
    targetDelta?: number;
  } {
    const room = this.getRoom(roomCode);
    if (!room || room.buzzLockedSlot !== slotIndex) {
      return { outcome: 'QUESTION_FAILED', buzzerDelta: 0 };
    }

    const buzzerPlayer = room.players.get(slotIndex);
    if (!buzzerPlayer) return { outcome: 'QUESTION_FAILED', buzzerDelta: 0 };

    const isCorrect = chosenColor === correctColor;
    if (!isCorrect) {
      const { buzzerDelta } = ScoringMath.pointStealer(false, buzzerPlayer.score);
      buzzerPlayer.score += buzzerDelta;
      buzzerPlayer.riveState = 5; // Angry_Lose
      room.questionAttemptsCount += 1;
      room.questionDisabledSlots.add(slotIndex);
      room.buzzLockedSlot = null;
      this.clearBuzzLock(roomCode);

      if (room.questionAttemptsCount < 2 && room.players.size > room.questionDisabledSlots.size) {
        room.phase = 'QUESTION_ACTIVE';
        return { outcome: 'REOPENED', buzzerDelta };
      }

      room.phase = 'QUESTION_REVEAL';
      return { outcome: 'QUESTION_FAILED', buzzerDelta };
    }

    // Bonne réponse : trouver la cible
    const otherSlots = Array.from(room.players.keys()).filter((s) => s !== slotIndex);
    const resolvedTargetSlot =
      explicitTargetSlot !== undefined && otherSlots.includes(explicitTargetSlot)
        ? explicitTargetSlot
        : otherSlots.length === 1
          ? otherSlots[0]
          : undefined;

    if (resolvedTargetSlot === undefined && otherSlots.length > 1) {
      room.phase = 'POINT_STEAL_TARGET';
      room.pointStealTargetOptions = otherSlots.slice(0, 4);
      return { outcome: 'SELECT_TARGET', buzzerDelta: 0 };
    }

    const targetPlayer =
      resolvedTargetSlot !== undefined ? room.players.get(resolvedTargetSlot) : undefined;
    const { buzzerDelta, targetDelta } = ScoringMath.pointStealer(
      true,
      buzzerPlayer.score,
      targetPlayer?.score
    );
    buzzerPlayer.score += buzzerDelta;
    buzzerPlayer.riveState = 4; // Celebrate
    if (targetPlayer && resolvedTargetSlot !== undefined) {
      targetPlayer.score += targetDelta;
      targetPlayer.riveState = 5;
      this.recordInteractionTelemetry(roomCode, {
        attackerSlot: slotIndex,
        victimSlot: resolvedTargetSlot,
        kind: 'POINT_STEAL',
        pointsStolen: Math.abs(targetDelta),
      });
    }

    room.phase = 'QUESTION_REVEAL';
    return {
      outcome: 'STEAL_APPLIED',
      buzzerDelta,
      targetSlot: resolvedTargetSlot,
      targetDelta,
    };
  }

  handlePointStealTargetSelection(
    roomCode: string,
    slotIndex: number,
    colorIndex: BuzzerColor
  ): { targetSlot: number; buzzerDelta: number; targetDelta: number } | null {
    const room = this.getRoom(roomCode);
    if (!room || room.phase !== 'POINT_STEAL_TARGET' || room.buzzLockedSlot !== slotIndex) {
      return null;
    }

    const targetSlot =
      room.pointStealTargetOptions[colorIndex] ?? room.pointStealTargetOptions[0];
    if (targetSlot === undefined) return null;

    const buzzerPlayer = room.players.get(slotIndex);
    const targetPlayer = room.players.get(targetSlot);
    if (!buzzerPlayer || !targetPlayer) return null;

    const { buzzerDelta, targetDelta } = ScoringMath.pointStealer(
      true,
      buzzerPlayer.score,
      targetPlayer.score
    );
    buzzerPlayer.score += buzzerDelta;
    buzzerPlayer.riveState = 4;
    targetPlayer.score += targetDelta;
    targetPlayer.riveState = 5;
    this.recordInteractionTelemetry(roomCode, {
      attackerSlot: slotIndex,
      victimSlot: targetSlot,
      kind: 'POINT_STEAL',
      pointsStolen: Math.abs(targetDelta),
    });
    room.phase = 'QUESTION_REVEAL';

    return { targetSlot, buzzerDelta, targetDelta };
  }

  /**
   * Manche 4 : L'Entartage (PIE_FIGHT)
   */
  getAliveOpponentSlots(room: ActiveRoom, excludeSlot: number): number[] {
    const alive: number[] = [];
    for (const [slot, player] of room.players.entries()) {
      if (slot !== excludeSlot && (player.roundMeta?.lives ?? 2) > 0) {
        alive.push(slot);
      }
    }
    return alive;
  }

  handlePieFightAnswer(
    roomCode: string,
    slotIndex: number,
    chosenColor: BuzzerColor,
    correctColor: BuzzerColor
  ): { enteredAiming: boolean; targetCursorSlot: number | null } {
    const room = this.getRoom(roomCode);
    if (!room || room.buzzLockedSlot !== slotIndex) {
      return { enteredAiming: false, targetCursorSlot: null };
    }

    if (chosenColor !== correctColor) {
      const player = room.players.get(slotIndex);
      if (player) player.riveState = 5;
      room.buzzLockedSlot = null;
      this.clearBuzzLock(roomCode);
      room.phase = 'QUESTION_REVEAL';
      return { enteredAiming: false, targetCursorSlot: null };
    }

    const aliveTargets = this.getAliveOpponentSlots(room, slotIndex);
    const initialTarget = aliveTargets[0] ?? null;
    room.phase = 'PIE_AIMING';
    room.pieTargetCursorSlot = initialTarget;
    return { enteredAiming: true, targetCursorSlot: initialTarget };
  }

  advancePieTargetCursor(roomCode: string): number | null {
    const room = this.getRoom(roomCode);
    if (!room || room.phase !== 'PIE_AIMING' || room.buzzLockedSlot === null) return null;

    const aliveTargets = this.getAliveOpponentSlots(room, room.buzzLockedSlot);
    if (aliveTargets.length === 0) return null;

    const currentIdx =
      room.pieTargetCursorSlot !== null ? aliveTargets.indexOf(room.pieTargetCursorSlot) : -1;
    const nextTarget = aliveTargets[(currentIdx + 1) % aliveTargets.length] ?? aliveTargets[0]!;
    room.pieTargetCursorSlot = nextTarget;
    return nextTarget;
  }

  handlePieThrow(
    roomCode: string,
    shooterSlot: number
  ): { targetSlot: number; targetRemainingLives: number; roundEnded: boolean } | null {
    const room = this.getRoom(roomCode);
    if (
      !room ||
      room.phase !== 'PIE_AIMING' ||
      room.buzzLockedSlot !== shooterSlot ||
      room.pieTargetCursorSlot === null
    ) {
      return null;
    }

    if (room.pieAimIntervalTimer) {
      clearInterval(room.pieAimIntervalTimer);
      room.pieAimIntervalTimer = undefined;
    }

    const shooter = room.players.get(shooterSlot);
    const targetSlot = room.pieTargetCursorSlot;
    const target = room.players.get(targetSlot);
    if (!shooter || !target) return null;

    shooter.score += ScoringMath.pieFightHit();
    shooter.riveState = 4;

    const currentLives = target.roundMeta?.lives ?? 2;
    const nextLives = Math.max(0, currentLives - 1);
    target.roundMeta = { ...target.roundMeta, lives: nextLives };
    target.riveState = 5;
    this.recordInteractionTelemetry(roomCode, {
      attackerSlot: shooterSlot,
      victimSlot: targetSlot,
      kind: 'PIE_HIT',
    });

    // Vérifier s'il ne reste plus qu'un seul survivant
    const allSurvivors = Array.from(room.players.values()).filter(
      (p) => (p.roundMeta?.lives ?? 2) > 0
    );
    const roundEnded = allSurvivors.length <= 1;
    if (roundEnded && allSurvivors[0]) {
      allSurvivors[0].score += ScoringMath.pieFightRankBonus(1);
      target.score += ScoringMath.pieFightRankBonus(2);
    }

    room.phase = roundEnded ? 'ROUND_LEADERBOARD' : 'QUESTION_REVEAL';
    return { targetSlot, targetRemainingLives: nextLives, roundEnded };
  }

  /**
   * Manche 5 : La Bombe (PASS_THE_BOMB — BOMB-01)
   */
  handleBombHolderAnswer(
    roomCode: string,
    slotIndex: number,
    isCorrect: boolean
  ): {
    exploded: boolean;
    nextHolderSlot: number | null;
    scoreDelta: number;
    remainingFuseMs: number;
  } | null {
    const room = this.getRoom(roomCode);
    if (!room || room.bombHolderSlot !== slotIndex) return null;
    const holder = room.players.get(slotIndex);
    if (!holder) return null;

    const currentFuse = room.bombFuseRemainingMs ?? 30000;
    if (isCorrect) {
      holder.score += 100;
      holder.riveState = 4;

      // Passer au voisin connecté de droite
      const connectedSlots = Array.from(room.players.entries())
        .filter(([, p]) => p.isConnected)
        .map(([s]) => s)
        .sort((a, b) => a - b);
      const currentPos = connectedSlots.indexOf(slotIndex);
      const nextHolder =
        connectedSlots.length > 1
          ? (connectedSlots[(currentPos + 1) % connectedSlots.length] ?? slotIndex)
          : slotIndex;

      room.bombHolderSlot = nextHolder;
      for (const [s, p] of room.players.entries()) {
        p.roundMeta = { ...p.roundMeta, hasBomb: s === nextHolder };
      }

      return {
        exploded: false,
        nextHolderSlot: nextHolder,
        scoreDelta: 100,
        remainingFuseMs: currentFuse,
      };
    }

    // Mauvaise réponse : garde la bombe et perd 3000 ms sur la mèche (BOMB-01)
    const nextFuse = currentFuse - 3000;
    room.bombFuseRemainingMs = Math.max(0, nextFuse);

    if (nextFuse <= 0) {
      const explosionDelta = ScoringMath.passTheBombExplosionDelta(holder.score);
      holder.score += explosionDelta;
      holder.riveState = 5;
      this.recordAnswerTelemetry(roomCode, slotIndex, false, 0, Math.abs(explosionDelta));
      room.phase = 'ROUND_LEADERBOARD';
      return {
        exploded: true,
        nextHolderSlot: slotIndex,
        scoreDelta: explosionDelta,
        remainingFuseMs: 0,
      };
    }

    holder.riveState = 5;
    return {
      exploded: false,
      nextHolderSlot: slotIndex,
      scoreDelta: 0,
      remainingFuseMs: room.bombFuseRemainingMs,
    };
  }

  /**
   * Manche 6 : La Mise (HIGH_STAKES)
   */
  startHighStakesBetPhase(roomCode: string): boolean {
    const room = this.getRoom(roomCode);
    if (!room) return false;
    room.currentRoundType = 'HIGH_STAKES';
    room.phase = 'HIGH_STAKES_BET';
    for (const player of room.players.values()) {
      player.roundMeta = { ...player.roundMeta, stakeBet: 50 };
    }
    return true;
  }

  recordHighStakesBet(roomCode: string, slotIndex: number, colorIndex: BuzzerColor): number | null {
    const room = this.getRoom(roomCode);
    if (!room || room.phase !== 'HIGH_STAKES_BET') return null;
    const player = room.players.get(slotIndex);
    if (!player) return null;

    const bet = HIGH_STAKES_BETS[colorIndex] ?? 50;
    player.roundMeta = { ...player.roundMeta, stakeBet: bet };
    return bet;
  }

  /**
   * Manche 7 : En Ébullition (BOILING_POINT)
   */
  applyBoilingPointAnswer(
    roomCode: string,
    slotIndex: number,
    isCorrect: boolean
  ): { nextThermometer: number; pointsDelta: number; triggeredJackpot: boolean } | null {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    const player = room.players.get(slotIndex);
    if (!player) return null;

    const currentThermo = player.roundMeta?.thermometer ?? 0;
    const step = ScoringMath.boilingPointStep(isCorrect, currentThermo);
    player.score += step.pointsDelta;
    player.roundMeta = { ...player.roundMeta, thermometer: step.nextThermometer };
    player.riveState = isCorrect ? 4 : 5;

    if (step.triggeredJackpot) {
      room.phase = 'ROUND_LEADERBOARD';
    }
    return step;
  }

  /**
   * Manche 8 : Sur la Sellette (ON_THE_SPOT)
   */
  startOnTheSpotVotePhase(roomCode: string, targetSlot: number): boolean {
    const room = this.getRoom(roomCode);
    if (!room || !room.players.has(targetSlot)) return false;

    room.currentRoundType = 'ON_THE_SPOT';
    room.phase = 'ON_THE_SPOT_VOTE';
    room.onTheSpotTargetSlot = targetSlot;
    room.onTheSpotVotes.clear();
    return true;
  }

  recordOnTheSpotVote(roomCode: string, voterSlot: number, choice: BuzzerColor): boolean {
    const room = this.getRoom(roomCode);
    if (!room || room.phase !== 'ON_THE_SPOT_VOTE') return false;
    if (voterSlot === room.onTheSpotTargetSlot) return false;
    if (choice !== 0 && choice !== 1) return false;

    room.onTheSpotVotes.set(voterSlot, choice);
    return true;
  }

  resolveOnTheSpotTurn(
    roomCode: string,
    targetAnsweredCorrectly: boolean
  ): { targetDelta: number; voterDeltas: Record<number, number> } | null {
    const room = this.getRoom(roomCode);
    if (!room || room.onTheSpotTargetSlot === null) return null;

    const voterChoices: Record<number, 0 | 1> = {};
    for (const [slot, vote] of room.onTheSpotVotes.entries()) {
      voterChoices[slot] = vote;
    }

    const res = ScoringMath.onTheSpot(targetAnsweredCorrectly, voterChoices);
    const targetPlayer = room.players.get(room.onTheSpotTargetSlot);
    if (targetPlayer) {
      targetPlayer.score += res.targetDelta;
      targetPlayer.riveState = targetAnsweredCorrectly ? 4 : 5;
    }

    for (const [slotStr, delta] of Object.entries(res.voterDeltas)) {
      const voter = room.players.get(Number(slotStr));
      if (voter) {
        voter.score += delta;
      }
    }

    room.phase = 'QUESTION_REVEAL';
    return res;
  }

  /**
   * Manche 9 & 10 : Finale Compte à Rebours (FINAL_COUNTDOWN) -> Finale Égalité Éclair (FINAL_FLASHPOINT, FIN-01)
   */
  resolveFinalCountdownQuestion(
    roomCode: string,
    resultsBySlot: Record<number, { isCorrect: boolean; reactionSec: number }>
  ): {
    updatedHeights: Record<number, number>;
    aliveSlots: number[];
    winnerSlot: number | null;
    triggeredFlashpoint: boolean;
  } | null {
    const room = this.getRoom(roomCode);
    if (!room) return null;

    // Trouver le joueur ayant répondu juste le plus vite
    let fastestSlot: number | null = null;
    let fastestTime = Infinity;
    for (const [slotStr, res] of Object.entries(resultsBySlot)) {
      const slot = Number(slotStr);
      const currentH = room.players.get(slot)?.roundMeta?.pillarHeightSec ?? 0;
      if (currentH > 0 && res.isCorrect && res.reactionSec < fastestTime) {
        fastestTime = res.reactionSec;
        fastestSlot = slot;
      }
    }

    const previouslyAliveSlots: number[] = [];
    const updatedHeights: Record<number, number> = {};
    const aliveSlots: number[] = [];

    for (const [slot, player] of room.players.entries()) {
      const prevHeight = player.roundMeta?.pillarHeightSec ?? 0;
      if (prevHeight <= 0) {
        updatedHeights[slot] = 0;
        continue;
      }
      previouslyAliveSlots.push(slot);

      const ans = resultsBySlot[slot];
      const isCorrect = ans?.isCorrect ?? false;
      const drainSec = ans?.reactionSec ?? prevHeight;
      const nextHeight = ScoringMath.finalCountdownQuestionStep(
        prevHeight,
        drainSec,
        isCorrect,
        fastestSlot === slot
      );

      player.roundMeta = { ...player.roundMeta, pillarHeightSec: nextHeight };
      updatedHeights[slot] = nextHeight;
      if (nextHeight > 0) {
        aliveSlots.push(slot);
      }
    }

    // FIN-01 : Si les derniers survivants (>= 2) chutent à 0.0s simultanément -> FINAL_FLASHPOINT
    if (aliveSlots.length === 0 && previouslyAliveSlots.length >= 2) {
      room.currentRoundType = 'FINAL_FLASHPOINT';
      room.phase = 'FINAL_FLASHPOINT';
      return {
        updatedHeights,
        aliveSlots: [],
        winnerSlot: null,
        triggeredFlashpoint: true,
      };
    }

    if (aliveSlots.length === 1) {
      const winnerSlot = aliveSlots[0]!;
      room.winnerSlot = winnerSlot;
      room.phase = 'AWARDS_CEREMONY';
      return {
        updatedHeights,
        aliveSlots,
        winnerSlot,
        triggeredFlashpoint: false,
      };
    }

    return {
      updatedHeights,
      aliveSlots,
      winnerSlot: null,
      triggeredFlashpoint: false,
    };
  }

  /**
   * Manche 10 : Finale Égalité Éclair (FINAL_FLASHPOINT)
   * Juste = victoire immédiate ; Faux = victoire immédiate de l'adversaire.
   */
  resolveFlashpointDecision(
    roomCode: string,
    buzzerSlot: number,
    isCorrect: boolean
  ): { winnerSlot: number } | null {
    const room = this.getRoom(roomCode);
    if (!room || room.buzzLockedSlot !== buzzerSlot) return null;

    let winnerSlot = buzzerSlot;
    if (!isCorrect) {
      const opponentSlot = Array.from(room.players.keys()).find((s) => s !== buzzerSlot);
      if (opponentSlot !== undefined) {
        winnerSlot = opponentSlot;
      }
    }

    const winner = room.players.get(winnerSlot);
    if (winner) {
      winner.score += 1000;
      winner.riveState = 4;
    }

    room.winnerSlot = winnerSlot;
    room.phase = 'AWARDS_CEREMONY';
    return { winnerSlot };
  }

  // ==========================================================================
  // CÉRÉMONIE DES TITRES (« BUZZ! AWARDS ») & RIVALITÉS ENTRE AMIS (MASTER_RFC §5 & §6)
  // ==========================================================================

  recordInteractionTelemetry(roomCode: string, entry: RoomInteractionEntry): void {
    const room = this.getRoom(roomCode);
    if (!room) return;
    room.interactionLog.push(entry);
  }

  recordAnswerTelemetry(
    roomCode: string,
    slotIndex: number,
    isCorrect: boolean,
    reactionSec: number,
    bombOrStakesLossPts = 0
  ): void {
    const room = this.getRoom(roomCode);
    if (!room) return;
    const current = room.playerAnswerStats.get(slotIndex) ?? {
      totalAnswered: 0,
      correctAnswers: 0,
      reactionSecSum: 0,
      bombAndHighStakesLossPts: 0,
    };
    current.totalAnswered += 1;
    if (isCorrect) current.correctAnswers += 1;
    current.reactionSecSum += Math.max(0, reactionSec);
    current.bombAndHighStakesLossPts += Math.max(0, bombOrStakesLossPts);
    room.playerAnswerStats.set(slotIndex, current);
  }

  async finalizeCeremonyAndRivalries(
    roomCode: string,
    repos: AppRepositories
  ): Promise<{ awards: AwardedBuzzTitle[]; winnerSlot: number | null } | null> {
    const room = this.getRoom(roomCode);
    if (!room) return null;

    const sortedPlayers = Array.from(room.players.values()).sort((a, b) => b.score - a.score);
    const resolvedWinnerSlot =
      room.winnerSlot ?? (sortedPlayers[0] ? sortedPlayers[0].slotIndex : null);
    room.winnerSlot = resolvedWinnerSlot;
    room.phase = 'AWARDS_CEREMONY';

    // Construire PlayerAwardTelemetry[] pour le moteur pur ScoringMath.computeBuzzAwards
    const telemetryList: PlayerAwardTelemetry[] = sortedPlayers.map((p, idx) => {
      const stats = room.playerAnswerStats.get(p.slotIndex);
      const totalAnswered = stats?.totalAnswered ?? 0;
      const correctAnswers = stats?.correctAnswers ?? 0;
      const avgReactionSec =
        totalAnswered > 0 ? (stats?.reactionSecSum ?? 0) / totalAnswered : 2.5;

      let piesReceived = 0;
      let pointsStolenFromMeCount = 0;
      const targetedCountByVictimSlot: Record<number, number> = {};

      for (const item of room.interactionLog) {
        if (item.victimSlot === p.slotIndex) {
          if (item.kind === 'PIE_HIT') piesReceived += 1;
          if (item.kind === 'POINT_STEAL') pointsStolenFromMeCount += 1;
        }
        if (item.attackerSlot === p.slotIndex) {
          targetedCountByVictimSlot[item.victimSlot] =
            (targetedCountByVictimSlot[item.victimSlot] ?? 0) + 1;
        }
      }

      const finalRank = p.slotIndex === resolvedWinnerSlot ? 1 : idx + 1;
      return {
        slotIndex: p.slotIndex,
        displayName: p.displayName,
        totalAnswered,
        correctAnswers,
        avgReactionSec,
        piesReceived,
        pointsStolenFromMeCount,
        targetedCountByVictimSlot,
        bombAndHighStakesLossPts: stats?.bombAndHighStakesLossPts ?? 0,
        tauntPresses: p.tauntCount,
        rankBeforeFinal: stats?.rankBeforeFinal ?? finalRank,
        leadBeforeFinalPts: 0,
        finalRank,
      };
    });

    const awards = ScoringMath.computeBuzzAwards(telemetryList);
    room.awards = awards;

    // Mise à jour des statistiques globales des joueurs authentifiés
    for (const p of sortedPlayers) {
      if (!p.userId) continue;
      const stats = room.playerAnswerStats.get(p.slotIndex);
      const totalAnswered = stats?.totalAnswered ?? 0;
      const correctAnswers = stats?.correctAnswers ?? 0;
      const avgReactionMs =
        totalAnswered > 0 ? Math.round(((stats?.reactionSecSum ?? 0) / totalAnswered) * 1000) : 0;
      const firstAward = awards.find((a) => a.slotIndex === p.slotIndex);

      await repos.users.updateStatsAfterGame(p.userId, {
        won: p.slotIndex === resolvedWinnerSlot,
        questionsCount: totalAnswered,
        correctCount: correctAnswers,
        avgReactionMs,
        awardCode: firstAward?.code,
      });
    }

    // Mise à jour des Rivalités entre Amis (RIV-01 : user_a_id < user_b_id garanti par repos.rivalries.upsertRivalryStats)
    const authPlayers = sortedPlayers.filter((p) => Boolean(p.userId));
    for (let i = 0; i < authPlayers.length; i++) {
      for (let j = i + 1; j < authPlayers.length; j++) {
        const p1 = authPlayers[i]!;
        const p2 = authPlayers[j]!;
        if (!p1.userId || !p2.userId || p1.userId === p2.userId) continue;

        let p1TartedP2 = 0;
        let p2TartedP1 = 0;
        let p1StoleP2 = 0;
        let p2StoleP1 = 0;
        for (const item of room.interactionLog) {
          if (item.attackerSlot === p1.slotIndex && item.victimSlot === p2.slotIndex) {
            if (item.kind === 'PIE_HIT') p1TartedP2 += 1;
            if (item.kind === 'POINT_STEAL') p1StoleP2 += item.pointsStolen ?? 0;
          } else if (item.attackerSlot === p2.slotIndex && item.victimSlot === p1.slotIndex) {
            if (item.kind === 'PIE_HIT') p2TartedP1 += 1;
            if (item.kind === 'POINT_STEAL') p2StoleP1 += item.pointsStolen ?? 0;
          }
        }

        await repos.rivalries.upsertRivalryStats(p1.userId, p2.userId, {
          user1FinishedAhead: p1.score > p2.score,
          user2FinishedAhead: p2.score > p1.score,
          user1TartedUser2: p1TartedP2,
          user2TartedUser1: p2TartedP1,
          user1StoleFromUser2Pts: p1StoleP2,
          user2StoleFromUser1Pts: p2StoleP1,
        });
      }
    }

    return { awards, winnerSlot: resolvedWinnerSlot };
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
      case 'AWARDS_CEREMONY':
      case 'PODIUM_END':
        return {
          phase: room.phase,
          redLedMode: 'PULSE_READY',
          activeColors: [true, true, true, true], // Mimiques d'avatar hors-question
          statusBanner: 'REGARDEZ LA TÉLÉVISION — MODE TAUNT ACTIF',
        };

      case 'LOSER_PICK_ROUND': {
        const isPicker = room.loserPickerSlot === slotIndex;
        return {
          phase: room.phase,
          redLedMode: 'OFF',
          activeColors: isPicker ? [true, true, true, true] : [false, false, false, false],
          statusBanner: isPicker
            ? 'CHOIX DU PERDANT — CHOISISSEZ LA MANCHE (10s) !'
            : 'LE DERNIER DU CLASSEMENT CHOISIT LA MANCHE...',
        };
      }

      case 'HIGH_STAKES_BET':
        return {
          phase: room.phase,
          redLedMode: 'OFF',
          activeColors: [true, true, true, true],
          statusBanner: 'FAITES VOS JEUX (50 / 100 / 250 / 500 PTS) !',
        };

      case 'ON_THE_SPOT_VOTE': {
        const isTarget = room.onTheSpotTargetSlot === slotIndex;
        return {
          phase: room.phase,
          redLedMode: 'OFF',
          activeColors: isTarget ? [false, false, false, false] : [true, true, false, false],
          statusBanner: isTarget
            ? 'SUR LA SELLETTE — LE SALON VOTE SUR VOUS !'
            : 'VOTEZ : BLEU (RÉUSSIT) OU ORANGE (ÉCHOUE) !',
        };
      }

      case 'POINT_STEAL_TARGET': {
        const isStealer = room.buzzLockedSlot === slotIndex;
        const count = room.pointStealTargetOptions.length;
        return {
          phase: room.phase,
          redLedMode: isStealer ? 'SOLID_LOCKED' : 'OFF',
          activeColors: isStealer
            ? [count >= 1, count >= 2, count >= 3, count >= 4]
            : [false, false, false, false],
          statusBanner: isStealer
            ? 'CHOISISSEZ QUI VOLER (5s) !'
            : 'ATTENTION AU VOL DE POINTS !',
        };
      }

      case 'QUESTION_ACTIVE':
      case 'FINAL_COUNTDOWN':
      case 'FINAL_FLASHPOINT': {
        const alreadyAnswered = room.answers.has(slotIndex);
        const isBuzzerRound =
          room.currentRoundType === 'POINT_STEALER' ||
          room.currentRoundType === 'PIE_FIGHT' ||
          room.currentRoundType === 'FINAL_FLASHPOINT';

        if (isBuzzerRound) {
          const disabled = room.questionDisabledSlots.has(slotIndex);
          return {
            phase: room.phase,
            redLedMode: disabled ? 'OFF' : 'PULSE_READY',
            activeColors: [false, false, false, false],
            statusBanner: disabled ? 'ESSAI ÉPUISÉ' : 'BUZZEZ AU BOUTON ROUGE !',
          };
        }

        if (room.currentRoundType === 'PASS_THE_BOMB') {
          const isHolder = room.bombHolderSlot === slotIndex;
          return {
            phase: room.phase,
            redLedMode: isHolder ? 'PULSE_READY' : 'OFF',
            activeColors: isHolder ? [true, true, true, true] : [false, false, false, false],
            statusBanner: isHolder
              ? 'VOUS AVEZ LA BOMBE — RÉPONDEZ VITE !'
              : 'PASSEZ LA BOMBE !',
          };
        }

        return {
          phase: room.phase,
          redLedMode: alreadyAnswered ? 'SOLID_LOCKED' : 'PULSE_READY',
          activeColors: alreadyAnswered ? [false, false, false, false] : [true, true, true, true],
          statusBanner: alreadyAnswered
            ? 'RÉPONSE VERROUILLÉE — REGARDEZ LA TV !'
            : 'RÉPONDEZ SUR LA TV !',
        };
      }

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
      code += chars[Math.floor(Math.random() * chars.length)] ?? 'A';
    }
    return this.rooms.has(code) ? this.generateRoomCode() : code;
  }
}
