import { describe, expect, it } from 'vitest';
import { QuestionCreateSchema, QuizPackCreateSchema } from '../schemas.js';

function makeValidQuestion(index: number) {
  return {
    subTheme: `Thème ${index}`,
    difficulty: 2,
    format: 'TEXT_CLASSIC' as const,
    prompt: `Quelle est la bonne réponse pour la question numéro ${index} ?`,
    choices: ['Bleu', 'Orange', 'Vert', 'Jaune'] as [string, string, string, string],
    correctIndex: 0 as const,
  };
}

describe('Pack & Question Validation Schemas (PACK-01)', () => {
  it('accepts TEXT_CLASSIC without mediaKey and rejects TEXT_CLASSIC with mediaKey', () => {
    expect(QuestionCreateSchema.safeParse(makeValidQuestion(1)).success).toBe(true);
    expect(
      QuestionCreateSchema.safeParse({
        ...makeValidQuestion(1),
        mediaKey: 'bucket/unexpected.png',
      }).success
    ).toBe(false);
  });

  it('requires mediaKey for IMAGE_STANDARD, IMAGE_REVEAL and AUDIO_CLIP formats', () => {
    expect(
      QuestionCreateSchema.safeParse({
        ...makeValidQuestion(1),
        format: 'IMAGE_REVEAL',
      }).success
    ).toBe(false);

    expect(
      QuestionCreateSchema.safeParse({
        ...makeValidQuestion(1),
        format: 'IMAGE_REVEAL',
        mediaKey: 'packs/img-01.webp',
      }).success
    ).toBe(true);

    expect(
      QuestionCreateSchema.safeParse({
        ...makeValidQuestion(1),
        format: 'AUDIO_CLIP',
        mediaKey: 'packs/clip-01.mp3',
        mediaDurationMs: 10000,
      }).success
    ).toBe(true);

    // Rejects audio clip shorter than 5000 ms or longer than 15000 ms
    expect(
      QuestionCreateSchema.safeParse({
        ...makeValidQuestion(1),
        format: 'AUDIO_CLIP',
        mediaKey: 'packs/clip-01.mp3',
        mediaDurationMs: 3000,
      }).success
    ).toBe(false);
  });

  it('enforces the minimum of 12 questions per QuizPack (PACK-01)', () => {
    const elevenQuestions = Array.from({ length: 11 }, (_, i) => makeValidQuestion(i + 1));
    const twelveQuestions = Array.from({ length: 12 }, (_, i) => makeValidQuestion(i + 1));

    expect(
      QuizPackCreateSchema.safeParse({
        title: 'Pack Trop Court',
        category: 'Culture G',
        questions: elevenQuestions,
      }).success
    ).toBe(false);

    expect(
      QuizPackCreateSchema.safeParse({
        title: 'Pack Complet Officiel',
        category: 'Culture G',
        questions: twelveQuestions,
      }).success
    ).toBe(true);
  });
});
