import pg from 'pg';
import type {
  AuthRegisterPayload,
  BuzzerColor,
  QuestionFormat,
  QuizPackCreatePayload,
} from '@buzz/shared';
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
  UserGlobalStats,
  UsersRepository,
} from './interfaces.js';

const { Pool } = pg;

function mapPackRow(row: Record<string, unknown>): QuizPackEntity {
  return {
    id: String(row.id),
    authorId: row.author_id ? String(row.author_id) : null,
    title: String(row.title),
    description: String(row.description ?? ''),
    category: String(row.category),
    visibility: (row.visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE') as 'PRIVATE' | 'PUBLIC',
    isOfficial: Boolean(row.is_official),
    questionsCount: Number(row.questions_count ?? 0),
    downloadsCount: Number(row.downloads_count ?? 0),
    ratingSum: Number(row.rating_sum ?? 0),
    ratingCount: Number(row.rating_count ?? 0),
    clonedFromId: row.cloned_from_id ? String(row.cloned_from_id) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapQuestionRow(row: Record<string, unknown>): QuestionEntity {
  const rawChoices = Array.isArray(row.choices) ? row.choices.map(String) : ['A', 'B', 'C', 'D'];
  return {
    id: String(row.id),
    packId: String(row.pack_id),
    subTheme: String(row.sub_theme),
    difficulty: Number(row.difficulty ?? 2) as 1 | 2 | 3,
    format: String(row.format ?? 'TEXT_CLASSIC') as QuestionFormat,
    prompt: String(row.prompt),
    choices: [
      rawChoices[0] ?? 'A',
      rawChoices[1] ?? 'B',
      rawChoices[2] ?? 'C',
      rawChoices[3] ?? 'D',
    ],
    correctIndex: Number(row.correct_index ?? 0) as BuzzerColor,
    mediaKey: row.media_key ? String(row.media_key) : null,
    mediaDurationMs: row.media_duration_ms !== null && row.media_duration_ms !== undefined ? Number(row.media_duration_ms) : null,
    ttsCacheKey: row.tts_cache_key ? String(row.tts_cache_key) : null,
    presenterIntro: `Thème ${String(row.sub_theme)} : ouvrez bien les yeux sur l’écran TV !`,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapUserRow(row: Record<string, unknown>): UserEntity {
  return {
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    avatarPreset: String(row.avatar_preset ?? 'rocker'),
    avatarColor: String(row.avatar_color ?? '#0066FF'),
    buzzerSound: String(row.buzzer_sound ?? 'classic_tv'),
    role: (row.role === 'ADMIN' ? 'ADMIN' : 'USER') as 'USER' | 'ADMIN',
    globalStats: (row.global_stats ?? {
      games_played: 0,
      games_won: 0,
      total_questions: 0,
      correct_answers: 0,
      avg_reaction_ms: 0,
      titles_won: {},
    }) as UserGlobalStats,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function createPostgresRepositories(connectionString: string): Promise<AppRepositories> {
  const pool = new Pool({ connectionString });

  const users: UsersRepository = {
    async createUser(payload: AuthRegisterPayload, passwordHash: string): Promise<PublicUserProfile> {
      const res = await pool.query(
        `INSERT INTO users (username, email, password_hash, avatar_preset, avatar_color, buzzer_sound)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          payload.username,
          payload.email.toLowerCase(),
          passwordHash,
          payload.avatarPreset ?? 'rocker',
          payload.avatarColor ?? '#0066FF',
          payload.buzzerSound ?? 'classic_tv',
        ]
      );
      const { passwordHash: _ignored, ...pub } = mapUserRow(res.rows[0]);
      return pub;
    },

    async findByEmail(email: string) {
      const res = await pool.query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`, [
        email.trim(),
      ]);
      return res.rows[0] ? mapUserRow(res.rows[0]) : null;
    },

    async findByUsername(username: string) {
      const res = await pool.query(
        `SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
        [username.trim()]
      );
      return res.rows[0] ? mapUserRow(res.rows[0]) : null;
    },

    async findById(id: string) {
      const res = await pool.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [id]);
      if (!res.rows[0]) return null;
      const { passwordHash: _ignored, ...pub } = mapUserRow(res.rows[0]);
      return pub;
    },

    async updateStatsAfterGame(userId, delta) {
      const res = await pool.query(`SELECT global_stats FROM users WHERE id = $1`, [userId]);
      if (!res.rows[0]) return;
      const stats = res.rows[0].global_stats as UserGlobalStats;
      const prevQ = stats.total_questions ?? 0;
      stats.games_played = (stats.games_played ?? 0) + 1;
      if (delta.won) stats.games_won = (stats.games_won ?? 0) + 1;
      stats.total_questions = prevQ + delta.questionsCount;
      stats.correct_answers = (stats.correct_answers ?? 0) + delta.correctCount;
      if (stats.total_questions > 0) {
        stats.avg_reaction_ms = Math.round(
          ((stats.avg_reaction_ms ?? 0) * prevQ + delta.avgReactionMs * delta.questionsCount) /
            stats.total_questions
        );
      }
      if (delta.awardCode) {
        stats.titles_won = stats.titles_won ?? {};
        stats.titles_won[delta.awardCode] = (stats.titles_won[delta.awardCode] ?? 0) + 1;
      }
      await pool.query(`UPDATE users SET global_stats = $2 WHERE id = $1`, [
        userId,
        JSON.stringify(stats),
      ]);
    },
  };

  const packs: PacksRepository = {
    async listPublicAndOfficialPacks() {
      const res = await pool.query(
        `SELECT * FROM quiz_packs WHERE is_official = TRUE OR visibility = 'PUBLIC' ORDER BY is_official DESC, downloads_count DESC`
      );
      return res.rows.map(mapPackRow);
    },

    async listUserAccessiblePacks(userId: string) {
      const res = await pool.query(
        `SELECT DISTINCT qp.*
         FROM quiz_packs qp
         LEFT JOIN user_downloaded_packs udp ON udp.pack_id = qp.id AND udp.user_id = $1
         WHERE qp.is_official = TRUE OR qp.author_id = $1 OR udp.user_id = $1
         ORDER BY qp.is_official DESC, qp.created_at DESC`,
        [userId]
      );
      return res.rows.map(mapPackRow);
    },

    async getPackById(packId: string) {
      const res = await pool.query(`SELECT * FROM quiz_packs WHERE id = $1 LIMIT 1`, [packId]);
      return res.rows[0] ? mapPackRow(res.rows[0]) : null;
    },

    async getPackQuestions(packId: string) {
      const res = await pool.query(
        `SELECT * FROM questions WHERE pack_id = $1 ORDER BY created_at ASC`,
        [packId]
      );
      return res.rows.map(mapQuestionRow);
    },

    async createPack(authorId, payload: QuizPackCreatePayload, options) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const packRes = await client.query(
          `INSERT INTO quiz_packs (author_id, title, description, category, visibility, is_official, questions_count, cloned_from_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            authorId,
            payload.title,
            payload.description ?? '',
            payload.category,
            payload.visibility ?? 'PRIVATE',
            options?.isOfficial ?? false,
            payload.questions.length,
            options?.clonedFromId ?? null,
          ]
        );
        const pack = mapPackRow(packRes.rows[0]);

        for (const q of payload.questions) {
          await client.query(
            `INSERT INTO questions (pack_id, sub_theme, difficulty, format, prompt, choices, correct_index, media_key, media_duration_ms)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              pack.id,
              q.subTheme,
              q.difficulty ?? 2,
              q.format ?? 'TEXT_CLASSIC',
              q.prompt,
              JSON.stringify(q.choices),
              q.correctIndex,
              q.mediaKey ?? null,
              q.mediaDurationMs ?? null,
            ]
          );
        }

        await client.query('COMMIT');
        return pack;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async downloadPack(userId: string, packId: string) {
      const insertRes = await pool.query(
        `INSERT INTO user_downloaded_packs (user_id, pack_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *`,
        [userId, packId]
      );
      if (insertRes.rowCount && insertRes.rowCount > 0) {
        await pool.query(
          `UPDATE quiz_packs SET downloads_count = downloads_count + 1, updated_at = NOW() WHERE id = $1`,
          [packId]
        );
      }
      return this.getPackById(packId);
    },

    async clonePack(userId: string, sourcePackId: string) {
      const source = await this.getPackById(sourcePackId);
      if (!source) return null;
      const questions = await this.getPackQuestions(sourcePackId);
      if (questions.length < 12) return null;

      return this.createPack(
        userId,
        {
          title: `${source.title} (Remix)`,
          description: source.description,
          category: source.category,
          visibility: 'PRIVATE',
          questions: questions.map((q) => ({
            subTheme: q.subTheme,
            difficulty: q.difficulty,
            format: q.format,
            prompt: q.prompt,
            choices: q.choices,
            correctIndex: q.correctIndex,
            mediaKey: q.mediaKey,
            mediaDurationMs: q.mediaDurationMs,
          })),
        },
        { isOfficial: false, clonedFromId: source.id }
      );
    },

    async ratePack(packId: string, rating: number) {
      const res = await pool.query(
        `UPDATE quiz_packs
         SET rating_sum = rating_sum + $2, rating_count = rating_count + 1, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [packId, rating]
      );
      return res.rows[0] ? mapPackRow(res.rows[0]) : null;
    },

    async buildRoomQuestionPool(playerUserIds: string[]) {
      const packRes =
        playerUserIds.length > 0
          ? await pool.query(
              `SELECT DISTINCT qp.*
               FROM quiz_packs qp
               LEFT JOIN user_downloaded_packs udp ON udp.pack_id = qp.id
               WHERE qp.is_official = TRUE
                  OR qp.author_id = ANY($1::uuid[])
                  OR udp.user_id = ANY($1::uuid[])`,
              [playerUserIds]
            )
          : await pool.query(`SELECT * FROM quiz_packs WHERE is_official = TRUE`);

      const selectedPacks = packRes.rows.map(mapPackRow);
      if (selectedPacks.length === 0) {
        return { packs: [], questions: [] };
      }

      const packIds = selectedPacks.map((p) => p.id);
      const qRes = await pool.query(
        `SELECT * FROM questions WHERE pack_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
        [packIds]
      );

      return {
        packs: selectedPacks,
        questions: qRes.rows.map(mapQuestionRow),
      };
    },
  };

  const rivalries: RivalriesRepository = {
    async listUserRivalries(userId: string) {
      const res = await pool.query(
        `SELECT * FROM friend_rivalries WHERE user_a_id = $1 OR user_b_id = $1`,
        [userId]
      );
      return res.rows.map((r) => ({
        userAId: String(r.user_a_id),
        userBId: String(r.user_b_id),
        status: (r.status === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING') as 'PENDING' | 'ACCEPTED',
        requestedBy: String(r.requested_by),
        gamesTogether: Number(r.games_together ?? 0),
        aFinishedAhead: Number(r.a_finished_ahead ?? 0),
        bFinishedAhead: Number(r.b_finished_ahead ?? 0),
        aTartedB: Number(r.a_tarted_b ?? 0),
        bTartedA: Number(r.b_tarted_a ?? 0),
        aStoleFromBPts: Number(r.a_stole_from_b_pts ?? 0),
        bStoleFromAPts: Number(r.b_stole_from_a_pts ?? 0),
        updatedAt: new Date(String(r.updated_at)).toISOString(),
      }));
    },

    async upsertRivalryStats(userId1, userId2, delta) {
      const [userAId, userBId] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
      const is1A = userId1 === userAId;
      const aAhead = (is1A ? delta.user1FinishedAhead : delta.user2FinishedAhead) ? 1 : 0;
      const bAhead = (is1A ? delta.user2FinishedAhead : delta.user1FinishedAhead) ? 1 : 0;
      const aTart = is1A ? (delta.user1TartedUser2 ?? 0) : (delta.user2TartedUser1 ?? 0);
      const bTart = is1A ? (delta.user2TartedUser1 ?? 0) : (delta.user1TartedUser2 ?? 0);
      const aStole = is1A
        ? (delta.user1StoleFromUser2Pts ?? 0)
        : (delta.user2StoleFromUser1Pts ?? 0);
      const bStole = is1A
        ? (delta.user2StoleFromUser1Pts ?? 0)
        : (delta.user1StoleFromUser2Pts ?? 0);

      const res = await pool.query(
        `INSERT INTO friend_rivalries (
           user_a_id, user_b_id, status, requested_by, games_together,
           a_finished_ahead, b_finished_ahead, a_tarted_b, b_tarted_a,
           a_stole_from_b_pts, b_stole_from_a_pts, updated_at
         ) VALUES ($1, $2, 'ACCEPTED', $1, 1, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET
           games_together = friend_rivalries.games_together + 1,
           a_finished_ahead = friend_rivalries.a_finished_ahead + $3,
           b_finished_ahead = friend_rivalries.b_finished_ahead + $4,
           a_tarted_b = friend_rivalries.a_tarted_b + $5,
           b_tarted_a = friend_rivalries.b_tarted_a + $6,
           a_stole_from_b_pts = friend_rivalries.a_stole_from_b_pts + $7,
           b_stole_from_a_pts = friend_rivalries.b_stole_from_a_pts + $8,
           updated_at = NOW()
         RETURNING *`,
        [userAId, userBId, aAhead, bAhead, aTart, bTart, aStole, bStole]
      );
      const r = res.rows[0];
      return {
        userAId: String(r.user_a_id),
        userBId: String(r.user_b_id),
        status: 'ACCEPTED',
        requestedBy: String(r.requested_by),
        gamesTogether: Number(r.games_together),
        aFinishedAhead: Number(r.a_finished_ahead),
        bFinishedAhead: Number(r.b_finished_ahead),
        aTartedB: Number(r.a_tarted_b),
        bTartedA: Number(r.b_tarted_a),
        aStoleFromBPts: Number(r.a_stole_from_b_pts),
        bStoleFromAPts: Number(r.b_stole_from_a_pts),
        updatedAt: new Date(String(r.updated_at)).toISOString(),
      };
    },
  };

  // Seed initial des packs officiels si aucun pack officiel n'existe encore
  const existingOfficial = await packs.listPublicAndOfficialPacks();
  if (existingOfficial.filter((p) => p.isOfficial).length === 0) {
    for (const seedPack of OFFICIAL_SEED_PACKS) {
      await packs.createPack(null, seedPack, { isOfficial: true });
    }
  }

  const media: MediaStorageService = {
    getPublicUrl(mediaKey: string) {
      const baseUrl = process.env.S3_PUBLIC_URL ?? 'http://localhost:9000/buzz-media';
      return `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(mediaKey)}`;
    },
    async putObject(mediaKey: string) {
      return this.getPublicUrl(mediaKey);
    },
  };

  return {
    backend: 'postgres',
    users,
    packs,
    rivalries,
    media,
  };
}
