<template>
  <div class="flex items-center gap-4 bg-slate-950/90 px-4 py-2.5 rounded-2xl border border-slate-800 max-w-xl">
    <div class="text-right">
      <div class="flex items-center justify-end gap-2">
        <span class="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
          Présentateur IA 2.5D • {{ moodLabel }}
        </span>
        <span
          class="w-2 h-2 rounded-full"
          :class="isSpeaking ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'"
        />
      </div>
      <div class="text-sm text-slate-100 italic line-clamp-2">« {{ subtitleText }} »</div>
    </div>

    <div class="relative w-16 h-16 rounded-2xl bg-gradient-to-b from-indigo-900/70 to-slate-950 border-2 border-indigo-400/70 overflow-hidden shrink-0 shadow-lg">
      <canvas ref="canvasRef" width="128" height="128" class="w-full h-full block" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Rive, StateMachineInput } from '@rive-app/canvas';
import type { PresenterMood } from '@buzz/shared';

const props = defineProps<{
  subtitleText: string;
  mood: PresenterMood;
  mouthOpen: number;
  isSpeaking: boolean;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let riveInstance: Rive | null = null;
let riveMouthInput: StateMachineInput | null = null;
let riveMoodInput: StateMachineInput | null = null;
let riveSpeakingInput: StateMachineInput | null = null;
let fallbackRafId: number | null = null;
let usingFallbackCanvas = true;

const moodLabel = computed(() => {
  switch (props.mood) {
    case 1:
      return 'Moqueur';
    case 2:
      return 'Choqué';
    case 3:
      return 'Déçu';
    case 4:
      return 'Showman';
    case 0:
    default:
      return 'Studio';
  }
});

function renderFallbackPresenter25D() {
  const canvas = canvasRef.value;
  if (!canvas || !usingFallbackCanvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, 128, 128);

  // Halo projecteur TV
  const grad = ctx.createRadialGradient(64, 58, 8, 64, 64, 60);
  grad.addColorStop(0, props.isSpeaking ? 'rgba(251, 191, 36, 0.45)' : 'rgba(99, 102, 241, 0.3)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  // Costume smoking & noeud papillon
  ctx.fillStyle = '#1e1b4b';
  ctx.beginPath();
  ctx.roundRect(26, 86, 76, 40, 14);
  ctx.fill();

  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.moveTo(52, 92);
  ctx.lineTo(76, 104);
  ctx.lineTo(76, 92);
  ctx.lineTo(52, 104);
  ctx.closePath();
  ctx.fill();

  // Visage 2.5D
  ctx.fillStyle = '#fcd34d';
  ctx.beginPath();
  ctx.roundRect(36, 26, 56, 58, 22);
  ctx.fill();

  // Cheveux banane TV Show
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.roundRect(32, 14, 64, 20, 10);
  ctx.fill();

  // Lunettes / Yeux selon mood
  ctx.fillStyle = '#0f172a';
  const eyeHeight = props.mood === 2 ? 10 : props.mood === 3 ? 4 : 7;
  ctx.beginPath();
  ctx.ellipse(52, 48, 6, eyeHeight, 0, 0, Math.PI * 2);
  ctx.ellipse(76, 48, 6, eyeHeight, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bouche Lip-Sync 60 FPS (mouthOpen: 0.0 -> 1.0)
  const openPx = Math.max(3, Math.round(props.mouthOpen * 22));
  ctx.fillStyle = '#991b1b';
  ctx.beginPath();
  ctx.roundRect(48, 64 - Math.floor(openPx / 3), 32, openPx, 6);
  ctx.fill();

  fallbackRafId = requestAnimationFrame(renderFallbackPresenter25D);
}

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  try {
    riveInstance = new Rive({
      src: '/rive/host_presenter.riv',
      canvas,
      stateMachines: 'Presenter_SM',
      autoplay: true,
      onLoad: () => {
        usingFallbackCanvas = false;
        const inputs = riveInstance?.stateMachineInputs('Presenter_SM') ?? [];
        riveMouthInput = inputs.find((i) => i.name === 'mouthOpen') ?? null;
        riveMoodInput = inputs.find((i) => i.name === 'mood') ?? null;
        riveSpeakingInput = inputs.find((i) => i.name === 'isSpeaking') ?? null;
      },
      onLoadError: () => {
        usingFallbackCanvas = true;
      },
    });
  } catch {
    usingFallbackCanvas = true;
  }

  fallbackRafId = requestAnimationFrame(renderFallbackPresenter25D);
});

watch(
  () => [props.mouthOpen, props.mood, props.isSpeaking] as const,
  ([mouth, mood, speaking]) => {
    if (riveMouthInput) riveMouthInput.value = mouth;
    if (riveMoodInput) riveMoodInput.value = mood;
    if (riveSpeakingInput) riveSpeakingInput.value = speaking;
  }
);

onUnmounted(() => {
  // RIVE-01 : Nettoyage strict WebGL/Canvas et boucle RAF
  if (fallbackRafId) {
    cancelAnimationFrame(fallbackRafId);
    fallbackRafId = null;
  }
  riveInstance?.cleanup();
  riveInstance = null;
});
</script>
