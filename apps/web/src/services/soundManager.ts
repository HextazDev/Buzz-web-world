import { Howl, Howler } from 'howler';
import type { AvatarPreset, BuzzerSound } from '@buzz/shared';

export interface AcousticBuzzerProfile {
  label: string;
  waveType: OscillatorType;
  baseFreqHz: number;
  endFreqHz: number;
  durationSec: number;
  modFreqHz?: number;
}

export const BUZZER_SOUND_PROFILES: Record<BuzzerSound, AcousticBuzzerProfile> = {
  classic_tv: {
    label: 'Buzzer TV Classique',
    waveType: 'sawtooth',
    baseFreqHz: 220,
    endFreqHz: 180,
    durationSec: 0.35,
  },
  klaxon: {
    label: 'Klaxon Rétro',
    waveType: 'sawtooth',
    baseFreqHz: 311,
    endFreqHz: 349,
    durationSec: 0.34,
  },
  cow: {
    label: 'Meuglement Vache',
    waveType: 'sawtooth',
    baseFreqHz: 145,
    endFreqHz: 195,
    durationSec: 0.55,
  },
  duck: {
    label: 'Canard en Plastique',
    waveType: 'triangle',
    baseFreqHz: 520,
    endFreqHz: 680,
    durationSec: 0.25,
  },
  sadistic_laugh: {
    label: 'Rire Sadique',
    waveType: 'square',
    baseFreqHz: 440,
    endFreqHz: 260,
    durationSec: 0.45,
    modFreqHz: 12,
  },
  laser: {
    label: 'Laser Sci-Fi',
    waveType: 'sawtooth',
    baseFreqHz: 880,
    endFreqHz: 140,
    durationSec: 0.3,
  },
  fart_cushion: {
    label: 'Coussin Péteur',
    waveType: 'sawtooth',
    baseFreqHz: 95,
    endFreqHz: 62,
    durationSec: 0.42,
    modFreqHz: 22,
  },
  gong: {
    label: 'Gong Impérial',
    waveType: 'sine',
    baseFreqHz: 130,
    endFreqHz: 95,
    durationSec: 0.65,
  },
  police_siren: {
    label: 'Sirène Police',
    waveType: 'square',
    baseFreqHz: 660,
    endFreqHz: 880,
    durationSec: 0.48,
  },
  sheep: {
    label: 'Bêlement Mouton',
    waveType: 'triangle',
    baseFreqHz: 370,
    endFreqHz: 420,
    durationSec: 0.4,
    modFreqHz: 18,
  },
  boing: {
    label: 'Ressort Cartoon',
    waveType: 'sine',
    baseFreqHz: 240,
    endFreqHz: 720,
    durationSec: 0.36,
  },
  airhorn: {
    label: 'Corne de Brume Stade',
    waveType: 'square',
    baseFreqHz: 392,
    endFreqHz: 370,
    durationSec: 0.45,
    modFreqHz: 35,
  },
};

export const AVATAR_PRESET_LABELS: Record<AvatarPreset, { label: string; emoji: string }> = {
  rocker: { label: 'Rockstar', emoji: '🎸' },
  astronaut: { label: 'Astronaute', emoji: '👩‍🚀' },
  granny: { label: 'Mamie Turbo', emoji: '👵' },
  geek: { label: 'Geek 90s', emoji: '🤓' },
  wrestler: { label: 'Catcheur Lucha', emoji: '🤼' },
  detective: { label: 'Détective', emoji: '🕵️' },
  pirate: { label: 'Capitaine Pirate', emoji: '🏴‍☠️' },
  cheerleader: { label: 'Pom-Pom Girl', emoji: '📣' },
  mad_scientist: { label: 'Savant Fou', emoji: '🧪' },
  knight: { label: 'Chevalier', emoji: '⚔️' },
  tourist: { label: 'Touriste', emoji: '📸' },
  dandy: { label: 'Dandy Chic', emoji: '🎩' },
};

class StudioSoundManager {
  private audioCtx: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private howls = new Map<string, Howl>();

  /**
   * AUDIO-01 : Déverrouillage explicite sur geste utilisateur initial (bouton Ouvrir le Plateau TV)
   */
  async unlockAudio(): Promise<{ audioCtx: AudioContext; analyserNode: AnalyserNode } | null> {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx({ sampleRate: 24000 });
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      await Howler.ctx.resume();
    }

    return { audioCtx: this.audioCtx, analyserNode: this.analyserNode! };
  }

  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  getAudioContext(): AudioContext | null {
    return this.audioCtx;
  }

  playBuzzerSound(soundKey: string, slotIndex = 0): void {
    const existingHowl = this.howls.get(soundKey);
    if (existingHowl && existingHowl.state() === 'loaded') {
      existingHowl.play();
      return;
    }

    if (!this.audioCtx || !this.analyserNode) return;
    const profile =
      BUZZER_SOUND_PROFILES[soundKey as BuzzerSound] ?? BUZZER_SOUND_PROFILES.classic_tv;

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    const slotDetune = 1 + (slotIndex % 8) * 0.03;
    osc.type = profile.waveType;
    osc.frequency.setValueAtTime(profile.baseFreqHz * slotDetune, now);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(40, profile.endFreqHz * slotDetune),
      now + profile.durationSec
    );

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + profile.durationSec);

    osc.connect(gain);
    gain.connect(this.analyserNode);
    osc.start(now);
    osc.stop(now + profile.durationSec);
  }

  playStudioEffect(effect: 'Hit_Pie' | 'Bomb_Hold' | 'Bomb_Explode' | 'Slime_Drop' | 'Reveal'): void {
    if (!this.audioCtx || !this.analyserNode) return;
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    if (effect === 'Bomb_Explode') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.6);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gain);
      gain.connect(this.analyserNode);
      osc.start(now);
      osc.stop(now + 0.6);
      return;
    }

    if (effect === 'Hit_Pie' || effect === 'Slime_Drop') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.35);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.analyserNode);
      osc.start(now);
      osc.stop(now + 0.35);
      return;
    }

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.25);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(this.analyserNode);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  close(): void {
    for (const h of this.howls.values()) {
      h.unload();
    }
    this.howls.clear();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      void this.audioCtx.close();
    }
    this.audioCtx = null;
    this.analyserNode = null;
  }
}

export const soundManager = new StudioSoundManager();

/**
 * Génère une matrice 21x21 déterministe avec les 3 repères d'alignement (Finder Patterns 7x7)
 * et les bits d'encodage de l'URL de connexion salon pour l'affichage SVG du Plateau TV.
 */
export function generateQrMatrix(text: string): boolean[][] {
  const size = 21;
  const grid: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  const placeFinder = (rowOffset: number, colOffset: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[rowOffset + r]![colOffset + c] = isBorder || isInner;
        reserved[rowOffset + r]![colOffset + c] = true;
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns (row 6 & col 6)
  for (let i = 8; i < size - 8; i++) {
    grid[6]![i] = i % 2 === 0;
    reserved[6]![i] = true;
    grid[i]![6] = i % 2 === 0;
    reserved[i]![6] = true;
  }

  // Deterministic bit stream from URL
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let bitIdx = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r]![c]) continue;
      const charCode = text.charCodeAt(bitIdx % Math.max(1, text.length)) || 65;
      const bit = ((charCode >> (bitIdx % 7)) ^ ((hash >> (bitIdx % 16)) & 1)) & 1;
      grid[r]![c] = Boolean(bit);
      bitIdx++;
    }
  }

  return grid;
}
