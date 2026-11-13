import type {
  AuthRegisterPayload,
  BuzzerColor,
  QuestionFormat,
  QuizPackCreatePayload,
} from '@buzz/shared';

export interface UserGlobalStats {
  games_played: number;
  games_won: number;
  total_questions: number;
  correct_answers: number;
  avg_reaction_ms: number;
  titles_won: Record<string, number>;
}

export interface UserEntity {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  avatarPreset: string;
  avatarColor: string;
  buzzerSound: string;
  role: 'USER' | 'ADMIN';
  globalStats: UserGlobalStats;
  createdAt: string;
}

export type PublicUserProfile = Omit<UserEntity, 'passwordHash'>;

export interface QuizPackEntity {
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

export interface QuestionEntity {
  id: string;
  packId: string;
  subTheme: string;
  difficulty: 1 | 2 | 3;
  format: QuestionFormat;
  prompt: string;
  choices: [string, string, string, string];
  correctIndex: BuzzerColor;
  mediaKey: string | null;
  mediaDurationMs: number | null;
  ttsCacheKey: string | null;
  presenterIntro?: string;
  createdAt: string;
}

export interface FriendRivalryEntity {
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

export interface UsersRepository {
  createUser(payload: AuthRegisterPayload, passwordHash: string): Promise<PublicUserProfile>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByUsername(username: string): Promise<UserEntity | null>;
  findById(id: string): Promise<PublicUserProfile | null>;
  updateStatsAfterGame(
    userId: string,
    delta: {
      won: boolean;
      questionsCount: number;
      correctCount: number;
      avgReactionMs: number;
      awardCode?: string;
    }
  ): Promise<void>;
}

export interface PacksRepository {
  listPublicAndOfficialPacks(): Promise<QuizPackEntity[]>;
  listUserAccessiblePacks(userId: string): Promise<QuizPackEntity[]>;
  getPackById(packId: string): Promise<QuizPackEntity | null>;
  getPackQuestions(packId: string): Promise<QuestionEntity[]>;
  createPack(
    authorId: string | null,
    payload: QuizPackCreatePayload,
    options?: { isOfficial?: boolean; clonedFromId?: string | null }
  ): Promise<QuizPackEntity>;
  downloadPack(userId: string, packId: string): Promise<QuizPackEntity | null>;
  clonePack(userId: string, sourcePackId: string): Promise<QuizPackEntity | null>;
  ratePack(packId: string, rating: number): Promise<QuizPackEntity | null>;
  buildRoomQuestionPool(playerUserIds: string[]): Promise<{
    packs: QuizPackEntity[];
    questions: QuestionEntity[];
  }>;
}

export interface RivalriesRepository {
  listUserRivalries(userId: string): Promise<FriendRivalryEntity[]>;
  upsertRivalryStats(
    userId1: string,
    userId2: string,
    delta: {
      user1FinishedAhead?: boolean;
      user2FinishedAhead?: boolean;
      user1TartedUser2?: number;
      user2TartedUser1?: number;
      user1StoleFromUser2Pts?: number;
      user2StoleFromUser1Pts?: number;
    }
  ): Promise<FriendRivalryEntity>;
}

export interface MediaStorageService {
  getPublicUrl(mediaKey: string): string;
  putObject(mediaKey: string, data: Uint8Array, contentType: string): Promise<string>;
}

export interface AppRepositories {
  backend: 'in-memory' | 'postgres';
  users: UsersRepository;
  packs: PacksRepository;
  rivalries: RivalriesRepository;
  media: MediaStorageService;
}
