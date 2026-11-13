<template>
  <div class="flex items-center gap-4 bg-slate-950/90 border border-slate-800 rounded-2xl p-3">
    <div class="bg-white p-2 rounded-xl shadow-md shrink-0">
      <svg
        :width="size"
        :height="size"
        viewBox="0 0 21 21"
        shape-rendering="crispEdges"
        aria-label="QR Code Salon"
      >
        <rect width="21" height="21" fill="#ffffff" />
        <template v-for="(row, rIdx) in matrix" :key="rIdx">
          <template v-for="(cell, cIdx) in row" :key="`${rIdx}-${cIdx}`">
            <rect
              v-if="cell"
              :x="cIdx"
              :y="rIdx"
              width="1"
              height="1"
              fill="#090d16"
            />
          </template>
        </template>
      </svg>
    </div>

    <div class="flex flex-col">
      <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        SCANNEZ EN 4G/5G OU WI-FI
      </span>
      <span class="text-3xl font-black text-amber-400 tracking-widest leading-none my-1">
        {{ roomCode }}
      </span>
      <a
        v-if="joinUrl"
        :href="joinUrl"
        target="_blank"
        class="text-xs font-mono text-amber-300 underline hover:text-amber-200 truncate max-w-[230px]"
      >
        {{ joinUrl }} ↗
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { generateQrMatrix } from '../services/soundManager.js';

const props = withDefaults(
  defineProps<{
    roomCode: string;
    joinUrl: string;
    size?: number;
  }>(),
  {
    size: 72,
  }
);

const matrix = computed(() =>
  generateQrMatrix(props.joinUrl || `https://buzz.web/controller?room=${props.roomCode}`)
);
</script>
