<template>
  <div
    class="h-44 rounded-2xl border-2 flex flex-col items-center justify-between p-2.5 transition-all duration-150 relative overflow-hidden"
    :class="[
      player
        ? 'bg-slate-900/95 border-amber-400/80 shadow-lg'
        : 'bg-slate-950/40 border-slate-800/60 opacity-40',
      isFlashing ? 'scale-105 ring-4 ring-red-500 bg-red-950/60' : '',
      isTargetedByPie ? 'ring-4 ring-amber-400 animate-pulse' : '',
      player && !player.isConnected ? 'opacity-50 grayscale' : '',
    ]"
  >
    <!-- En-tête du Pupitre -->
    <div class="w-full flex items-center justify-between text-[10px] font-bold text-slate-400">
      <span>PUPITRE {{ slotIndex + 1 }}</span>
      <span v-if="player && !player.isConnected" class="text-red-400">HORS-LIGNE</span>
      <span v-else-if="isBombHolder" class="text-amber-300 animate-bounce">💣 BOMBE</span>
      <span v-else-if="isTargetedByPie" class="text-amber-300">🎯 VISÉ</span>
    </div>

    <!-- Canvas Avatar 2.5D Rive -->
    <div v-if="player" class="flex flex-col items-center gap-1 w-full">
      <div class="relative w-16 h-16">
        <canvas ref="canvasRef" width="128" height="128" class="w-full h-full block" />
        <div
          v-if="scoreDelta !== undefined && scoreDelta !== 0"
          class="absolute -top-1 -right-3 px-1.5 py-0.5 rounded-full text-[10px] font-black shadow"
          :class="scoreDelta > 0 ? 'bg-emerald-400 text-black' : 'bg-red-500 text-white'"
        >
          {{ scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta }}
        </div>
      </div>

      <div class="font-black text-xs truncate max-w-[115px] text-white">
        {{ presetInfo.emoji }} {{ player.displayName }}
      </div>
      <div class="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
        {{ stateLabel }}
      </div>

      <!-- Indicateurs contextuels de manche (Vies, Mise, Thermomètre, Pilier) -->
      <div v-if="player.roundMeta" class="flex items-center gap-1 text-[10px] text-slate-300">
        <span v-if="player.roundMeta.lives !== undefined">
          {{ '❤️'.repeat(Math.max(0, player.roundMeta.lives)) || '💀 ÉLIMINÉ' }}
        </span>
        <span v-if="player.roundMeta.stakeBet !== undefined" class="text-amber-300 font-mono">
          Mise: {{ player.roundMeta.stakeBet }}
        </span>
        <span v-if="player.roundMeta.thermometer !== undefined" class="text-orange-400 font-mono">
          🌡️ {{ player.roundMeta.thermometer }}/6
        </span>
        <span v-if="player.roundMeta.pillarHeightSec !== undefined" class="text-cyan-300 font-mono">
          ⏱️ {{ player.roundMeta.pillarHeightSec.toFixed(1) }}s
        </span>
      </div>
    </div>

    <div v-else class="flex-1 flex items-center justify-center text-xs text-slate-600">
      Libre
    </div>

    <!-- Pied du Pupitre : Score -->
    <div
      class="w-full text-center font-mono font-black text-sm py-0.5 rounded-lg bg-slate-950/80 border border-slate-800 text-white"
    >
      {{ player?.score ?? 0 }} PTS
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Rive, StateMachineInput } from '@rive-app/canvas';
import type { AvatarPreset, PlayerSlotState } from '@buzz/shared';
import { AVATAR_PRESET_LABELS } from '../services/soundManager.js';

const props = defineProps<{
  slotIndex: number;
  player?: PlayerSlotState;
  isFlashing?: boolean;
  isTargetedByPie?: boolean;
  isBombHolder?: boolean;
  activeTrigger?: 'Hit_Pie' | 'Bomb_Hold' | 'Bomb_Explode' | 'Slime_Drop';
  scoreDelta?: number;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let riveInstance: Rive | null = null;
let riveStateInput: StateMachineInput | null = null;

const presetInfo = computed(() => {
  const key = (props.player?.avatarPreset ?? 'rocker') as AvatarPreset;
  return AVATAR_PRESET_LABELS[key] ?? { label: 'Rockstar', emoji: '🎸' };
});

const stateLabel = computed(() => {
  const state = props.player?.riveState ?? 0;
  const labels: Record<number, string> = {
    0: 'Prêt',
    1: 'Réfléchit...',
    2: 'Verrouillé !',
    3: 'BUZZ !',
    4: 'Gagné ! 🎉',
    5: 'Raté ! 💀',
    6: 'TAUNT ! 😜',
  };
  return labels[state] ?? 'Prêt';
});

function drawAvatarCanvas25D() {
  const canvas = canvasRef.value;
  if (!canvas || !props.player) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, 128, 128);
  const color = props.player.avatarColor || '#0066FF';
  const state = props.player.riveState ?? 0;

  // Aura selon état Rive
  ctx.fillStyle =
    state === 3
      ? 'rgba(239, 68, 68, 0.45)'
      : state === 4
        ? 'rgba(16, 185, 129, 0.45)'
        : state === 6
          ? 'rgba(245, 158, 11, 0.45)'
          : 'rgba(30, 41, 59, 0.6)';
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fill();

  // Corps & Épaules
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(30, 74, 68, 44, 16);
  ctx.fill();

  // Tête 2.5D
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.arc(64, 48, 26, 0, Math.PI * 2);
  ctx.fill();

  // Effet spécial actif (Tarte à la crème / Explosion Bombe)
  if (props.activeTrigger === 'Hit_Pie') {
    ctx.fillStyle = '#fffbeb';
    ctx.beginPath();
    ctx.arc(64, 50, 24, 0, Math.PI * 2);
    ctx.fill();
  } else if (props.activeTrigger === 'Bomb_Explode') {
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.arc(64, 50, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  // Emoji du costume centré
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(presetInfo.value.emoji, 64, 48);
}

onMounted(() => {
  drawAvatarCanvas25D();
  if (!canvasRef.value) return;

  try {
    riveInstance = new Rive({
      src: '/rive/avatar_master.riv',
      canvas: canvasRef.value,
      artboard: props.player?.avatarPreset ?? 'rocker',
      stateMachines: 'Avatar_Gameplay_SM',
      autoplay: true,
      onLoad: () => {
        const inputs = riveInstance?.stateMachineInputs('Avatar_Gameplay_SM') ?? [];
        riveStateInput = inputs.find((i) => i.name === 'state') ?? null;
      },
      onLoadError: () => {
        drawAvatarCanvas25D();
      },
    });
  } catch {
    drawAvatarCanvas25D();
  }
});

watch(
  () => [props.player?.riveState, props.player?.avatarPreset, props.activeTrigger] as const,
  ([newState, , trigger]) => {
    if (riveStateInput && newState !== undefined) {
      riveStateInput.value = newState;
    }
    if (trigger && riveInstance) {
      const inputs = riveInstance.stateMachineInputs('Avatar_Gameplay_SM') ?? [];
      const trigInput = inputs.find((i) => i.name === trigger);
      trigInput?.fire();
    }
    drawAvatarCanvas25D();
  }
);

onUnmounted(() => {
  // RIVE-01 : Nettoyage strict de l'instance Rive à la destruction du composant
  riveInstance?.cleanup();
  riveInstance = null;
});
</script>
