import { z } from 'zod';
import { AVATAR_PRESETS, BUZZER_SOUNDS, ROUND_TYPES } from './constants';

export const BuzzerColorSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type BuzzerColor = z.infer<typeof BuzzerColorSchema>;

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

export const ControllerJoinPayloadSchema = z.object({
  roomCode: z.string().length(4).toUpperCase(),
  userId: z.string().uuid().optional(),
  guestName: z.string().min(2).max(20).optional(),
  avatarPreset: z.enum(AVATAR_PRESETS).optional(),
  buzzerSound: z.enum(BUZZER_SOUNDS).optional(),
  reconnectToken: z.string().optional(),
});

export const RoundTypeSchema = z.enum(ROUND_TYPES);
