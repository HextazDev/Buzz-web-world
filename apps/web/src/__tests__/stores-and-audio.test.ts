import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { AVATAR_PRESETS, BUZZER_SOUNDS } from '@buzz/shared';
import { BUZZER_SOUND_PROFILES, generateQrMatrix } from '../services/soundManager.js';
import { useControllerStore } from '../stores/useControllerStore.js';
import { useHostStore } from '../stores/useHostStore.js';

describe('Pinia Stores (Host & Controller), Sound Profiles, and QR Matrix (#5)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('[AUDIO-01] defines a distinct acoustic profile for all 12 official BUZZER_SOUNDS', () => {
    for (const soundKey of BUZZER_SOUNDS) {
      const profile = BUZZER_SOUND_PROFILES[soundKey];
      expect(profile).toBeDefined();
      expect(profile.label.length).toBeGreaterThan(2);
      expect(profile.baseFreqHz).toBeGreaterThan(60);
      expect(profile.durationSec).toBeGreaterThan(0.1);
    }
  });

  it('[CTRL-01] initializes useControllerStore with preset/sound selection and zero question text fields', () => {
    const store = useControllerStore();
    expect(AVATAR_PRESETS).toContain(store.selectedAvatarPreset);
    expect(BUZZER_SOUNDS).toContain(store.selectedBuzzerSound);

    store.applyStateSync({
      phase: 'QUESTION_ACTIVE',
      redLedMode: 'OFF',
      activeColors: [true, true, true, true],
      statusBanner: 'CHOISISSEZ UNE COULEUR SUR VOTRE BUZZER !',
    });

    expect(store.phase).toBe('QUESTION_ACTIVE');
    expect(store.activeColors).toEqual([true, true, true, true]);
    // Anti-triche & Ergonomie : aucun texte de question ni choix dans le store contrôleur
    expect('prompt' in store).toBe(false);
    expect('choices' in store).toBe(false);
    expect('correctIndex' in store).toBe(false);
  });

  it('updates useHostStore state cleanly on room_state, question_show, question_reveal, and avatar_trigger', () => {
    const host = useHostStore();

    host.applyRoomState({
      roomCode: 'BUZZ',
      phase: 'QUESTION_ACTIVE',
      currentRoundIndex: 2,
      totalRounds: 5,
      currentRoundType: 'PIE_FIGHT',
      roomPoolPackCount: 2,
      roomPoolQuestionCount: 24,
      players: [
        {
          slotIndex: 0,
          displayName: 'Nolhan',
          avatarPreset: 'rocker',
          avatarColor: '#0066FF',
          buzzerSound: 'laser_zap',
          score: 500,
          isConnected: true,
          riveState: 0,
          roundMeta: { lives: 2 },
        },
      ],
    });

    expect(host.roomCode).toBe('BUZZ');
    expect(host.currentRoundType).toBe('PIE_FIGHT');
    expect(host.getPlayerAtSlot(0)?.displayName).toBe('Nolhan');

    host.applyQuestionShow({
      questionId: 'q-101',
      roundNumber: 2,
      questionIndexInRound: 1,
      subTheme: 'Jeux Vidéo',
      format: 'IMAGE_REVEAL',
      prompt: 'Quel est ce personnage pixelisé ?',
      choices: ['Mario', 'Sonic', 'Crash', 'Spyro'],
      mediaUrl: 'https://example.com/reveal.png',
      timerDurationMs: 10000,
    });

    expect(host.currentQuestion?.format).toBe('IMAGE_REVEAL');
    expect(host.revealedCorrectIndex).toBeNull();

    host.applyQuestionReveal({
      questionId: 'q-101',
      correctIndex: 2,
      scoreDeltas: { 0: 250 },
      updatedScores: { 0: 750 },
    });

    expect(host.revealedCorrectIndex).toBe(2);
    expect(host.lastScoreDeltas[0]).toBe(250);
  });

  it('generates a deterministic 21x21 QR-like finder & data matrix for room join URLs', () => {
    const matrix = generateQrMatrix('https://buzz.example.com/controller?room=ABCD');
    expect(matrix.length).toBe(21);
    expect(matrix[0]?.length).toBe(21);
    // Finder patterns top-left (0,0), top-right (0,20), bottom-left (20,0) are always dark (true)
    expect(matrix[0]?.[0]).toBe(true);
    expect(matrix[0]?.[20]).toBe(true);
    expect(matrix[20]?.[0]).toBe(true);
  });
});
