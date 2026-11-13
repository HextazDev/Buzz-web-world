<template>
  <div class="w-full max-w-5xl flex flex-col items-center gap-5">
    <!-- Bandeau de Manche & Sous-Thème -->
    <div class="flex items-center gap-3 flex-wrap justify-center">
      <span
        v-if="currentRoundType"
        class="px-4 py-1 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-black uppercase tracking-widest"
      >
        MANCHE {{ question.roundNumber }} • {{ currentRoundType }}
      </span>
      <span
        class="px-4 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 text-xs font-bold"
      >
        Thème : {{ question.subTheme }}
      </span>
      <span
        class="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-mono"
      >
        Format : {{ question.format }}
      </span>
    </div>

    <!-- Intitulé de la Question -->
    <h2 class="text-2xl md:text-4xl font-black text-center leading-tight max-w-4xl">
      {{ question.prompt }}
    </h2>

    <!-- Support Média selon les 4 formats (MASTER_RFC §3) -->
    <div
      v-if="question.format === 'IMAGE_STANDARD' && question.mediaUrl"
      class="w-full max-w-md h-52 rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-950 flex items-center justify-center shadow-xl"
    >
      <img
        :src="question.mediaUrl"
        :alt="question.subTheme"
        class="w-full h-full object-contain"
      />
    </div>

    <!-- Format IMAGE_REVEAL : Dévoilement progressif pixelisé sur 8 secondes -->
    <div
      v-else-if="question.format === 'IMAGE_REVEAL'"
      class="w-full max-w-md h-52 rounded-2xl overflow-hidden border-2 border-amber-400/60 bg-slate-950 flex flex-col items-center justify-center relative shadow-xl"
    >
      <canvas ref="revealCanvasRef" width="360" height="200" class="w-full h-full block" />
      <div class="absolute bottom-2 right-3 px-2.5 py-0.5 rounded-full bg-black/70 text-[11px] font-mono text-amber-300">
        Dévoilement : {{ Math.round(revealProgress * 100) }}%
      </div>
    </div>

    <!-- Format AUDIO_CLIP : Extrait sonore synchronisé (5 à 15 s) -->
    <div
      v-else-if="question.format === 'AUDIO_CLIP'"
      class="w-full max-w-lg py-4 px-6 rounded-2xl border-2 border-cyan-400/50 bg-slate-950/90 flex items-center justify-between gap-4 shadow-xl"
    >
      <div class="flex items-center gap-3">
        <span class="text-3xl animate-pulse">🎵</span>
        <div>
          <div class="text-xs font-bold uppercase tracking-wider text-cyan-300">
            Extrait Audio Synchronisé
          </div>
          <div class="text-xs text-slate-400">Écoutez attentivement le téléviseur !</div>
        </div>
      </div>
      <audio
        v-if="question.mediaUrl"
        :src="question.mediaUrl"
        autoplay
        controls
        class="h-8 max-w-[200px]"
      />
    </div>

    <!-- Grille des 4 couleurs officielles (Bleu, Orange, Vert, Jaune) -->
    <div class="grid grid-cols-2 gap-4 w-full mt-1">
      <div
        v-for="(choice, idx) in question.choices"
        :key="idx"
        class="p-5 rounded-2xl font-black text-xl flex items-center gap-4 border-4 transition-all duration-200"
        :style="{
          backgroundColor: BUZZER_COLORS[idx]!.hex,
          opacity:
            revealedCorrectIndex === null || revealedCorrectIndex === idx ? 1 : 0.25,
          transform: revealedCorrectIndex === idx ? 'scale(1.03)' : 'scale(1)',
        }"
        :class="
          revealedCorrectIndex === idx
            ? 'border-white shadow-[0_0_30px_#ffffff]'
            : 'border-black/30'
        "
      >
        <span class="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center text-sm shrink-0">
          {{ idx + 1 }}
        </span>
        <span class="drop-shadow truncate">{{ choice }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { BUZZER_COLORS, type BuzzerColor, type RoundType } from '@buzz/shared';
import type { ActiveHostQuestion } from '../stores/useHostStore.js';

const props = defineProps<{
  question: ActiveHostQuestion;
  currentRoundType?: RoundType;
  revealedCorrectIndex: BuzzerColor | null;
}>();

const revealCanvasRef = ref<HTMLCanvasElement | null>(null);
const revealProgress = ref(0);
let revealRafId: number | null = null;
let loadedImage: HTMLImageElement | null = null;

function startImageReveal8Seconds() {
  if (revealRafId) cancelAnimationFrame(revealRafId);
  revealProgress.value = 0;

  if (props.question.format !== 'IMAGE_REVEAL') return;

  const startMs = performance.now();
  const durationMs = 8000;

  if (props.question.mediaUrl && typeof Image !== 'undefined') {
    loadedImage = new Image();
    loadedImage.crossOrigin = 'anonymous';
    loadedImage.src = props.question.mediaUrl;
  } else {
    loadedImage = null;
  }

  const renderStep = (nowMs: number) => {
    const elapsed = Math.max(0, nowMs - startMs);
    const progress =
      props.revealedCorrectIndex !== null ? 1 : Math.min(1, elapsed / durationMs);
    revealProgress.value = progress;

    const canvas = revealCanvasRef.value;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Taille des blocs de pixelisation : de 36px (0%) à 1px (100%)
        const blockSize = Math.max(1, Math.round((1 - progress) * 35) + 1);
        const cols = Math.ceil(w / blockSize);
        const rows = Math.ceil(h / blockSize);

        if (loadedImage && loadedImage.complete && loadedImage.naturalWidth > 0) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(loadedImage, 0, 0, cols, rows);
          ctx.drawImage(canvas, 0, 0, cols, rows, 0, 0, w, h);
        } else {
          // Motif mosaïque procédural si aucune URL externe n'est fournie
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const hue = ((r * 37 + c * 53) % 360);
              ctx.fillStyle = `hsl(${hue}, 75%, 50%)`;
              ctx.fillRect(c * blockSize, r * blockSize, blockSize, blockSize);
            }
          }
        }
      }
    }

    if (progress < 1) {
      revealRafId = requestAnimationFrame(renderStep);
    }
  };

  revealRafId = requestAnimationFrame(renderStep);
}

onMounted(() => {
  startImageReveal8Seconds();
});

watch(
  () => [props.question.questionId, props.question.format] as const,
  () => {
    startImageReveal8Seconds();
  }
);

onUnmounted(() => {
  if (revealRafId) {
    cancelAnimationFrame(revealRafId);
    revealRafId = null;
  }
});
</script>
