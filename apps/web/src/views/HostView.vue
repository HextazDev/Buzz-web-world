<template>
  <div class="w-screen h-screen bg-gradient-to-b from-indigo-950 via-slate-950 to-black text-white flex flex-col justify-between p-5 overflow-hidden">
    <!-- Écran d'accueil : Déverrouillage AudioContext obligatoire sur la TV (AUDIO-01) -->
    <div
      v-if="!host.isShowStarted"
      class="flex-1 flex flex-col items-center justify-center gap-6"
    >
      <div class="px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-400/30 text-amber-300 text-xs font-bold uppercase tracking-widest">
        Plateau TV 1080p/4K • Rive 2.5D • Cloud-First Socket.io
      </div>
      <h1 class="text-6xl font-black tracking-tight text-amber-400 drop-shadow-lg">
        BUZZ! WEB WORLD
      </h1>
      <p class="text-slate-300 text-lg max-w-xl text-center">
        Transformez votre téléviseur en plateau de jeu télévisé et utilisez vos smartphones en 4G/5G ou Wi-Fi comme buzzers.
      </p>

      <!-- Choix de la durée de partie (MASTER_RFC §4.0) -->
      <div class="flex items-center gap-3">
        <button
          v-for="fmt in formatOptions"
          :key="fmt.key"
          @click="selectedFormat = fmt.key"
          class="px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider border-2 transition cursor-pointer"
          :class="
            selectedFormat === fmt.key
              ? 'bg-amber-400 text-black border-amber-300'
              : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
          "
        >
          {{ fmt.label }}
        </button>
      </div>

      <button
        @click="host.initializeTvShow(selectedFormat)"
        class="px-8 py-5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xl shadow-2xl transition cursor-pointer"
      >
        OUVRIR LE PLATEAU TV (ACTIVER AUDIO & SHOW)
      </button>
    </div>

    <!-- Plateau TV Maître -->
    <template v-else>
      <!-- Bandeau Supérieur : QR Code Salon, Présentateur Rive 2.5D & Contrôle Hôte -->
      <header class="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-2xl p-3 gap-4">
        <RoomQrCode :room-code="host.roomCode" :join-url="host.joinUrl" :size="68" />

        <RivePresenter
          :subtitle-text="host.presenterSubtitle"
          :mood="host.presenterMood"
          :mouth-open="host.mouthOpen"
          :is-speaking="host.isPresenterSpeaking"
        />

        <div class="flex items-center gap-3 shrink-0">
          <div class="text-right hidden xl:block">
            <div class="text-[10px] uppercase tracking-widest text-slate-400">BANQUE DU SALON</div>
            <div class="text-xs font-mono text-emerald-300 font-bold">
              {{ host.roomPoolPackCount }} packs • {{ host.roomPoolQuestionCount }} questions
            </div>
          </div>

          <button
            @click="host.startOrNextQuestion()"
            class="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm uppercase tracking-wider shadow-lg cursor-pointer shrink-0"
          >
            {{ host.currentQuestion ? 'Question Suivante ▶' : 'Lancer la Partie ▶' }}
          </button>
        </div>
      </header>

      <!-- Scène Centrale : Choix du Perdant, Question Active ou Lobby -->
      <main class="flex-1 flex flex-col items-center justify-center my-3 bg-slate-900/50 border-2 border-slate-800/80 rounded-3xl p-6 relative overflow-hidden">
        <div class="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
          PHASE : {{ host.currentPhase }}
          <span v-if="host.currentRoundIndex > 0">
            • MANCHE {{ host.currentRoundIndex }} / {{ host.totalRounds }}
          </span>
        </div>

        <!-- Phase Spéciale : Choix du Perdant (LOSER_PICK_ROUND) -->
        <div
          v-if="host.currentPhase === 'LOSER_PICK_ROUND'"
          class="w-full max-w-3xl flex flex-col items-center gap-4 text-center"
        >
          <h2 class="text-3xl font-black text-amber-400">
            👑 LE CHOIX DU PERDANT !
          </h2>
          <p class="text-slate-300 text-sm">
            Le joueur au Pupitre {{ (host.loserPickerSlot ?? 0) + 1 }} choisit la prochaine épreuve sur son Buzzer coloré :
          </p>
          <div class="grid grid-cols-2 gap-3 w-full">
            <div
              v-for="(opt, idx) in host.loserPickOptions"
              :key="idx"
              class="p-4 rounded-2xl font-black text-lg flex items-center gap-3 border-2 border-white/30"
              :style="{ backgroundColor: BUZZER_COLORS[idx]?.hex ?? '#0066FF' }"
            >
              <span class="px-2.5 py-1 rounded-lg bg-black/30 text-xs">{{ idx + 1 }}</span>
              <span>{{ opt.roundType }} — {{ opt.packTitle }}</span>
            </div>
          </div>
        </div>

        <!-- Mode Question Active ou Révélation (4 Formats supportés) -->
        <QuestionStage
          v-else-if="host.currentQuestion"
          :question="host.currentQuestion"
          :current-round-type="host.currentRoundType"
          :revealed-correct-index="host.revealedCorrectIndex"
        />

        <!-- Mode Lobby : Attente des joueurs avec Grand QR Code -->
        <div v-else class="flex flex-col items-center text-center gap-5">
          <RoomQrCode :room-code="host.roomCode" :join-url="host.joinUrl" :size="132" />
          <div class="space-y-2">
            <h2 class="text-3xl md:text-4xl font-black">
              Scannez le QR Code pour rejoindre ({{ host.players.length }} / 8 pupitres)
            </h2>
            <p class="text-slate-400 max-w-2xl">
              Appuyez sur le <span class="text-red-400 font-bold">Gros Bouton Rouge</span> de votre smartphone pour tester votre Buzzer parmi les 12 sons disponibles !
            </p>
          </div>
        </div>
      </main>

      <!-- Rangée des 8 Pupitres Joueurs Rive 2.5D -->
      <footer class="grid grid-cols-8 gap-3">
        <RiveAvatarSlot
          v-for="slot in 8"
          :key="slot - 1"
          :slot-index="slot - 1"
          :player="host.getPlayerAtSlot(slot - 1)"
          :is-flashing="host.flashingSlots[slot - 1]"
          :is-targeted-by-pie="host.pieTargetCursorSlot === slot - 1"
          :is-bomb-holder="host.bombHolderSlot === slot - 1"
          :active-trigger="host.lastAvatarTrigger[slot - 1]"
          :score-delta="host.lastScoreDeltas[slot - 1]"
        />
      </footer>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { BUZZER_COLORS } from '@buzz/shared';
import QuestionStage from '../components/QuestionStage.vue';
import RiveAvatarSlot from '../components/RiveAvatarSlot.vue';
import RivePresenter from '../components/RivePresenter.vue';
import RoomQrCode from '../components/RoomQrCode.vue';
import { useHostStore } from '../stores/useHostStore.js';

const host = useHostStore();
const selectedFormat = ref<'SHORT' | 'NORMAL' | 'LONG'>('NORMAL');

const formatOptions: Array<{ key: 'SHORT' | 'NORMAL' | 'LONG'; label: string }> = [
  { key: 'SHORT', label: '⚡ Partie Courte (3 manches)' },
  { key: 'NORMAL', label: '🎬 Partie Normale (5 manches)' },
  { key: 'LONG', label: '🏆 Partie Longue (8 manches)' },
];

onUnmounted(() => {
  host.cleanup();
});
</script>
