<template>
  <!-- Section 2.1 : Verrouillé portrait plein écran 100dvh, touch-action: manipulation, aucun texte de question -->
  <div
    class="w-screen h-dvh flex flex-col bg-zinc-950 select-none overflow-hidden"
    style="touch-action: manipulation"
  >
    <!-- Écran d'entrée rapide si pas encore connecté au salon -->
    <div
      v-if="!isJoined"
      class="flex-1 flex flex-col items-center justify-center p-6 gap-4"
    >
      <h1 class="text-2xl font-black tracking-wider text-amber-400">BUZZ! CONTROLLER</h1>
      <input
        v-model="roomCodeInput"
        maxlength="4"
        placeholder="CODE SALON (ex: ABCD)"
        class="w-full max-w-xs text-center text-2xl font-mono uppercase bg-zinc-900 border-2 border-zinc-700 rounded-xl py-3 text-white"
      />
      <input
        v-model="guestNameInput"
        maxlength="20"
        placeholder="Ton Pseudo"
        class="w-full max-w-xs text-center text-lg bg-zinc-900 border-2 border-zinc-700 rounded-xl py-3 text-white"
      />
      <button
        @click="connectToRoom"
        class="w-full max-w-xs bg-red-600 active:bg-red-700 text-white font-bold py-4 rounded-xl text-xl shadow-lg"
      >
        REJOINDRE LE SALON
      </button>
    </div>

    <!-- Contrôleur Buzzer Virtuel officiel (Section 2.1) -->
    <template v-else>
      <!-- Moitié supérieure (40 % de la hauteur) : Gros Bouton Rouge circulaire + Anneau LED -->
      <div class="h-[40dvh] w-full flex flex-col items-center justify-center relative p-4 bg-zinc-900/80 border-b-4 border-zinc-800">
        <div class="text-xs font-bold tracking-widest uppercase text-zinc-400 mb-2">
          {{ statusBanner }}
        </div>

        <button
          @pointerdown.prevent="onPressRed"
          class="w-44 h-44 rounded-full bg-gradient-to-b from-red-500 to-red-700 active:scale-95 transition-transform flex items-center justify-center shadow-2xl"
          :class="ledRingClasses"
          aria-label="Buzzer Rouge"
        >
          <span class="w-36 h-36 rounded-full bg-red-600/90 border-4 border-red-400/50 shadow-inner" />
        </button>
      </div>

      <!-- Moitié inférieure (60 % de la hauteur) : Empilement vertical strict des 4 boutons colorés -->
      <div class="h-[60dvh] w-full flex flex-col p-3 gap-2.5 bg-zinc-950">
        <button
          v-for="btn in BUZZER_COLORS"
          :key="btn.index"
          @pointerdown.prevent="onPressColor(btn.index)"
          :disabled="!activeColors[btn.index]"
          class="flex-1 w-full rounded-2xl transition-transform active:scale-[0.98] shadow-lg border-b-4 border-black/40"
          :style="{
            backgroundColor: btn.hex,
            opacity: activeColors[btn.index] ? 1 : 0.25,
          }"
          :aria-label="btn.label"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { io, type Socket } from 'socket.io-client';
import {
  BUZZER_COLORS,
  type BuzzerColor,
  type ControllerToServerEvents,
  type RedLedMode,
  type ServerToControllerEvents,
} from '@buzz/shared';

const route = useRoute();
const roomCodeInput = ref(((route.query.room as string) || '').toUpperCase());
const guestNameInput = ref(localStorage.getItem('buzz:guestName') || '');
const isJoined = ref(false);

const redLedMode = ref<RedLedMode>('PULSE_READY');
const activeColors = ref<[boolean, boolean, boolean, boolean]>([true, true, true, true]);
const statusBanner = ref('REGARDEZ LA TÉLÉVISION');

let socket: Socket<ServerToControllerEvents, ControllerToServerEvents> | null = null;
let wakeLockSentinel: WakeLockSentinel | null = null;

const ledRingClasses = computed(() => {
  switch (redLedMode.value) {
    case 'PULSE_READY':
      return 'ring-8 ring-red-400/80 animate-pulse';
    case 'SOLID_LOCKED':
      return 'ring-8 ring-white shadow-[0_0_40px_#ffffff]';
    case 'AIM_TRIGGER':
      return 'ring-8 ring-amber-400 animate-ping';
    case 'OFF':
    default:
      return 'ring-4 ring-zinc-800 opacity-60';
  }
});

async function requestScreenWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    }
  } catch {
    // Non bloquant si refusé par l'OS
  }
}

function vibrate(pattern: number | number[] = 50) {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

function connectToRoom() {
  const code = roomCodeInput.value.trim().toUpperCase();
  if (code.length !== 4) return;

  localStorage.setItem('buzz:guestName', guestNameInput.value);
  requestScreenWakeLock();

  const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3456';
  socket = io(serverUrl);

  socket.on('connect', () => {
    const savedToken = localStorage.getItem(`buzz:token:${code}`) || undefined;
    socket?.emit('controller:join', {
      roomCode: code,
      guestName: guestNameInput.value || undefined,
      reconnectToken: savedToken,
    });
  });

  socket.on('controller:joined', (payload) => {
    isJoined.value = true;
    localStorage.setItem(`buzz:token:${code}`, payload.reconnectToken);
    vibrate(50);
  });

  socket.on('controller:state_sync', (state) => {
    redLedMode.value = state.redLedMode;
    activeColors.value = state.activeColors;
    statusBanner.value = state.statusBanner;
    if (state.hapticPattern) {
      vibrate(state.hapticPattern);
    }
  });
}

function onPressRed() {
  vibrate(50);
  socket?.emit('controller:press_red', { clientSentAt: Date.now() });
}

function onPressColor(color: BuzzerColor) {
  if (!activeColors.value[color]) return;
  vibrate(40);
  socket?.emit('controller:press_color', { color, clientSentAt: Date.now() });
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && isJoined.value) {
    requestScreenWakeLock();
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  if (roomCodeInput.value.length === 4 && localStorage.getItem(`buzz:token:${roomCodeInput.value}`)) {
    connectToRoom();
  }
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  wakeLockSentinel?.release();
  socket?.disconnect();
});
</script>
