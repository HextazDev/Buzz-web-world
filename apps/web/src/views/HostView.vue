<template>
  <div class="w-screen h-screen bg-gradient-to-b from-indigo-950 via-slate-950 to-black text-white flex flex-col justify-between p-6 overflow-hidden">
    <!-- Écran d'accueil : Déverrouillage AudioContext obligatoire sur la TV -->
    <div
      v-if="!isShowStarted"
      class="flex-1 flex flex-col items-center justify-center gap-6"
    >
      <div class="px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-400/30 text-amber-300 text-xs font-bold uppercase tracking-widest">
        Plateau TV 1080p/4K • Temps Réel Socket.io
      </div>
      <h1 class="text-6xl font-black tracking-tight text-amber-400 drop-shadow-lg">
        BUZZ! WEB WORLD
      </h1>
      <p class="text-slate-300 text-lg max-w-xl text-center">
        Transformez votre téléviseur en plateau de jeu télévisé et utilisez vos smartphones comme buzzers.
      </p>
      <button
        @click="initializeTvShow"
        class="px-8 py-5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xl shadow-2xl transition cursor-pointer"
      >
        OUVRIR LE PLATEAU TV (ACTIVER AUDIO & SHOW)
      </button>
    </div>

    <!-- Plateau TV Maître -->
    <template v-else>
      <!-- Bandeau Supérieur : Salon, Lien Contrôleur & Présentateur IA -->
      <header class="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-2xl p-4 gap-4">
        <div class="flex items-center gap-6">
          <div>
            <div class="text-[11px] uppercase tracking-widest text-slate-400">CODE SALON</div>
            <div class="text-4xl font-black text-amber-400 tracking-widest">{{ roomCode }}</div>
          </div>
          <div class="border-l border-slate-800 pl-6">
            <div class="text-xs text-slate-400">Ouvrir un Buzzer Smartphone de test :</div>
            <a
              :href="joinUrl"
              target="_blank"
              class="text-sm font-mono text-amber-300 underline hover:text-amber-200"
            >
              {{ joinUrl }} ↗
            </a>
          </div>
        </div>

        <!-- Présentateur IA & Lip-Sync 60 FPS -->
        <div class="flex items-center gap-4 bg-slate-950 px-5 py-3 rounded-xl border border-slate-800 max-w-xl">
          <div class="text-right">
            <div class="text-xs font-bold text-indigo-400 uppercase tracking-wider">
              Présentateur IA • Lip-Sync 60 FPS
            </div>
            <div class="text-sm text-slate-200 italic">« {{ presenterSubtitle }} »</div>
          </div>
          <div class="w-12 h-12 rounded-full bg-indigo-600/30 border-2 border-indigo-400 flex items-center justify-center shrink-0">
            <div
              class="w-6 bg-amber-400 rounded-full transition-all duration-75"
              :style="{ height: `${Math.max(6, Math.round(mouthOpen * 36))}px` }"
            />
          </div>
        </div>

        <button
          @click="startOrNextQuestion"
          class="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm uppercase tracking-wider shadow-lg cursor-pointer shrink-0"
        >
          {{ currentQuestion ? 'Question Suivante ▶' : 'Lancer Manche 1 ▶' }}
        </button>
      </header>

      <!-- Scène Centrale : Lobby ou Question Active -->
      <main class="flex-1 flex flex-col items-center justify-center my-4 bg-slate-900/50 border-2 border-slate-800/80 rounded-3xl p-8 relative">
        <div class="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
          PHASE : {{ currentPhase }}
        </div>

        <!-- Mode Question Active ou Révélation -->
        <div v-if="currentQuestion" class="w-full max-w-4xl flex flex-col items-center gap-6">
          <div class="px-4 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 text-sm font-bold">
            Thème : {{ currentQuestion.subTheme }}
          </div>

          <h2 class="text-3xl md:text-4xl font-black text-center leading-tight">
            {{ currentQuestion.prompt }}
          </h2>

          <!-- Grille des 4 couleurs officielles (Bleu, Orange, Vert, Jaune) -->
          <div class="grid grid-cols-2 gap-4 w-full mt-2">
            <div
              v-for="(choice, idx) in currentQuestion.choices"
              :key="idx"
              class="p-5 rounded-2xl font-black text-xl flex items-center gap-4 border-4 transition-all"
              :style="{
                backgroundColor: BUZZER_COLORS[idx]!.hex,
                opacity:
                  revealedCorrectIndex === null || revealedCorrectIndex === idx ? 1 : 0.25,
                transform: revealedCorrectIndex === idx ? 'scale(1.03)' : 'scale(1)',
              }"
              :class="revealedCorrectIndex === idx ? 'border-white shadow-[0_0_30px_#ffffff]' : 'border-black/30'"
            >
              <span class="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center text-sm">
                {{ idx + 1 }}
              </span>
              <span class="drop-shadow">{{ choice }}</span>
            </div>
          </div>
        </div>

        <!-- Mode Lobby : Attente des joueurs -->
        <div v-else class="text-center space-y-3">
          <h2 class="text-4xl font-black">
            Scannez ou cliquez sur le lien pour rejoindre ({{ players.length }} / 8 pupitres)
          </h2>
          <p class="text-slate-400">
            Appuyez sur le <span class="text-red-400 font-bold">Gros Bouton Rouge</span> de votre smartphone pour tester votre Buzzer et provoquer le salon !
          </p>
        </div>
      </main>

      <!-- Rangée des 8 Pupitres Joueurs -->
      <footer class="grid grid-cols-8 gap-3">
        <div
          v-for="slot in 8"
          :key="slot - 1"
          class="h-36 rounded-2xl border-2 flex flex-col items-center justify-between p-3 transition-all duration-150"
          :class="[
            getPlayerAtSlot(slot - 1)
              ? 'bg-slate-900 border-amber-400/80 shadow-lg'
              : 'bg-slate-950/50 border-slate-800/60 opacity-40',
            flashingSlots[slot - 1] ? 'scale-105 ring-4 ring-red-500 bg-red-950/60' : '',
          ]"
        >
          <div class="text-[11px] font-bold text-slate-400">PUPITRE {{ slot }}</div>
          <div v-if="getPlayerAtSlot(slot - 1)" class="text-center">
            <div class="font-black text-base truncate max-w-[110px]">
              {{ getPlayerAtSlot(slot - 1)?.displayName }}
            </div>
            <div class="text-[11px] text-amber-300 uppercase">
              {{ riveStateLabel(getPlayerAtSlot(slot - 1)?.riveState ?? 0) }}
            </div>
          </div>
          <div v-else class="text-xs text-slate-600">Libre</div>
          <div class="font-mono font-bold text-sm text-white">
            {{ getPlayerAtSlot(slot - 1)?.score ?? 0 }} PTS
          </div>
        </div>
      </footer>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, reactive, ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import {
  BUZZER_COLORS,
  type BuzzerColor,
  type HostToServerEvents,
  type PlayerSlotState,
  type RoomPhase,
  type ServerToHostEvents,
} from '@buzz/shared';

