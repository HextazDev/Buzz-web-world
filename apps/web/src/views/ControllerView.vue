<template>
  <!-- Section 2.1 : Verrouillé portrait plein écran 100dvh, touch-action: manipulation, aucun texte de question (CTRL-01) -->
  <div
    class="w-screen h-dvh flex flex-col bg-zinc-950 select-none overflow-hidden text-white"
    style="touch-action: manipulation"
  >
    <!-- Écran d'entrée & Personnalisation Costume/Son (12 presets + 12 sons) -->
    <div
      v-if="!controller.isJoined"
      class="flex-1 flex flex-col items-center justify-center p-5 gap-3.5 overflow-y-auto"
    >
      <div class="text-xs font-bold uppercase tracking-widest text-amber-400/80">
        Manette Officielle • Zéro Question à l'Écran
      </div>
      <h1 class="text-2xl font-black tracking-wider text-amber-400">BUZZ! CONTROLLER</h1>

      <input
        v-model="controller.roomCodeInput"
        maxlength="4"
        placeholder="CODE SALON (ex: ABCD)"
        class="w-full max-w-xs text-center text-2xl font-mono uppercase bg-zinc-900 border-2 border-zinc-700 rounded-xl py-2.5 text-white"
      />
      <input
        v-model="controller.guestNameInput"
        maxlength="20"
        placeholder="Ton Pseudo"
        class="w-full max-w-xs text-center text-base bg-zinc-900 border-2 border-zinc-700 rounded-xl py-2.5 text-white"
      />

      <!-- Sélection des 12 Costumes (AVATAR_PRESETS) -->
      <div class="w-full max-w-xs">
        <label class="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
          Costume de Scène (12 choix)
        </label>
        <select
          v-model="controller.selectedAvatarPreset"
          class="w-full bg-zinc-900 border-2 border-zinc-700 rounded-xl py-2.5 px-3 text-sm font-bold text-white"
        >
          <option v-for="preset in AVATAR_PRESETS" :key="preset" :value="preset">
            {{ AVATAR_PRESET_LABELS[preset]?.emoji }} {{ AVATAR_PRESET_LABELS[preset]?.label }}
          </option>
        </select>
      </div>

      <!-- Sélection des 12 Sons de Buzzer (BUZZER_SOUNDS) -->
      <div class="w-full max-w-xs">
        <label class="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
          Son du Buzzer Rouge (12 choix)
        </label>
        <select
          v-model="controller.selectedBuzzerSound"
          class="w-full bg-zinc-900 border-2 border-zinc-700 rounded-xl py-2.5 px-3 text-sm font-bold text-white"
        >
          <option v-for="snd in BUZZER_SOUNDS" :key="snd" :value="snd">
            🔊 {{ BUZZER_SOUND_PROFILES[snd]?.label }}
          </option>
        </select>
      </div>

      <button
        @click="controller.connectToRoom()"
        class="w-full max-w-xs bg-red-600 active:bg-red-700 text-white font-black py-3.5 rounded-xl text-lg shadow-lg mt-1 cursor-pointer"
      >
        REJOINDRE LE SALON
      </button>
    </div>

    <!-- Contrôleur Buzzer Virtuel officiel (Section 2.1 : 40% Haut Rouge / 60% Bas 4 Couleurs) -->
    <template v-else>
      <!-- Moitié supérieure (40 % de la hauteur) : Gros Bouton Rouge circulaire + Anneau LED -->
      <div class="h-[40dvh] w-full flex flex-col items-center justify-center relative p-4 bg-zinc-900/80 border-b-4 border-zinc-800">
        <div class="text-[11px] font-bold tracking-widest uppercase text-amber-300 text-center mb-2 px-2">
          PUPITRE {{ (controller.assignedSlotIndex ?? 0) + 1 }} • {{ controller.statusBanner }}
        </div>

        <button
          @pointerdown.prevent="controller.pressRed()"
          class="w-44 h-44 rounded-full bg-gradient-to-b from-red-500 to-red-700 active:scale-95 transition-transform flex items-center justify-center shadow-2xl"
          :class="ledRingClasses"
          aria-label="Buzzer Rouge"
        >
          <span class="w-36 h-36 rounded-full bg-red-600/90 border-4 border-red-400/50 shadow-inner flex items-center justify-center font-black text-xs tracking-widest text-red-100/80 uppercase">
            {{ controller.redLedMode === 'AIM_TRIGGER' ? '🎯 TIRER !' : 'BUZZ!' }}
          </span>
        </button>
      </div>

      <!-- Moitié inférieure (60 % de la hauteur) : Empilement vertical strict des 4 boutons colorés -->
      <div class="h-[60dvh] w-full flex flex-col p-3 gap-2.5 bg-zinc-950">
        <button
          v-for="btn in BUZZER_COLORS"
          :key="btn.index"
          @pointerdown.prevent="controller.pressColor(btn.index)"
          :disabled="!controller.activeColors[btn.index]"
          class="flex-1 w-full rounded-2xl transition-transform active:scale-[0.98] shadow-lg border-b-4 border-black/40"
          :style="{
            backgroundColor: btn.hex,
            opacity: controller.activeColors[btn.index] ? 1 : 0.25,
          }"
          :aria-label="btn.label"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { AVATAR_PRESETS, BUZZER_COLORS, BUZZER_SOUNDS } from '@buzz/shared';
import { AVATAR_PRESET_LABELS, BUZZER_SOUND_PROFILES } from '../services/soundManager.js';
import { useControllerStore } from '../stores/useControllerStore.js';

const route = useRoute();
const controller = useControllerStore();

const ledRingClasses = computed(() => {
  switch (controller.redLedMode) {
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

function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && controller.isJoined) {
    void controller.requestScreenWakeLock();
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  const queryRoom = ((route.query.room as string) || '').trim().toUpperCase();
  if (queryRoom.length === 4) {
    controller.roomCodeInput = queryRoom;
    if (localStorage.getItem(`buzz:token:${queryRoom}`)) {
      controller.connectToRoom(queryRoom);
    }
  }
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  controller.disconnect();
});
</script>
