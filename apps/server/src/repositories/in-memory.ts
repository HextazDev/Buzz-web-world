import { randomUUID } from 'node:crypto';
import type { AuthRegisterPayload, QuizPackCreatePayload } from '@buzz/shared';
import { OFFICIAL_SEED_PACKS } from '../db/seed-data.js';
import type {
  AppRepositories,
  FriendRivalryEntity,
  MediaStorageService,
  PacksRepository,
  PublicUserProfile,
  QuestionEntity,
  QuizPackEntity,
  RivalriesRepository,
  UserEntity,
  UsersRepository,
} from './interfaces.js';

function stripPassword(user: UserEntity): PublicUserProfile {
  const { passwordHash: _ignored, ...publicProfile } = user;
  return publicProfile;
}

export function createInMemoryRepositories(): AppRepositories {
  const usersById = new Map<string, UserEntity>();
  const packsById = new Map<string, QuizPackEntity>();
  const questionsByPackId = new Map<string, QuestionEntity[]>();
  const downloadedPacksByUser = new Map<string, Set<string>>();
  const rivalriesByPair = new Map<string, FriendRivalryEntity>();
  const mediaObjects = new Map<string, { data: Uint8Array; contentType: string }>();

  const insertPackSync = (
    authorId: string | null,
    payload: QuizPackCreatePayload,
    options?: { isOfficial?: boolean; clonedFromId?: string | null }
  ): QuizPackEntity => {
    const now = new Date().toISOString();
    const packId = randomUUID();
    const pack: QuizPackEntity = {
      id: packId,
      authorId,
      title: payload.title,
      description: payload.description ?? '',
      category: payload.category,
      visibility: payload.visibility ?? 'PRIVATE',
      isOfficial: options?.isOfficial ?? false,
      questionsCount: payload.questions.length,
      downloadsCount: 0,
      ratingSum: 0,
      ratingCount: 0,
      clonedFromId: options?.clonedFromId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const questions: QuestionEntity[] = payload.questions.map((q) => ({
      id: randomUUID(),
      packId,
      subTheme: q.subTheme,
      difficulty: (q.difficulty ?? 2) as 1 | 2 | 3,
      format: q.format ?? 'TEXT_CLASSIC',
      prompt: q.prompt,
      choices: [...q.choices] as [string, string, string, string],
      correctIndex: q.correctIndex,
      mediaKey: q.mediaKey ?? null,
      mediaDurationMs: q.mediaDurationMs ?? null,
      ttsCacheKey: null,
      presenterIntro: `Thème ${q.subTheme} : ouvrez bien les yeux sur l’écran TV !`,
      createdAt: now,
    }));

    packsById.set(packId, pack);
    questionsByPackId.set(packId, questions);
    return pack;
  };

  // Seed automatique des packs officiels (Zero-Docker-Required / Cloud-First)
  for (const seedPack of OFFICIAL_SEED_PACKS) {
    insertPackSync(null, seedPack, { isOfficial: true });
  }

  const users: UsersRepository = {
    async createUser(payload: AuthRegisterPayload, passwordHash: string) {
      const id = randomUUID();
      const now = new Date().toISOString();
      const entity: UserEntity = {
        id,
        username: payload.username,
        email: payload.email.toLowerCase(),
        passwordHash,
        avatarPreset: payload.avatarPreset ?? 'rocker',
        avatarColor: payload.avatarColor ?? '#0066FF',
        buzzerSound: payload.buzzerSound ?? 'classic_tv',
        role: 'USER',
        globalStats: {
          games_played: 0,
          games_won: 0,
          total_questions: 0,
          correct_answers: 0,
          avg_reaction_ms: 0,
          titles_won: {},
        },
        createdAt: now,
      };
      usersById.set(id, entity);
      return stripPassword(entity);
    },

    async findByEmail(email: string) {
      const normalized = email.trim().toLowerCase();
      for (const user of usersById.values()) {
        if (user.email === normalized) return user;
      }
      return null;
    },

    async findByUsername(username: string) {
      const normalized = username.trim().toLowerCase();
      for (const user of usersById.values()) {
        if (user.username.toLowerCase() === normalized) return user;
      }
      return null;
    },

    async findById(id: string) {
      const user = usersById.get(id);
      return user ? stripPassword(user) : null;
    },

    async updateStatsAfterGame(userId, delta) {
      const user = usersById.get(userId);
      if (!user) return;
      const stats = user.globalStats;
      const prevQuestions = stats.total_questions;
      stats.games_played += 1;
      if (delta.won) stats.games_won += 1;
      stats.total_questions += delta.questionsCount;
      stats.correct_answers += delta.correctCount;
      if (stats.total_questions > 0) {
        stats.avg_reaction_ms = Math.round(
          (stats.avg_reaction_ms * prevQuestions + delta.avgReactionMs * delta.questionsCount) /
            stats.total_questions
        );
      }
      if (delta.awardCode) {
        stats.titles_won[delta.awardCode] = (stats.titles_won[delta.awardCode] ?? 0) + 1;
      }
    },
  };

  const packs: PacksRepository = {
    async listPublicAndOfficialPacks() {
      return Array.from(packsById.values()).filter(
        (p) => p.isOfficial || p.visibility === 'PUBLIC'
      );
    },

    async listUserAccessiblePacks(userId: string) {
      const downloaded = downloadedPacksByUser.get(userId) ?? new Set<string>();
      return Array.from(packsById.values()).filter(
        (p) => p.isOfficial || p.authorId === userId || downloaded.has(p.id)
      );
    },

    async getPackById(packId: string) {
      return packsById.get(packId) ?? null;
    },

    async getPackQuestions(packId: string) {
      return [...(questionsByPackId.get(packId) ?? [])];
    },

    async createPack(authorId, payload, options) {
      return insertPackSync(authorId, payload, options);
    },

    async downloadPack(userId: string, packId: string) {
      const pack = packsById.get(packId);
      if (!pack) return null;
      let userSet = downloadedPacksByUser.get(userId);
      if (!userSet) {
        userSet = new Set();
        downloadedPacksByUser.set(userId, userSet);
      }
      if (!userSet.has(packId)) {
        userSet.add(packId);
        pack.downloadsCount += 1;
        pack.updatedAt = new Date().toISOString();
      }
      return { ...pack };
    },

    async clonePack(userId: string, sourcePackId: string) {
      const source = packsById.get(sourcePackId);
      const sourceQuestions = questionsByPackId.get(sourcePackId);
      if (!source || !sourceQuestions) return null;

      return insertPackSync(
        userId,
        {
          title: `${source.title} (Remix)`,
          description: source.description,
          category: source.category,
          visibility: 'PRIVATE',
          questions: sourceQuestions.map((q) => ({
            subTheme: q.subTheme,
            difficulty: q.difficulty,
            format: q.format,
            prompt: q.prompt,
            choices: [...q.choices] as [string, string, string, string],
            correctIndex: q.correctIndex,
            mediaKey: q.mediaKey,
            mediaDurationMs: q.mediaDurationMs,
          })),
        },
        { isOfficial: false, clonedFromId: source.id }
      );
    },

    async ratePack(packId: string, rating: number) {
      const pack = packsById.get(packId);
      if (!pack) return null;
      pack.ratingSum += rating;
      pack.ratingCount += 1;
      pack.updatedAt = new Date().toISOString();
      return { ...pack };
    },

    async buildRoomQuestionPool(playerUserIds: string[]) {
      // POOL-01 : Union ensembliste dédupliquée par pack.id :
      // Banque Salon = Packs Officiels U_{j in Joueurs} (Packs Créés par j U Packs Téléchargés par j)
      const selectedPackIds = new Set<string>();

      for (const pack of packsById.values()) {
        if (pack.isOfficial) {
          selectedPackIds.add(pack.id);
        }
      }

      for (const userId of playerUserIds) {
        for (const pack of packsById.values()) {
          if (pack.authorId === userId) {
            selectedPackIds.add(pack.id);
          }
        }
        const downloaded = downloadedPacksByUser.get(userId);
        if (downloaded) {
          for (const dlPackId of downloaded) {
            if (packsById.has(dlPackId)) {
              selectedPackIds.add(dlPackId);
            }
          }
        }
      }

      const selectedPacks: QuizPackEntity[] = [];
      const selectedQuestions: QuestionEntity[] = [];
      const seenQuestionIds = new Set<string>();

      for (const packId of selectedPackIds) {
        const pack = packsById.get(packId);
        if (!pack) continue;
        selectedPacks.push({ ...pack });
        const qs = questionsByPackId.get(packId) ?? [];
        for (const q of qs) {
          if (!seenQuestionIds.has(q.id)) {
            seenQuestionIds.add(q.id);
            selectedQuestions.push({ ...q });
          }
        }
      }

      return { packs: selectedPacks, questions: selectedQuestions };
    },
  };

  const rivalries: RivalriesRepository = {
    async listUserRivalries(userId: string) {
      return Array.from(rivalriesByPair.values()).filter(
        (r) => r.userAId === userId || r.userBId === userId
      );
    },

    async upsertRivalryStats(userId1, userId2, delta) {
      const [userAId, userBId] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
      const is1A = userId1 === userAId;
      const key = `${userAId}:${userBId}`;
      const now = new Date().toISOString();

      let entity = rivalriesByPair.get(key);
      if (!entity) {
        entity = {
          userAId,
          userBId,
          status: 'ACCEPTED',
          requestedBy: userId1,
          gamesTogether: 0,
          aFinishedAhead: 0,
          bFinishedAhead: 0,
          aTartedB: 0,
          bTartedA: 0,
          aStoleFromBPts: 0,
          bStoleFromAPts: 0,
          updatedAt: now,
        };
        rivalriesByPair.set(key, entity);
      }

      entity.gamesTogether += 1;
      if (delta.user1FinishedAhead) {
        if (is1A) entity.aFinishedAhead += 1;
        else entity.bFinishedAhead += 1;
      }
      if (delta.user2FinishedAhead) {
        if (is1A) entity.bFinishedAhead += 1;
        else entity.aFinishedAhead += 1;
      }
      if (delta.user1TartedUser2) {
        if (is1A) entity.aTartedB += delta.user1TartedUser2;
        else entity.bTartedA += delta.user1TartedUser2;
      }
      if (delta.user2TartedUser1) {
        if (is1A) entity.bTartedA += delta.user2TartedUser1;
        else entity.aTartedB += delta.user2TartedUser1;
      }
      if (delta.user1StoleFromUser2Pts) {
        if (is1A) entity.aStoleFromBPts += delta.user1StoleFromUser2Pts;
        else entity.bStoleFromAPts += delta.user1StoleFromUser2Pts;
      }
      if (delta.user2StoleFromUser1Pts) {
        if (is1A) entity.bStoleFromAPts += delta.user2StoleFromUser1Pts;
        else entity.aStoleFromBPts += delta.user2StoleFromUser1Pts;
      }
      entity.updatedAt = now;
      return { ...entity };
    },
  };

  const media: MediaStorageService = {
    getPublicUrl(mediaKey: string) {
      const baseUrl = process.env.S3_PUBLIC_URL ?? 'http://localhost:3456/api/media';
      return `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(mediaKey)}`;
    },
    async putObject(mediaKey: string, data: Uint8Array, contentType: string) {
      mediaObjects.set(mediaKey, { data, contentType });
      return this.getPublicUrl(mediaKey);
    },
  };

  return {
    backend: 'in-memory',
    users,
    packs,
    rivalries,
    media,
  };
}
