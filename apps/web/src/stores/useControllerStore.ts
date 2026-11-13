import { defineStore } from 'pinia';
import { ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import {
  AVATAR_PRESETS,
  BUZZER_SOUNDS,
  type AvatarPreset,
  type BuzzerColor,
  type BuzzerSound,
  type ControllerToServerEvents,
  type RedLedMode,
  type RoomPhase,
  type ServerToControllerEvents,
} from '@buzz/shared';

function safeGetStorage(key: string, fallback: string): string {
  if (typeof localStorage === 'undefined') return fallback;
  return localStorage.getItem(key) || fallback;
}

function safeSetStorage(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, value);
}

/**
 * Store Pinia du Contrôleur Buzzer Mobile (/controller)
 * Invariant CTRL-01 : ZÉRO texte de question ni d'intitulé de réponse stocké ici !
 */
export const useControllerStore = defineStore('controller', () => {
  const roomCodeInput = ref('');
  const guestNameInput = ref(safeGetStorage('buzz:guestName', ''));
  const selectedAvatarPreset = ref<AvatarPreset>(
    (safeGetStorage('buzz:avatarPreset', AVATAR_PRESETS[0]) as AvatarPreset) || 'rocker'
  );
  const selectedBuzzerSound = ref<BuzzerSound>(
    (safeGetStorage('buzz:buzzerSound', BUZZER_SOUNDS[0]) as BuzzerSound) || 'classic_tv'
  );

  const isJoined = ref(false);
  const assignedSlotIndex = ref<number | null>(null);
  const displayName = ref('');
  const phase = ref<RoomPhase>('LOBBY');
  const redLedMode = ref<RedLedMode>('PULSE_READY');
  const activeColors = ref<[boolean, boolean, boolean, boolean]>([true, true, true, true]);
  const statusBanner = ref('REGARDEZ LA TÉLÉVISION');

  let socket: Socket<ServerToControllerEvents, ControllerToServerEvents> | null = null;
  let wakeLockSentinel: WakeLockSentinel | null = null;

  function vibrate(pattern: number | number[] = 50) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignoré sur iOS/Desktop sans API Vibration
      }
    }
  }

  async function requestScreenWakeLock() {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch {
      // Non bloquant si refusé par l'OS
    }
  }

  function applyStateSync(state: {
    phase: RoomPhase;
    redLedMode: RedLedMode;
    activeColors: [boolean, boolean, boolean, boolean];
    hapticPattern?: number | number[];
    statusBanner: string;
  }) {
    phase.value = state.phase;
    redLedMode.value = state.redLedMode;
    activeColors.value = state.activeColors;
    statusBanner.value = state.statusBanner;
    if (state.hapticPattern) {
      vibrate(state.hapticPattern);
    }
  }

  function connectToRoom(explicitRoomCode?: string) {
    const code = (explicitRoomCode ?? roomCodeInput.value).trim().toUpperCase();
    if (code.length !== 4) return;
    roomCodeInput.value = code;

    safeSetStorage('buzz:guestName', guestNameInput.value);
    safeSetStorage('buzz:avatarPreset', selectedAvatarPreset.value);
    safeSetStorage('buzz:buzzerSound', selectedBuzzerSound.value);
    void requestScreenWakeLock();

    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3456';
    socket?.disconnect();
    socket = io(serverUrl);

    socket.on('connect', () => {
      const savedToken = safeGetStorage(`buzz:token:${code}`, '') || undefined;
      const savedUserId = safeGetStorage('buzz:userId', '') || undefined;
      socket?.emit('controller:join', {
        roomCode: code,
        userId: savedUserId,
        guestName: guestNameInput.value.trim() || undefined,
        avatarPreset: selectedAvatarPreset.value,
        buzzerSound: selectedBuzzerSound.value,
        reconnectToken: savedToken,
      });
    });

    socket.on('controller:joined', (payload) => {
      isJoined.value = true;
      assignedSlotIndex.value = payload.slotIndex;
      displayName.value = payload.displayName;
      safeSetStorage(`buzz:token:${code}`, payload.reconnectToken);
      vibrate(50);
    });

    socket.on('controller:state_sync', (state) => {
      applyStateSync(state);
    });
  }

  function pressRed() {
    vibrate(50);
    socket?.emit('controller:press_red', { clientSentAt: Date.now() });
  }

  function pressColor(color: BuzzerColor) {
    if (!activeColors.value[color]) return;
    vibrate(40);
    socket?.emit('controller:press_color', { color, clientSentAt: Date.now() });
  }

  function disconnect() {
    void wakeLockSentinel?.release();
    wakeLockSentinel = null;
    socket?.disconnect();
    socket = null;
  }

  return {
    roomCodeInput,
    guestNameInput,
    selectedAvatarPreset,
    selectedBuzzerSound,
    isJoined,
    assignedSlotIndex,
    displayName,
    phase,
    redLedMode,
    activeColors,
    statusBanner,
    applyStateSync,
    connectToRoom,
    pressRed,
    pressColor,
    requestScreenWakeLock,
    disconnect,
  };
});
