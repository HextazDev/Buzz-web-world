import type { BuzzerColor, QuestionFormat } from './schemas.js';
import type { RoundType } from './constants.js';

export type RoomPhase =
  | 'LOBBY'
  | 'GAME_INTRO'
  | 'LOSER_PICK_ROUND'
  | 'ROUND_RULES_INTRO'
  | 'HIGH_STAKES_BET'
  | 'ON_THE_SPOT_VOTE'
  | 'QUESTION_ACTIVE'
  | 'BUZZ_LOCKED_DECISION'
  | 'PIE_AIMING'
  | 'POINT_STEAL_TARGET'
  | 'QUESTION_REVEAL'
  | 'ROUND_LEADERBOARD'
  | 'FINAL_COUNTDOWN'
  | 'FINAL_FLASHPOINT'
  | 'AWARDS_CEREMONY'
  | 'PODIUM_END';

export type RedLedMode = 'OFF' | 'PULSE_READY' | 'SOLID_LOCKED' | 'AIM_TRIGGER';

export type AvatarRiveState =
  | 0 // Idle
  | 1 // Thinking
  | 2 // Answered_Waiting
  | 3 // Buzz_Slam
  | 4 // Celebrate
  | 5 // Angry_Lose
  | 6; // Taunt

export type PresenterMood =
  | 0 // Neutral
  | 1 // Sarcastic_Laugh
  | 2 // Shocked
  | 3 // Disappointed
  | 4; // Hype_Announce

export interface PlayerSlotState {
  slotIndex: number; // 0..7
  userId?: string;
  displayName: string;
  avatarPreset: string;
  avatarColor: string;
  buzzerSound: string;
  score: number;
  isConnected: boolean;
  riveState: AvatarRiveState;
  roundMeta?: {
    lives?: number;           // Manche 4 : L'Entartage (0..2)
    hasBomb?: boolean;        // Manche 5 : La Bombe
    stakeBet?: number;        // Manche 6 : La Mise (50|100|250|500)
    thermometer?: number;     // Manche 7 : En Ébullition (0..6)
    pillarHeightSec?: number; // Manche 9 : Compte à Rebours (0.0..14.0)
  };
}

// ============================================================================
// CONTRATS MOBILE (/controller) <-> SERVEUR
// ============================================================================

export interface ControllerToServerEvents {
  'controller:join': (p: {
    roomCode: string;
    userId?: string;
    guestName?: string;
    avatarPreset?: string;
    buzzerSound?: string;
    reconnectToken?: string;
  }) => void;
  'controller:press_red': (p: { clientSentAt: number }) => void;
  'controller:press_color': (p: { color: BuzzerColor; clientSentAt: number }) => void;
}

export interface ServerToControllerEvents {
  'controller:joined': (p: {
    slotIndex: number;
    reconnectToken: string;
    displayName: string;
  }) => void;
  'controller:state_sync': (p: {
    phase: RoomPhase;
    redLedMode: RedLedMode;
    activeColors: [boolean, boolean, boolean, boolean];
    hapticPattern?: number | number[];
    statusBanner: string;
  }) => void;
}

// ============================================================================
// CONTRATS PLATEAU TV (/host) <-> SERVEUR
// ============================================================================

export interface HostToServerEvents {
  'host:create_room': (
    p: {
      format: 'SHORT' | 'NORMAL' | 'LONG' | 'CUSTOM';
      customRoundsCount?: number;
    },
    ack: (res: { roomCode: string; joinUrl: string }) => void
  ) => void;

  'host:start_game': () => void;

  /**
   * Envoyé par la TV dès que le présentateur a fini son speech/lecture de question
   * ou que la transition Rive est terminée -> lance le chrono serveur.
   */
  'host:ready_for_timer': (p: { phase: RoomPhase; questionId?: string }) => void;
}

export interface ServerToHostEvents {
  'host:room_state': (p: {
    roomCode: string;
    phase: RoomPhase;
    currentRoundIndex: number;
    totalRounds: number;
    currentRoundType?: RoundType;
    loserPickerSlot?: number | null;
    loserPickOptions?: Array<{ roundType: RoundType; packTitle: string }>;
    onTheSpotTargetSlot?: number | null;
    bombHolderSlot?: number | null;
    pieTargetCursorSlot?: number | null;
    roomPoolPackCount?: number;
    roomPoolQuestionCount?: number;
    players: PlayerSlotState[];
  }) => void;

  /**
   * Anti-Triche strict : correct_index est OMIS ici !
   * Il n'est envoyé que dans host:question_reveal.
   */
  'host:question_show': (p: {
    questionId: string;
    roundNumber: number;
    questionIndexInRound: number;
    subTheme: string;
    format: QuestionFormat;
    prompt: string;
    choices: [string, string, string, string];
    mediaUrl?: string;
    timerDurationMs: number;
  }) => void;

  'host:question_reveal': (p: {
    questionId: string;
    correctIndex: BuzzerColor;
    scoreDeltas: Record<number, number>;
    updatedScores: Record<number, number>;
  }) => void;

  'host:avatar_trigger': (p: {
    slotIndex: number;
    trigger?: 'Hit_Pie' | 'Bomb_Hold' | 'Bomb_Explode' | 'Slime_Drop';
    riveState?: AvatarRiveState;
    playBuzzerSound?: boolean;
  }) => void;

  'host:target_cursor_move': (p: {
    attackerSlot: number;
    currentTargetSlot: number;
  }) => void;

  'host:presenter_speak_start': (p: {
    utteranceId: string;
    mood: PresenterMood;
    subtitleText: string;
  }) => void;

  'host:presenter_audio_chunk': (p: {
    utteranceId: string;
    pcm24kBase64: string;
  }) => void;

  'host:presenter_speak_end': (p: {
    utteranceId: string;
  }) => void;
}
