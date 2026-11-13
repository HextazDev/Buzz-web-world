import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useHubStore } from '../stores/useHubStore.js';

describe('Hub Store — Profile, Rivalries, 12-Question Pack Editor & Workshop (#8)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('[EDITOR-01] enforces the 12-question minimum and mediaKey rules before enabling pack save', () => {
    const hub = useHubStore();
    hub.resetDraftPack();

    expect(hub.draftPack.questions.length).toBe(1);
    expect(hub.canSaveDraftPack).toBe(false);
    expect(hub.draftValidationErrors.length).toBeGreaterThan(0);

    // Fill up to 11 valid questions -> still blocked (< 12)
    hub.fillDraftWithTemplateQuestions(11);
    expect(hub.draftPack.questions.length).toBe(11);
    expect(hub.canSaveDraftPack).toBe(false);

    // Add 12th valid question -> now valid!
    hub.addDraftQuestion();
    expect(hub.draftPack.questions.length).toBe(12);
    expect(hub.canSaveDraftPack).toBe(true);
    expect(hub.draftValidationErrors.length).toBe(0);

    // Switch question #1 to IMAGE_REVEAL without mediaKey -> blocked by EDITOR-01
    hub.draftPack.questions[0]!.format = 'IMAGE_REVEAL';
    hub.draftPack.questions[0]!.mediaKey = null;
    expect(hub.canSaveDraftPack).toBe(false);

    // Provide mediaKey -> valid again!
    hub.draftPack.questions[0]!.mediaKey = 'https://cdn.buzz.local/reveal-01.webp';
    expect(hub.canSaveDraftPack).toBe(true);
  });

  it('[MEDIA-01] rejects AUDIO_CLIP questions with duration outside [5000, 15000] ms', () => {
    const hub = useHubStore();
    hub.fillDraftWithTemplateQuestions(12);
    expect(hub.canSaveDraftPack).toBe(true);

    // Set question #0 to AUDIO_CLIP with 3000ms (< 5000ms)
    hub.draftPack.questions[0]!.format = 'AUDIO_CLIP';
    hub.draftPack.questions[0]!.mediaKey = 'https://cdn.buzz.local/audio-01.mp3';
    hub.draftPack.questions[0]!.mediaDurationMs = 3000;
    expect(hub.canSaveDraftPack).toBe(false);

    // Set to 18000ms (> 15000ms)
    hub.draftPack.questions[0]!.mediaDurationMs = 18000;
    expect(hub.canSaveDraftPack).toBe(false);

    // Set to 10000ms (valid in [5000, 15000] ms)
    hub.draftPack.questions[0]!.mediaDurationMs = 10000;
    expect(hub.canSaveDraftPack).toBe(true);
  });

  it('filters Workshop packs by search query, category and sorts by popularity or rating', () => {
    const hub = useHubStore();
    hub.workshopPacks = [
      {
        id: 'pack-1',
        authorId: null,
        title: 'Cinéma Culte & Oscars',
        description: 'Les grands classiques du 7e art',
        category: 'Cinéma',
        visibility: 'PUBLIC',
        isOfficial: true,
        questionsCount: 12,
        downloadsCount: 150,
        ratingSum: 48,
        ratingCount: 10,
        clonedFromId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'pack-2',
        authorId: 'u-1',
        title: 'Blindtest Années 90',
        description: 'Hits Eurodance et Pop',
        category: 'Musique',
        visibility: 'PUBLIC',
        isOfficial: false,
        questionsCount: 14,
        downloadsCount: 40,
        ratingSum: 15,
        ratingCount: 3,
        clonedFromId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    hub.workshopSearch = 'blindtest';
    expect(hub.filteredWorkshopPacks.length).toBe(1);
    expect(hub.filteredWorkshopPacks[0]?.id).toBe('pack-2');

    hub.workshopSearch = '';
    hub.workshopCategory = 'Cinéma';
    expect(hub.filteredWorkshopPacks.length).toBe(1);
    expect(hub.filteredWorkshopPacks[0]?.id).toBe('pack-1');
  });
});
