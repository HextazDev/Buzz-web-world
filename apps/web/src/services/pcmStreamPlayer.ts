import { soundManager } from './soundManager.js';

/**
 * Décode une chaîne Base64 contenant du PCM 16-bit signé Little-Endian (24 kHz)
 * en un tableau Float32Array normalisé dans [-1.0, 1.0] pour Web Audio API.
 */
export function decodePcm16Base64ToFloat32(pcm24kBase64: string): Float32Array {
  let bytes: Uint8Array;
  if (typeof Buffer !== 'undefined') {
    bytes = new Uint8Array(Buffer.from(pcm24kBase64, 'base64'));
  } else {
    const binary = atob(pcm24kBase64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  }

  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    float32[i] = int16 < 0 ? int16 / 32768 : int16 / 32767;
  }

  return float32;
}

/**
 * File de lecture streaming PCM 24 kHz sans craquement (gapless AudioBufferSourceNode scheduling)
 * branchée sur l'AnalyserNode pour animer `mouthOpen` à 60 FPS et notifier la fin de parole.
 */
export class PcmStreamPlayer {
  private nextStartTime = 0;
  private activeUtteranceId: string | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  startUtterance(utteranceId: string): void {
    this.activeUtteranceId = utteranceId;
    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    const ctx = soundManager.getAudioContext();
    if (ctx) {
      this.nextStartTime = Math.max(this.nextStartTime, ctx.currentTime);
    }
  }

  enqueueChunk(utteranceId: string, pcm24kBase64: string): void {
    if (this.activeUtteranceId && this.activeUtteranceId !== utteranceId) {
      this.activeUtteranceId = utteranceId;
    }

    const ctx = soundManager.getAudioContext();
    const analyser = soundManager.getAnalyserNode();
    if (!ctx || !analyser) return;

    const samples = decodePcm16Base64ToFloat32(pcm24kBase64);
    if (samples.length === 0) return;

    const audioBuffer = ctx.createBuffer(1, samples.length, 24000);
    audioBuffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);

    const startAt = Math.max(ctx.currentTime, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;
  }

  finishUtterance(utteranceId: string, onPlaybackComplete: () => void): void {
    if (this.activeUtteranceId && this.activeUtteranceId !== utteranceId) return;

    const ctx = soundManager.getAudioContext();
    const remainingSec = ctx ? Math.max(0, this.nextStartTime - ctx.currentTime) : 0;
    const delayMs = Math.min(2000, Math.round(remainingSec * 1000) + 40);

    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => {
      onPlaybackComplete();
    }, delayMs);
  }

  reset(): void {
    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    this.nextStartTime = 0;
    this.activeUtteranceId = null;
  }
}

export const pcmStreamPlayer = new PcmStreamPlayer();