const isShowStarted = ref(false);
const roomCode = ref('----');
const joinUrl = ref('');
const currentPhase = ref<RoomPhase>('LOBBY');
const players = ref<PlayerSlotState[]>([]);
const presenterSubtitle = ref('Bienvenue sur le plateau de Buzz! Web World !');
const mouthOpen = ref(0);
const flashingSlots = reactive<Record<number, boolean>>({});

const currentQuestion = ref<{
  questionId: string;
  subTheme: string;
  prompt: string;
  choices: [string, string, string, string];
} | null>(null);
const revealedCorrectIndex = ref<BuzzerColor | null>(null);

let socket: Socket<ServerToHostEvents, HostToServerEvents> | null = null;
let audioCtx: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let lipSyncRafId: number | null = null;

function getPlayerAtSlot(slotIndex: number): PlayerSlotState | undefined {
  return players.value.find((p) => p.slotIndex === slotIndex);
}

function riveStateLabel(state: number): string {
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
}

/**
 * Synthétise un vrai son de Buzzer TV + fait bouger la bouche du présentateur via AnalyserNode
 */
function playSynthesizedBuzzer(slotIndex: number) {
  if (!audioCtx || !analyserNode) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const freqs = [220, 277, 330, 392, 440, 523, 587, 659];
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freqs[slotIndex % freqs.length]!, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

  osc.connect(gain);
  gain.connect(analyserNode);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.35);
}

function startLipSyncLoop() {
  if (!analyserNode) return;
  const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

  const updateMouth = () => {
    if (analyserNode) {
      analyserNode.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i]! - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      mouthOpen.value = Math.min(1.0, rms * 4.5);
    }
    lipSyncRafId = requestAnimationFrame(updateMouth);
  };

  lipSyncRafId = requestAnimationFrame(updateMouth);
}

async function initializeTvShow() {
  audioCtx = new AudioContext({ sampleRate: 24000 });
  await audioCtx.resume();
  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 256;
  analyserNode.connect(audioCtx.destination);
  startLipSyncLoop();

  isShowStarted.value = true;

  const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3456';
  socket = io(serverUrl);

  socket.on('connect', () => {
    socket?.emit('host:create_room', { format: 'NORMAL' }, (res) => {
      roomCode.value = res.roomCode;
      joinUrl.value = res.joinUrl;
    });
  });

  socket.on('host:room_state', (state) => {
    currentPhase.value = state.phase;
    players.value = state.players;
  });

  socket.on('host:question_show', (q) => {
    revealedCorrectIndex.value = null;
    currentQuestion.value = {
      questionId: q.questionId,
      subTheme: q.subTheme,
      prompt: q.prompt,
      choices: q.choices,
    };
  });

  socket.on('host:question_reveal', (rev) => {
    revealedCorrectIndex.value = rev.correctIndex;
    playSynthesizedBuzzer(rev.correctIndex);
  });

  socket.on('host:avatar_trigger', ({ slotIndex, playBuzzerSound }) => {
    flashingSlots[slotIndex] = true;
    setTimeout(() => {
      flashingSlots[slotIndex] = false;
    }, 400);
    if (playBuzzerSound) {
      playSynthesizedBuzzer(slotIndex);
    }
  });

  socket.on('host:presenter_speak_start', ({ subtitleText }) => {
    presenterSubtitle.value = subtitleText;
    playSynthesizedBuzzer(2);
  });
}

function startOrNextQuestion() {
  socket?.emit('host:start_game');
}

onUnmounted(() => {
  if (lipSyncRafId) cancelAnimationFrame(lipSyncRafId);
  audioCtx?.close();
  socket?.disconnect();
});
</script>
