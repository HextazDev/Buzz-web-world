import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import type {
  AwardedBuzzTitle,
  BuzzerColor,
  HostToServerEvents,
  PlayerSlotState,
  PresenterMood,
  QuestionFormat,
  RoomPhase,
  RoundType,
  ServerToHostEvents,
} from '@buzz/shared';
import { pcmStreamPlayer } from '../services/pcmStreamPlayer.js';
import { soundManager } from '../services/soundManager.js';

export interface ActiveHostQuestion {
  questionId: string;
  roundNumber: number;
  questionIndexInRound: number;
  subTheme: string;
  format: QuestionFormat;
  prompt: string;
  choices: [string, string, string, string];
  mediaUrl?: string;
  timerDurationMs: number;
}

export const useHostStore = defineStore('host', () => {
  const isShowStarted = ref(false);
  const roomCode = ref('----');
  const joinUrl = ref('');
  const currentPhase = ref<RoomPhase>('LOBBY');
  const currentRoundIndex = ref(0);
  const totalRounds = ref(5);
  const currentRoundType = ref<RoundType | undefined>(undefined);
  const loserPickerSlot = ref<number | null>(null);
  const loserPickOptions = ref<Array<{ roundType: RoundType; packTitle: string }>>([]);
  const onTheSpotTargetSlot = ref<number | null>(null);
  const bombHolderSlot = ref<number | null>(null);
  const pieTargetCursorSlot = ref<number | null>(null);
  const roomPoolPackCount = ref(2);
  const roomPoolQuestionCount = ref(24);
  const awards = ref<AwardedBuzzTitle[]>([]);
  const winnerSlot = ref<number | null>(null);

  const players = ref<PlayerSlotState[]>([]);
  const presenterSubtitle = ref('Bienvenue sur le plateau de Buzz! Web World !');
  const presenterMood = ref<PresenterMood>(0);
  const isPresenterSpeaking = ref(false);
  const mouthOpen = ref(0);

  const currentQuestion = ref<ActiveHostQuestion | null>(null);
  const revealedCorrectIndex = ref<BuzzerColor | null>(null);
  const lastScoreDeltas = ref<Record<number, number>>({});

  const flashingSlots = reactive<Record<number, boolean>>({});
  const lastAvatarTrigger = reactive<
    Record<number, 'Hit_Pie' | 'Bomb_Hold' | 'Bomb_Explode' | 'Slime_Drop' | undefined>
  >({});

  let socket: Socket<ServerToHostEvents, HostToServerEvents> | null = null;
  let lipSyncRafId: number | null = null;

  function getPlayerAtSlot(slotIndex: number): PlayerSlotState | undefined {
    return players.value.find((p) => p.slotIndex === slotIndex);
  }

  function applyRoomState(state: Parameters<ServerToHostEvents['host:room_state']>[0]) {
    roomCode.value = state.roomCode;
    currentPhase.value = state.phase;
    currentRoundIndex.value = state.currentRoundIndex;
    totalRounds.value = state.totalRounds;
    currentRoundType.value = state.currentRoundType;
    loserPickerSlot.value = state.loserPickerSlot ?? null;
    loserPickOptions.value = state.loserPickOptions ?? [];
    onTheSpotTargetSlot.value = state.onTheSpotTargetSlot ?? null;
    bombHolderSlot.value = state.bombHolderSlot ?? null;
    pieTargetCursorSlot.value = state.pieTargetCursorSlot ?? null;
    if (state.roomPoolPackCount !== undefined) roomPoolPackCount.value = state.roomPoolPackCount;
    if (state.roomPoolQuestionCount !== undefined) {
      roomPoolQuestionCount.value = state.roomPoolQuestionCount;
    }
    if (state.awards !== undefined) awards.value = state.awards;
    if (state.winnerSlot !== undefined) winnerSlot.value = state.winnerSlot;
    players.value = state.players;
  }

  function applyQuestionShow(q: Parameters<ServerToHostEvents['host:question_show']>[0]) {
    revealedCorrectIndex.value = null;
    lastScoreDeltas.value = {};
    currentQuestion.value = { ...q };

    // TIME-01 : Signal host:ready_for_timer dès que l'introduction / affichage est prêt
    setTimeout(() => {
      socket?.emit('host:ready_for_timer', {
        phase: currentPhase.value,
        questionId: q.questionId,
      });
    }, 350);
  }

  function applyQuestionReveal(rev: Parameters<ServerToHostEvents['host:question_reveal']>[0]) {
    revealedCorrectIndex.value = rev.correctIndex;
    lastScoreDeltas.value = rev.scoreDeltas;
    soundManager.playStudioEffect('Reveal');
  }

  function startLipSyncLoop() {
    const analyser = soundManager.getAnalyserNode();
    if (!analyser || typeof requestAnimationFrame === 'undefined') return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateMouth = () => {
      const activeAnalyser = soundManager.getAnalyserNode();
      if (activeAnalyser) {
        activeAnalyser.getByteTimeDomainData(dataArray);
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

  async function initializeTvShow(format: 'SHORT' | 'NORMAL' | 'LONG' | 'CUSTOM' = 'NORMAL') {
    await soundManager.unlockAudio();
    startLipSyncLoop();
    isShowStarted.value = true;

    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3456';
    socket?.disconnect();
    socket = io(serverUrl);

    socket.on('connect', () => {
      socket?.emit('host:create_room', { format }, (res) => {
        roomCode.value = res.roomCode;
        joinUrl.value = res.joinUrl;
      });
    });

    socket.on('host:room_state', (state) => {
      applyRoomState(state);
    });

    socket.on('host:question_show', (q) => {
      applyQuestionShow(q);
    });

    socket.on('host:question_reveal', (rev) => {
      applyQuestionReveal(rev);
    });

    socket.on('host:avatar_trigger', ({ slotIndex, trigger, playBuzzerSound }) => {
      flashingSlots[slotIndex] = true;
      if (trigger) {
        lastAvatarTrigger[slotIndex] = trigger;
        soundManager.playStudioEffect(trigger);
      }
      setTimeout(() => {
        flashingSlots[slotIndex] = false;
        lastAvatarTrigger[slotIndex] = undefined;
      }, 650);

      if (playBuzzerSound) {
        const player = getPlayerAtSlot(slotIndex);
        soundManager.playBuzzerSound(player?.buzzerSound ?? 'classic_tv', slotIndex);
      }
    });

    socket.on('host:target_cursor_move', ({ currentTargetSlot }) => {
      pieTargetCursorSlot.value = currentTargetSlot;
    });

    socket.on('host:awards_ceremony', (payload) => {
      currentPhase.value = 'AWARDS_CEREMONY';
      winnerSlot.value = payload.winnerSlot;
      awards.value = payload.awards;
      soundManager.playStudioEffect('Reveal');
    });

    socket.on('host:presenter_speak_start', ({ utteranceId, mood, subtitleText }) => {
      presenterMood.value = mood;
      presenterSubtitle.value = subtitleText;
      isPresenterSpeaking.value = true;
      pcmStreamPlayer.startUtterance(utteranceId);
    });

    socket.on('host:presenter_audio_chunk', ({ utteranceId, pcm24kBase64 }) => {
      pcmStreamPlayer.enqueueChunk(utteranceId, pcm24kBase64);
    });

    socket.on('host:presenter_speak_end', ({ utteranceId }) => {
      pcmStreamPlayer.finishUtterance(utteranceId, () => {
        isPresenterSpeaking.value = false;
        if (currentQuestion.value) {
          socket?.emit('host:ready_for_timer', {
            phase: currentPhase.value,
            questionId: currentQuestion.value.questionId,
          });
        }
      });
    });
  }

  function startOrNextQuestion() {
    socket?.emit('host:start_game');
  }

  function cleanup() {
    if (lipSyncRafId && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(lipSyncRafId);
      lipSyncRafId = null;
    }
    pcmStreamPlayer.reset();
    soundManager.close();
    socket?.disconnect();
    socket = null;
  }

  return {
    isShowStarted,
    roomCode,
    joinUrl,
    currentPhase,
    currentRoundIndex,
    totalRounds,
    currentRoundType,
    loserPickerSlot,
    loserPickOptions,
    onTheSpotTargetSlot,
    bombHolderSlot,
    pieTargetCursorSlot,
    roomPoolPackCount,
    roomPoolQuestionCount,
    awards,
    winnerSlot,
    players,
    presenterSubtitle,
    presenterMood,
    isPresenterSpeaking,
    mouthOpen,
    currentQuestion,
    revealedCorrectIndex,
    lastScoreDeltas,
    flashingSlots,
    lastAvatarTrigger,
    getPlayerAtSlot,
    applyRoomState,
    applyQuestionShow,
    applyQuestionReveal,
    initializeTvShow,
    startOrNextQuestion,
    cleanup,
  };
});
