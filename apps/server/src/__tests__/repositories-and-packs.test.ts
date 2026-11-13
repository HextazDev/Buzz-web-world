import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { createInMemoryRepositories } from '../repositories/in-memory.js';
import { registerAuthRoutes } from '../routes/auth.js';
import { registerPackRoutes } from '../routes/packs.js';
import { RoomManager } from '../state/room-machine.js';
import type { QuestionCreatePayload } from '@buzz/shared';

function buildValidQuestion(index: number): QuestionCreatePayload {
  return {
    subTheme: `Sous-Thème ${index}`,
    difficulty: ((index % 3) + 1) as 1 | 2 | 3,
    format: 'TEXT_CLASSIC',
    prompt: `Quelle est la bonne réponse pour la question numéro ${index} du pack ?`,
    choices: [`Choix A-${index}`, `Choix B-${index}`, `Choix C-${index}`, `Choix D-${index}`],
    correctIndex: (index % 4) as 0 | 1 | 2 | 3,
    mediaKey: null,
    mediaDurationMs: null,
  };
}

describe('Cloud-First Repositories, Auth & Packs REST API, and Room Question Pool (#4)', () => {
  it('[CLOUD-01] seeds InMemoryRepositories automatically with >= 2 official packs of >= 12 questions each', async () => {
    const repos = createInMemoryRepositories();
    const officialPacks = await repos.packs.listPublicAndOfficialPacks();

    expect(officialPacks.length).toBeGreaterThanOrEqual(2);
    for (const pack of officialPacks) {
      expect(pack.isOfficial).toBe(true);
      expect(pack.questionsCount).toBeGreaterThanOrEqual(12);
      const questions = await repos.packs.getPackQuestions(pack.id);
      expect(questions.length).toBeGreaterThanOrEqual(12);
    }
  });

  it('[SEC-01] registers, logs in, and returns sanitized user profile without passwordHash', async () => {
    const app = Fastify();
    const repos = createInMemoryRepositories();
    registerAuthRoutes(app, repos);
    await app.ready();

    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'BuzzMaster',
        email: 'buzz@example.com',
        password: 'SuperSecretPassword123!',
        avatarPreset: 'rocker',
        avatarColor: '#0066FF',
        buzzerSound: 'classic_tv',
      },
    });

    expect(regRes.statusCode).toBe(201);
    const regBody = regRes.json();
    expect(regBody.token).toBeTypeOf('string');
    expect(regBody.user.username).toBe('BuzzMaster');
    expect(regBody.user.passwordHash).toBeUndefined();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'buzz@example.com',
        password: 'SuperSecretPassword123!',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginBody = loginRes.json();
    expect(loginBody.token).toBeTypeOf('string');

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        authorization: `Bearer ${loginBody.token}`,
      },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user.email).toBe('buzz@example.com');
    expect(meRes.json().user.passwordHash).toBeUndefined();

    await app.close();
  });

  it('[PACK-01] rejects packs with < 12 questions (HTTP 400) and accepts valid >= 12 question packs (HTTP 201)', async () => {
    const app = Fastify();
    const repos = createInMemoryRepositories();
    registerAuthRoutes(app, repos);
    registerPackRoutes(app, repos);
    await app.ready();

    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'CreatorOne',
        email: 'creator@example.com',
        password: 'Password123!',
      },
    });
    const token = reg.json().token as string;

    // 1. Pack invalide : seulement 11 questions
    const invalidRes = await app.inject({
      method: 'POST',
      url: '/api/packs',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Pack Trop Court',
        description: 'Seulement 11 questions',
        category: 'Culture G',
        visibility: 'PUBLIC',
        questions: Array.from({ length: 11 }, (_, i) => buildValidQuestion(i + 1)),
      },
    });
    expect(invalidRes.statusCode).toBe(400);

    // 2. Pack valide : 12 questions
    const validRes = await app.inject({
      method: 'POST',
      url: '/api/packs',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Pack Science-Fiction Culte',
        description: '12 questions sur les classiques SF',
        category: 'Cinéma',
        visibility: 'PUBLIC',
        questions: Array.from({ length: 12 }, (_, i) => buildValidQuestion(i + 1)),
      },
    });
    expect(validRes.statusCode).toBe(201);
    const createdPack = validRes.json().pack;
    expect(createdPack.questionsCount).toBe(12);
    expect(createdPack.visibility).toBe('PUBLIC');

    await app.close();
  });

  it('[POOL-01] computes deduplicated union of Official Packs + Created Packs + Downloaded Packs for room players', async () => {
    const app = Fastify();
    const repos = createInMemoryRepositories();
    registerAuthRoutes(app, repos);
    registerPackRoutes(app, repos);
    await app.ready();

    // User A creates a public pack of 12 questions
    const regA = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'Alice', email: 'alice@example.com', password: 'Password123!' },
    });
    const tokenA = regA.json().token as string;
    const userAId = regA.json().user.id as string;

    const regB = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'Bob', email: 'bob@example.com', password: 'Password123!' },
    });
    const tokenB = regB.json().token as string;
    const userBId = regB.json().user.id as string;

    const createPackRes = await app.inject({
      method: 'POST',
      url: '/api/packs',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        title: 'Alice Pop Culture Pack',
        description: 'Pack communautaire de 12 questions',
        category: 'Pop Culture',
        visibility: 'PUBLIC',
        questions: Array.from({ length: 12 }, (_, i) => buildValidQuestion(i + 100)),
      },
    });
    const packId = createPackRes.json().pack.id as string;

    // Both Alice and Bob download the same pack + Bob rates and clones it
    const dlA = await app.inject({
      method: 'POST',
      url: `/api/packs/${packId}/download`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(dlA.statusCode).toBe(200);

    const dlB = await app.inject({
      method: 'POST',
      url: `/api/packs/${packId}/download`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(dlB.statusCode).toBe(200);

    const rateB = await app.inject({
      method: 'POST',
      url: `/api/packs/${packId}/rate`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { rating: 5 },
    });
    expect(rateB.statusCode).toBe(200);
    expect(rateB.json().pack.ratingCount).toBe(1);
    expect(rateB.json().pack.ratingSum).toBe(5);

    // Compute Room Pool for [Alice, Bob]:
    // Should contain exactly: 2 official packs (24 questions) + 1 Alice pack (12 questions) = 3 packs, 36 questions (no duplicates!)
    const pool = await repos.packs.buildRoomQuestionPool([userAId, userBId]);
    expect(pool.packs.length).toBe(3);
    expect(pool.questions.length).toBe(36);
    const uniqueQuestionIds = new Set(pool.questions.map((q) => q.id));
    expect(uniqueQuestionIds.size).toBe(36);

    // Clone pack by Bob -> adds 1 private cloned pack for Bob
    const cloneRes = await app.inject({
      method: 'POST',
      url: `/api/packs/${packId}/clone`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(cloneRes.statusCode).toBe(201);
    expect(cloneRes.json().pack.clonedFromId).toBe(packId);
    expect(cloneRes.json().pack.visibility).toBe('PRIVATE');

    // Sync with RoomManager
    const roomManager = new RoomManager();
    const room = roomManager.createRoom('host-socket-1', 'NORMAL');
    roomManager.syncRoomQuestionPool(room.roomCode, pool.packs, pool.questions);
    expect(room.questionPool.length).toBe(36);
    expect(room.packTitlesPool.length).toBe(3);

    await app.close();
  });

  it('[RIV-01 & AWARD-01] computes Buzz! Awards at game end and persists ordered friend_rivalries (user_a_id < user_b_id) + global_stats', async () => {
    const repos = createInMemoryRepositories();
    const userA = await repos.users.createUser(
      {
        username: 'AlphaUser',
        email: 'alpha@example.com',
        password: 'Password123!',
        avatarPreset: 'rocker',
        avatarColor: '#0066FF',
        buzzerSound: 'classic_tv',
      },
      'hash-a'
    );
    const userB = await repos.users.createUser(
      {
        username: 'BetaUser',
        email: 'beta@example.com',
        password: 'Password123!',
        avatarPreset: 'pirate',
        avatarColor: '#FF6600',
        buzzerSound: 'laser',
      },
      'hash-b'
    );

    const roomManager = new RoomManager();
    const room = roomManager.createRoom('host-1', 'SHORT');
    roomManager.joinOrReconnectPlayer(room.roomCode, 'sock-a', {
      userId: userA.id,
      guestName: 'AlphaUser',
    });
    roomManager.joinOrReconnectPlayer(room.roomCode, 'sock-b', {
      userId: userB.id,
      guestName: 'BetaUser',
    });

    // Simulate AlphaUser winning with > 40 taunts and BetaUser getting tarted & stolen
    const playerA = room.players.get(0)!;
    const playerB = room.players.get(1)!;
    playerA.score = 1800;
    playerA.tauntCount = 45;
    playerB.score = 900;

    roomManager.recordInteractionTelemetry(room.roomCode, {
      attackerSlot: 0,
      victimSlot: 1,
      kind: 'PIE_HIT',
    });
    roomManager.recordInteractionTelemetry(room.roomCode, {
      attackerSlot: 0,
      victimSlot: 1,
      kind: 'POINT_STEAL',
      pointsStolen: 300,
    });

    const ceremony = await roomManager.finalizeCeremonyAndRivalries(room.roomCode, repos);
    expect(ceremony).not.toBeNull();
    expect(ceremony!.winnerSlot).toBe(0);
    expect(ceremony!.awards.some((a) => a.code === 'BOUTTON_ROUGE_ADDICT')).toBe(true);
    expect(room.phase).toBe('AWARDS_CEREMONY');

    const rivalries = await repos.rivalries.listUserRivalries(userA.id);
    expect(rivalries.length).toBe(1);
    const riv = rivalries[0]!;
    // RIV-01 : Strict lexicographical ordering userAId < userBId
    expect(riv.userAId < riv.userBId).toBe(true);
    expect(riv.gamesTogether).toBe(1);
    expect(riv.aTartedB + riv.bTartedA).toBe(1);
    expect(riv.aStoleFromBPts + riv.bStoleFromAPts).toBe(300);

    const updatedA = await repos.users.findById(userA.id);
    expect(updatedA?.globalStats.games_played).toBe(1);
    expect(updatedA?.globalStats.games_won).toBe(1);
  });
});

