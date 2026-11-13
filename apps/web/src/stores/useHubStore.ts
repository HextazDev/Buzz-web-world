import { computed, reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  AVATAR_PRESETS,
  BUZZER_COLORS,
  BUZZER_SOUNDS,
  QuizPackCreateSchema,
  type BuzzerColor,
  type QuestionFormat,
} from '@buzz/shared';

export interface HubUserProfile {
  id: string;
  username: string;
  email: string;
  avatarPreset: string;
  avatarColor: string;
  buzzerSound: string;
  role: 'USER' | 'ADMIN';
  globalStats: {
    games_played: number;
    games_won: number;
    total_questions: number;
    correct_answers: number;
    avg_reaction_ms: number;
    titles_won: Record<string, number>;
  };
  createdAt: string;
}

export interface HubRivalryItem {
  userAId: string;
  userBId: string;
  status: 'PENDING' | 'ACCEPTED';
  requestedBy: string;
  gamesTogether: number;
  aFinishedAhead: number;
  bFinishedAhead: number;
  aTartedB: number;
  bTartedA: number;
  aStoleFromBPts: number;
  bStoleFromAPts: number;
  updatedAt: string;
}

export interface HubWorkshopPack {
  id: string;
  authorId: string | null;
  title: string;
  description: string;
  category: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  isOfficial: boolean;
  questionsCount: number;
  downloadsCount: number;
  ratingSum: number;
  ratingCount: number;
  clonedFromId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftQuestionItem {
  subTheme: string;
  difficulty: 1 | 2 | 3;
  format: QuestionFormat;
  prompt: string;
  choices: [string, string, string, string];
  correctIndex: BuzzerColor;
  mediaKey: string | null;
  mediaDurationMs: number | null;
}

export interface DraftPackState {
  title: string;
  description: string;
  category: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  questions: DraftQuestionItem[];
}

function createEmptyQuestion(index: number): DraftQuestionItem {
  return {
    subTheme: `Culture Pop #${index}`,
    difficulty: 2,
    format: 'TEXT_CLASSIC',
    prompt: `Question n°${index} : Quel est l'élément correct parmi ces 4 propositions ?`,
    choices: ['Proposition Bleue', 'Proposition Orange', 'Proposition Verte', 'Proposition Jaune'],
    correctIndex: 0,
    mediaKey: null,
    mediaDurationMs: null,
  };
}

export const useHubStore = defineStore('hub', () => {
  const activeTab = ref<'PROFILE' | 'RIVALRIES' | 'EDITOR' | 'WORKSHOP'>('PROFILE');
  const authToken = ref<string | null>(null);
  const currentUser = ref<HubUserProfile | null>(null);
  const rivalries = ref<HubRivalryItem[]>([]);
  const statusMessage = ref<string | null>(null);
  const errorMessage = ref<string | null>(null);

  // Préférences locales de personnalisation (synchronisées avec /controller)
  const selectedAvatarPreset = ref<string>(AVATAR_PRESETS[0]);
  const selectedAvatarColor = ref<string>(BUZZER_COLORS[0].hex);
  const selectedBuzzerSound = ref<string>(BUZZER_SOUNDS[0]);

  // Éditeur de Pack (Minimum strict : 12 questions — EDITOR-01 & MEDIA-01)
  const draftPack = reactive<DraftPackState>({
    title: 'Mon Nouveau Pack de Soirée',
    description: 'Un pack sur-mesure calibré en 12 questions pour nos soirées Buzz!',
    category: 'Pop Culture',
    visibility: 'PUBLIC',
    questions: [createEmptyQuestion(1)],
  });
  const activeDraftQuestionIndex = ref(0);

  // Workshop Communautaire
  const workshopPacks = ref<HubWorkshopPack[]>([]);
  const myAccessiblePacks = ref<HubWorkshopPack[]>([]);
  const workshopSearch = ref('');
  const workshopCategory = ref('ALL');
  const workshopSort = ref<'POPULAR' | 'RATING' | 'RECENT'>('POPULAR');

  const draftValidationResult = computed(() => {
    // Nettoyage normalisé avant validation Zod
    const payload = {
      title: draftPack.title.trim(),
      description: draftPack.description.trim(),
      category: draftPack.category.trim(),
      visibility: draftPack.visibility,
      questions: draftPack.questions.map((q) => ({
        subTheme: q.subTheme.trim(),
        difficulty: q.difficulty,
        format: q.format,
        prompt: q.prompt.trim(),
        choices: [
          q.choices[0].trim(),
          q.choices[1].trim(),
          q.choices[2].trim(),
          q.choices[3].trim(),
        ] as [string, string, string, string],
        correctIndex: q.correctIndex,
        mediaKey: q.format === 'TEXT_CLASSIC' ? undefined : q.mediaKey || undefined,
        mediaDurationMs:
          q.format === 'AUDIO_CLIP' ? (q.mediaDurationMs ?? 10000) : undefined,
      })),
    };
    return QuizPackCreateSchema.safeParse(payload);
  });

  const canSaveDraftPack = computed(() => draftValidationResult.value.success);

  const draftValidationErrors = computed<string[]>(() => {
    if (draftValidationResult.value.success) return [];
    return draftValidationResult.value.error.issues.map(
      (issue) => `${issue.path.join('.') || 'pack'}: ${issue.message}`
    );
  });

  const questionsProgressPct = computed(() =>
    Math.min(100, Math.round((draftPack.questions.length / 12) * 100))
  );

  const filteredWorkshopPacks = computed(() => {
    const q = workshopSearch.value.trim().toLowerCase();
    const cat = workshopCategory.value;

    const filtered = workshopPacks.value.filter((pack) => {
      const matchesQuery =
        !q ||
        pack.title.toLowerCase().includes(q) ||
        pack.description.toLowerCase().includes(q) ||
        pack.category.toLowerCase().includes(q);
      const matchesCat = cat === 'ALL' || pack.category === cat;
      return matchesQuery && matchesCat;
    });

    return [...filtered].sort((a, b) => {
      if (workshopSort.value === 'RATING') {
        const avgA = a.ratingCount > 0 ? a.ratingSum / a.ratingCount : 0;
        const avgB = b.ratingCount > 0 ? b.ratingSum / b.ratingCount : 0;
        return avgB - avgA;
      }
      if (workshopSort.value === 'RECENT') {
        return b.createdAt.localeCompare(a.createdAt);
      }
      return b.downloadsCount - a.downloadsCount;
    });
  });

  function resetDraftPack() {
    draftPack.title = 'Mon Nouveau Pack de Soirée';
    draftPack.description = 'Un pack sur-mesure calibré en 12 questions pour nos soirées Buzz!';
    draftPack.category = 'Pop Culture';
    draftPack.visibility = 'PUBLIC';
    draftPack.questions = [createEmptyQuestion(1)];
    activeDraftQuestionIndex.value = 0;
  }

  function addDraftQuestion() {
    const nextIdx = draftPack.questions.length + 1;
    draftPack.questions.push(createEmptyQuestion(nextIdx));
    activeDraftQuestionIndex.value = draftPack.questions.length - 1;
  }

  function removeDraftQuestion(index: number) {
    if (draftPack.questions.length <= 1) return;
    draftPack.questions.splice(index, 1);
    if (activeDraftQuestionIndex.value >= draftPack.questions.length) {
      activeDraftQuestionIndex.value = Math.max(0, draftPack.questions.length - 1);
    }
  }

  function fillDraftWithTemplateQuestions(targetCount = 12) {
    const currentLen = draftPack.questions.length;
    if (currentLen >= targetCount) {
      draftPack.questions.splice(targetCount);
    } else {
      for (let i = currentLen + 1; i <= targetCount; i++) {
        draftPack.questions.push(createEmptyQuestion(i));
      }
    }
    activeDraftQuestionIndex.value = Math.max(0, draftPack.questions.length - 1);
  }

  function getServerUrl(): string {
    return import.meta.env.VITE_SERVER_URL || 'http://localhost:3456';
  }

  async function registerUser(payload: {
    username: string;
    email: string;
    password: string;
  }): Promise<boolean> {
    errorMessage.value = null;
    statusMessage.value = null;
    try {
      const res = await fetch(`${getServerUrl()}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          avatarPreset: selectedAvatarPreset.value,
          avatarColor: selectedAvatarColor.value,
          buzzerSound: selectedBuzzerSound.value,
        }),
      });
      const data = (await res.json()) as {
        token?: string;
        user?: HubUserProfile;
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        errorMessage.value = data.error ?? 'Échec de création du compte';
        return false;
      }
      authToken.value = data.token;
      currentUser.value = data.user;
      statusMessage.value = `Bienvenue sur le plateau, ${data.user.username} !`;
      await fetchWorkshopPacks();
      return true;
    } catch {
      errorMessage.value = 'Impossible de joindre le serveur Buzz!';
      return false;
    }
  }

  async function loginUser(payload: { email: string; password: string }): Promise<boolean> {
    errorMessage.value = null;
    statusMessage.value = null;
    try {
      const res = await fetch(`${getServerUrl()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        token?: string;
        user?: HubUserProfile;
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        errorMessage.value = data.error ?? 'Identifiants invalides';
        return false;
      }
      authToken.value = data.token;
      currentUser.value = data.user;
      selectedAvatarPreset.value = data.user.avatarPreset;
      selectedAvatarColor.value = data.user.avatarColor;
      selectedBuzzerSound.value = data.user.buzzerSound;
      await fetchProfileAndRivalries();
      await fetchWorkshopPacks();
      return true;
    } catch {
      errorMessage.value = 'Impossible de joindre le serveur Buzz!';
      return false;
    }
  }

  async function fetchProfileAndRivalries(): Promise<void> {
    if (!authToken.value) return;
    try {
      const res = await fetch(`${getServerUrl()}/api/auth/me`, {
        headers: { Authorization: `Bearer ${authToken.value}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        user: HubUserProfile;
        rivalries: HubRivalryItem[];
      };
      currentUser.value = data.user;
      rivalries.value = data.rivalries;
    } catch {
      // Ignore network error in offline preview
    }
  }

  async function fetchWorkshopPacks(): Promise<void> {
    try {
      const res = await fetch(`${getServerUrl()}/api/packs`);
      if (res.ok) {
        const data = (await res.json()) as { packs: HubWorkshopPack[] };
        workshopPacks.value = data.packs;
      }
      if (authToken.value) {
        const myRes = await fetch(`${getServerUrl()}/api/packs/me`, {
          headers: { Authorization: `Bearer ${authToken.value}` },
        });
        if (myRes.ok) {
          const myData = (await myRes.json()) as { packs: HubWorkshopPack[] };
          myAccessiblePacks.value = myData.packs;
        }
      }
    } catch {
      // Fallback silencieux si le serveur n'est pas lancé
    }
  }

  async function saveDraftPack(): Promise<HubWorkshopPack | null> {
    errorMessage.value = null;
    statusMessage.value = null;
    const parsed = draftValidationResult.value;
    if (!parsed.success) {
      errorMessage.value =
        'Le pack doit contenir au moins 12 questions valides avant sauvegarde (EDITOR-01).';
      return null;
    }
    if (!authToken.value) {
      errorMessage.value = 'Connectez-vous dans l’onglet Profil pour publier votre Pack.';
      return null;
    }

    try {
      const res = await fetch(`${getServerUrl()}/api/packs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken.value}`,
        },
        body: JSON.stringify(parsed.data),
      });
      const data = (await res.json()) as { pack?: HubWorkshopPack; error?: string };
      if (!res.ok || !data.pack) {
        errorMessage.value = data.error ?? 'Erreur lors de la sauvegarde du pack';
        return null;
      }
      statusMessage.value = `Pack "${data.pack.title}" sauvegardé (${data.pack.questionsCount} questions) !`;
      await fetchWorkshopPacks();
      return data.pack;
    } catch {
      errorMessage.value = 'Erreur réseau lors de la sauvegarde du pack.';
      return null;
    }
  }

  async function downloadWorkshopPack(packId: string): Promise<boolean> {
    if (!authToken.value) {
      errorMessage.value = 'Connectez-vous pour ajouter ce pack à votre Banque de Salon.';
      return false;
    }
    try {
      const res = await fetch(`${getServerUrl()}/api/packs/${packId}/download`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken.value}` },
      });
      if (!res.ok) return false;
      statusMessage.value = 'Pack ajouté à votre Banque de Salon pour vos prochaines soirées !';
      await fetchWorkshopPacks();
      return true;
    } catch {
      return false;
    }
  }

  async function cloneWorkshopPack(packId: string): Promise<boolean> {
    if (!authToken.value) {
      errorMessage.value = 'Connectez-vous pour cloner et remixer ce pack.';
      return false;
    }
    try {
      const res = await fetch(`${getServerUrl()}/api/packs/${packId}/clone`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken.value}` },
      });
      if (!res.ok) return false;
      statusMessage.value = 'Pack cloné dans votre bibliothèque privée !';
      await fetchWorkshopPacks();
      return true;
    } catch {
      return false;
    }
  }

  async function rateWorkshopPack(packId: string, rating: number): Promise<boolean> {
    if (!authToken.value) {
      errorMessage.value = 'Connectez-vous pour noter ce pack.';
      return false;
    }
    try {
      const res = await fetch(`${getServerUrl()}/api/packs/${packId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken.value}`,
        },
        body: JSON.stringify({ rating }),
      });
      if (!res.ok) return false;
      await fetchWorkshopPacks();
      return true;
    } catch {
      return false;
    }
  }

  return {
    activeTab,
    authToken,
    currentUser,
    rivalries,
    statusMessage,
    errorMessage,
    selectedAvatarPreset,
    selectedAvatarColor,
    selectedBuzzerSound,
    draftPack,
    activeDraftQuestionIndex,
    workshopPacks,
    myAccessiblePacks,
    workshopSearch,
    workshopCategory,
    workshopSort,
    canSaveDraftPack,
    draftValidationErrors,
    questionsProgressPct,
    filteredWorkshopPacks,
    resetDraftPack,
    addDraftQuestion,
    removeDraftQuestion,
    fillDraftWithTemplateQuestions,
    registerUser,
    loginUser,
    fetchProfileAndRivalries,
    fetchWorkshopPacks,
    saveDraftPack,
    downloadWorkshopPack,
    cloneWorkshopPack,
    rateWorkshopPack,
  };
});
