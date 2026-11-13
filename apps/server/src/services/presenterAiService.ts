import { randomUUID } from 'node:crypto';
import type { PresenterMood, RoundType, ServerToHostEvents } from '@buzz/shared';

const pcmCache = new Map<string, string[]>();

/**
 * SEC-PROMPT-01 : Sanitize tout pseudo joueur avant interpolation dans le prompt système LLM
 * pour bloquer toute attaque de type Prompt Injection ou injection HTML/contrôle.
 */
export function sanitizePlayerNameForPrompt(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') return 'Candidat';

  const stripped = rawName
    .replace(/[\r\n\t<>`"'\\]/g, ' ')
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, '')
    .replace(/system\s*prompt/gi, '')
    .replace(/correct[_\s]*index/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);

  return stripped || 'Candidat';
}

/**
 * Synthétise une onde vocale modulée en PCM 16-bit 24 kHz Little-Endian découpée en chunks base64,
 * permettant d'animer naturellement les syllabes du présentateur Rive via l'AnalyserNode (60 FPS)
 * avec mise en cache par `ttsCacheKey`.
 */
export function synthesizePcm24kChunks(text: string, ttsCacheKey?: string | null): string[] {
  if (ttsCacheKey && pcmCache.has(ttsCacheKey)) {
    return pcmCache.get(ttsCacheKey)!;
  }

  const sampleRate = 24000;
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 14);
  const chunkCount = Math.max(2, Math.min(6, Math.ceil(words.length / 2)));
  const samplesPerChunk = 2400; // 100ms par chunk @ 24kHz (4800 octets)
  const chunks: string[] = [];

  for (let c = 0; c < chunkCount; c++) {
    const buffer = Buffer.alloc(samplesPerChunk * 2);
    const wordSeed = words[c]?.charCodeAt(0) ?? 70;
    const carrierFreq = 145 + (wordSeed % 65);
    const syllableEnvelopeFreq = 5.5;

    for (let i = 0; i < samplesPerChunk; i++) {
      const t = i / sampleRate;
      const envelope = Math.sin(Math.PI * (i / samplesPerChunk)) * (0.55 + 0.45 * Math.sin(2 * Math.PI * syllableEnvelopeFreq * t));
      const harmonic =
        0.65 * Math.sin(2 * Math.PI * carrierFreq * t) +
        0.35 * Math.sin(2 * Math.PI * carrierFreq * 2 * t);
      const sampleFloat = Math.max(-1, Math.min(1, envelope * harmonic * 0.45));
      const pcm16 = Math.round(sampleFloat * 32767);
      buffer.writeInt16LE(pcm16, i * 2);
    }

    chunks.push(buffer.toString('base64'));
  }

  if (ttsCacheKey) {
    pcmCache.set(ttsCacheKey, chunks);
  }

  return chunks;
}

export interface PresenterUtteranceContext {
  kind: 'QUESTION_INTRO' | 'QUESTION_REVEAL' | 'AWARDS_INTRO';
  subTheme?: string;
  roundType?: RoundType;
  leaderName?: string;
  lastPlaceName?: string;
  winnersNames?: string[];
  rivalryNote?: string;
  fallbackText?: string;
  ttsCacheKey?: string | null;
}

export type HostPresenterEmitFn = <
  K extends 'host:presenter_speak_start' | 'host:presenter_audio_chunk' | 'host:presenter_speak_end',
>(
  event: K,
  payload: Parameters<ServerToHostEvents[K]>[0]
) => void;

export class PresenterAiService {
  private readonly timeoutMs: number;
  private readonly externalLlmFetcher?: (prompt: string, signal: AbortSignal) => Promise<string>;

  constructor(options?: {
    timeoutMs?: number;
    externalLlmFetcher?: (prompt: string, signal: AbortSignal) => Promise<string>;
  }) {
    // TTS-01 : Budget global strictement < 800 ms avant fallback déterministe
    this.timeoutMs = Math.min(750, options?.timeoutMs ?? 650);
    this.externalLlmFetcher = options?.externalLlmFetcher;
  }

  buildDeterministicLine(ctx: PresenterUtteranceContext): {
    text: string;
    mood: PresenterMood;
  } {
    const cleanLeader = ctx.leaderName ? sanitizePlayerNameForPrompt(ctx.leaderName) : null;
    const cleanLast = ctx.lastPlaceName ? sanitizePlayerNameForPrompt(ctx.lastPlaceName) : null;

    if (ctx.kind === 'QUESTION_REVEAL') {
      const winners = (ctx.winnersNames ?? []).map(sanitizePlayerNameForPrompt);
      if (winners.length === 0) {
        return {
          text:
            ctx.fallbackText ??
            (cleanLast
              ? `Zéro pointé dans tout le salon ! Même ${cleanLast} n’a pas trouvé la bonne couleur...`
              : 'Zéro pointé dans tout le salon ! Même ma grand-mère aurait buzzé juste...'),
          mood: 1, // Sarcastic_Laugh
        };
      }
      return {
        text:
          ctx.fallbackText ??
          `Bien joué ${winners.join(', ')} ! ${
            ctx.rivalryNote ? ctx.rivalryNote : 'Les autres, réveillez vos neurones !'
          }`,
        mood: 4, // Hype_Announce
      };
    }

    if (ctx.kind === 'AWARDS_INTRO') {
      return {
        text:
          ctx.fallbackText ??
          'Place à la cérémonie officielle des Buzz Awards ! Qui repart avec la couronne et qui repart entarté ?',
        mood: 4,
      };
    }

    // QUESTION_INTRO
    const baseIntro =
      ctx.fallbackText ??
      `Thème ${ctx.subTheme ?? 'Culture Générale'} ! ${
        cleanLeader && cleanLast && cleanLeader !== cleanLast
          ? `${cleanLeader} caracole en tête pendant que ${cleanLast} cherche encore son buzzer...`
          : 'Gardez les yeux sur la télévision !'
      }`;

    return {
      text: ctx.rivalryNote ? `${baseIntro} (${ctx.rivalryNote})` : baseIntro,
      mood: 4,
    };
  }

  async generateLineWithFallback(ctx: PresenterUtteranceContext): Promise<{
    text: string;
    mood: PresenterMood;
  }> {
    const fallback = this.buildDeterministicLine(ctx);
    if (!this.externalLlmFetcher && !process.env.LLM_API_KEY) {
      return fallback;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      if (this.externalLlmFetcher) {
        const prompt = `Présentateur TV sarcastique Buzz! (${ctx.kind}, thème=${ctx.subTheme ?? ''})`;
        const generated = await Promise.race([
          this.externalLlmFetcher(prompt, controller.signal),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('TTS-01 timeout')), this.timeoutMs)
          ),
        ]);
        if (generated && generated.trim().length > 3) {
          return { text: generated.trim(), mood: fallback.mood };
        }
      }
      return fallback;
    } catch {
      // TTS-01 : Fallback immédiat en cas de timeout ou erreur réseau
      return fallback;
    } finally {
      clearTimeout(timer);
    }
  }

  async streamUtterance(
    emit: HostPresenterEmitFn,
    ctx: PresenterUtteranceContext
  ): Promise<{ utteranceId: string; text: string; chunkCount: number }> {
    const utteranceId = `utt-${randomUUID().slice(0, 8)}`;
    const { text, mood } = await this.generateLineWithFallback(ctx);
    const chunks = synthesizePcm24kChunks(text, ctx.ttsCacheKey);

    emit('host:presenter_speak_start', {
      utteranceId,
      mood,
      subtitleText: text,
    });

    for (const pcm24kBase64 of chunks) {
      emit('host:presenter_audio_chunk', {
        utteranceId,
        pcm24kBase64,
      });
    }

    emit('host:presenter_speak_end', {
      utteranceId,
    });

    return { utteranceId, text, chunkCount: chunks.length };
  }
}

export const presenterAiService = new PresenterAiService();
