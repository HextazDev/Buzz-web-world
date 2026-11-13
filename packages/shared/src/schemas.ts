import { z } from 'zod';
import { AVATAR_PRESETS, BUZZER_SOUNDS, ROUND_TYPES } from './constants.js';

export const BuzzerColorSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type BuzzerColor = z.infer<typeof BuzzerColorSchema>;

export const RoomPhaseSchema = z.enum([
  'LOBBY',
  'GAME_INTRO',
  'LOSER_PICK_ROUND',
  'ROUND_RULES_INTRO',
  'HIGH_STAKES_BET',
  'ON_THE_SPOT_VOTE',
  'QUESTION_ACTIVE',
  'BUZZ_LOCKED_DECISION',
  'PIE_AIMING',
  'POINT_STEAL_TARGET',
  'QUESTION_REVEAL',
  'ROUND_LEADERBOARD',
  'FINAL_COUNTDOWN',
  'FINAL_FLASHPOINT',
  'AWARDS_CEREMONY',
  'PODIUM_END',
]);

export const QuestionFormatSchema = z.enum([
  'TEXT_CLASSIC',
  'IMAGE_STANDARD',
  'IMAGE_REVEAL',
  'AUDIO_CLIP',
]);
export type QuestionFormat = z.infer<typeof QuestionFormatSchema>;

export const QuestionCreateSchema = z
  .object({
    subTheme: z.string().min(2).max(40),
    difficulty: z.number().int().min(1).max(3).default(2),
    format: QuestionFormatSchema.default('TEXT_CLASSIC'),
    prompt: z.string().min(5).max(160),
    choices: z.tuple([
      z.string().min(1).max(80),
      z.string().min(1).max(80),
      z.string().min(1).max(80),
      z.string().min(1).max(80),
    ]),
    correctIndex: BuzzerColorSchema,
    mediaKey: z.string().nullable().optional(),
    mediaDurationMs: z.number().int().min(5000).max(15000).nullable().optional(),
  })
  .refine(
    (q) =>
      (q.format === 'TEXT_CLASSIC' && !q.mediaKey) ||
      (q.format !== 'TEXT_CLASSIC' && Boolean(q.mediaKey)),
    {
      message: 'Un mediaKey est requis si et seulement si le format n’est pas TEXT_CLASSIC',
    }
  );

export const QuizPackCreateSchema = z.object({
  title: z.string().min(3).max(80),
  description: z.string().max(500).default(''),
  category: z.string().min(2).max(32),
  visibility: z.enum(['PRIVATE', 'PUBLIC']).default('PRIVATE'),
  questions: z
    .array(QuestionCreateSchema)
    .min(12, 'Un pack doit contenir au minimum 12 questions pour être sauvegardé ou publié.'),
});

export const HostCreateRoomPayloadSchema = z.object({
  format: z.enum(['SHORT', 'NORMAL', 'LONG', 'CUSTOM']),
  customRoundsCount: z.number().int().min(2).max(12).optional(),
});

export const HostReadyForTimerPayloadSchema = z.object({
  phase: RoomPhaseSchema,
  questionId: z.string().min(1).max(64).optional(),
});

export const ControllerJoinPayloadSchema = z.object({
  roomCode: z
    .string()
    .trim()
    .length(4)
    .transform((v) => v.toUpperCase()),
  userId: z.string().uuid().optional(),
  guestName: z.string().trim().min(1).max(20).optional(),
  avatarPreset: z.enum(AVATAR_PRESETS).optional(),
  buzzerSound: z.enum(BUZZER_SOUNDS).optional(),
  reconnectToken: z.string().min(1).max(128).optional(),
});

export const ControllerPressRedPayloadSchema = z.object({
  clientSentAt: z.number().finite(),
});

export const ControllerPressColorPayloadSchema = z.object({
  color: BuzzerColorSchema,
  clientSentAt: z.number().finite(),
});

export const RoundTypeSchema = z.enum(ROUND_TYPES);

export const AuthRegisterSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Le pseudo ne peut contenir que des lettres, chiffres, _ ou -'),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  avatarPreset: z.enum(AVATAR_PRESETS).default('rocker'),
  avatarColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default('#0066FF'),
  buzzerSound: z.enum(BUZZER_SOUNDS).default('classic_tv'),
});
export type AuthRegisterPayload = z.infer<typeof AuthRegisterSchema>;

export const AuthLoginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
});
export type AuthLoginPayload = z.infer<typeof AuthLoginSchema>;

export const QuizPackRateSchema = z.object({
  rating: z.number().int().min(1).max(5),
});
export type QuizPackRatePayload = z.infer<typeof QuizPackRateSchema>;
export type QuizPackCreatePayload = z.infer<typeof QuizPackCreateSchema>;
export type QuestionCreatePayload = z.infer<typeof QuestionCreateSchema>;

