import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Redis } from 'ioredis';
import { Server as SocketIOServer } from 'socket.io';
import {
  ControllerJoinPayloadSchema,
  ControllerPressColorPayloadSchema,
  ControllerPressRedPayloadSchema,
  HostCreateRoomPayloadSchema,
  HostReadyForTimerPayloadSchema,
  ROUND_TYPES,
  ScoringMath,
  type ControllerToServerEvents,
  type HostToServerEvents,
  type RoundType,
  type ServerToControllerEvents,
  type ServerToHostEvents,
} from '@buzz/shared';
import { createInMemoryRepositories } from './repositories/in-memory.js';
import type { AppRepositories } from './repositories/interfaces.js';
import { createPostgresRepositories } from './repositories/postgres.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerPackRoutes } from './routes/packs.js';
import { RoomManager } from './state/room-machine.js';

const PORT = Number(process.env.PORT ?? 3456);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const ALLOWED_ORIGINS = WEB_ORIGIN.split(',').map((origin) => origin.trim());

async function bootstrap() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: ALLOWED_ORIGINS });

  const roomManager = new RoomManager();

  // Cloud-First : Persistance PostgreSQL 16 optionnelle (fallback InMemory automatique avec seed de 24 questions si DATABASE_URL est absent)
  let repos: AppRepositories;
  if (process.env.DATABASE_URL) {
    try {
      repos = await createPostgresRepositories(process.env.DATABASE_URL);
      app.log.info('[DB] Connected to PostgreSQL 16');
    } catch (err) {
      app.log.warn({ err }, '[DB] Failed to connect to PostgreSQL, falling back to InMemoryRepositories');
      repos = createInMemoryRepositories();
    }
  } else {
    repos = createInMemoryRepositories();
  }

  // Cloud-First : Connexion Redis optionnelle (fallback mémoire automatique si REDIS_URL est absent)
  let redisClient: { set: (...args: unknown[]) => Promise<unknown> } | undefined;
  if (process.env.REDIS_URL) {
    const ioRedis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    ioRedis.on('error', (err) => {
      app.log.warn({ err }, '[REDIS] Fallback to in-memory locks');
    });
    try {
      await ioRedis.connect();
      redisClient = ioRedis as unknown as { set: (...args: unknown[]) => Promise<unknown> };
    } catch {
      redisClient = undefined;
    }
  }

  registerAuthRoutes(app, repos);
  registerPackRoutes(app, repos);

  app.get('/health', async () => ({
    status: 'ok',
    service: 'buzz-web-world-server',
    dbBackend: repos.backend,
    lockBackend: redisClient ? 'redis' : 'in-memory',
  }));

  await app.ready();

  const io = new SocketIOServer<
    ControllerToServerEvents & HostToServerEvents,
    ServerToControllerEvents & ServerToHostEvents
  >(app.server, {
    cors: { origin: ALLOWED_ORIGINS },
  });

  async function refreshRoomPool(roomCode: string) {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    const playerUserIds = roomManager.getRoomPlayerUserIds(roomCode);
    const pool = await repos.packs.buildRoomQuestionPool(playerUserIds);
    roomManager.syncRoomQuestionPool(roomCode, pool.packs, pool.questions);
  }

  function syncAllControllers(roomCode: string) {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    for (const [slotIndex, player] of room.players.entries()) {
      if (player.socketId && player.isConnected) {
        io.to(player.socketId).emit(
          'controller:state_sync',
          roomManager.computeControllerSyncState(room, slotIndex)
        );
      }
    }
  }

  function broadcastRoomState(roomCode: string) {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    io.to(`room:${room.roomCode}:host`).emit('host:room_state', {
      roomCode: room.roomCode,
      phase: room.phase,
      currentRoundIndex: room.currentRoundIndex,
      totalRounds: room.totalRounds,
      currentRoundType: room.currentRoundType,
      loserPickerSlot: room.loserPickerSlot,
      loserPickOptions: room.loserPickOptions,
      onTheSpotTargetSlot: room.onTheSpotTargetSlot,
      bombHolderSlot: room.bombHolderSlot,
      pieTargetCursorSlot: room.pieTargetCursorSlot,
      roomPoolPackCount: room.packTitlesPool.length,
      roomPoolQuestionCount: room.questionPool.length,
      players: Array.from(room.players.values()),
    });
    syncAllControllers(roomCode);
  }

  function startQuestionTimer(roomCode: string, durationMs = 10000) {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    roomManager.markReadyForTimer(roomCode, room.phase);
    if (room.activeWatchdogTimer) clearTimeout(room.activeWatchdogTimer);
    room.activeWatchdogTimer = setTimeout(() => {
      revealQuestion(roomCode);
    }, durationMs);
  }

  function startPieAimingCycle(roomCode: string) {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    if (room.pieAimIntervalTimer) clearInterval(room.pieAimIntervalTimer);

    room.pieAimIntervalTimer = setInterval(() => {
      const nextTarget = roomManager.advancePieTargetCursor(roomCode);
      if (nextTarget !== null && room.buzzLockedSlot !== null) {
        io.to(`room:${roomCode}:host`).emit('host:target_cursor_move', {
          attackerSlot: room.buzzLockedSlot,
          currentTargetSlot: nextTarget,
        });
      }
    }, 450);
  }

  function launchQuestion(roomCode: string, qIdx: number, explicitRoundType?: RoundType) {
    const room = roomManager.getRoom(roomCode);
    if (!room || room.questionPool.length === 0) return;
    const q = room.questionPool[qIdx % room.questionPool.length];
    if (!q) return;

    const roundType =
      explicitRoundType ??
      room.currentRoundType ??
      ROUND_TYPES[qIdx % 8] ??
      'POINT_BUILDER';

    if (room.currentRoundIndex === 0) {
      room.currentRoundIndex = 1;
      roomManager.initRoundState(roomCode, roundType);
    }

    roomManager.prepareQuestion(roomCode, roundType, qIdx);

    io.to(`room:${roomCode}:host`).emit('host:presenter_speak_start', {
      utteranceId: `utt-${Date.now()}`,
      mood: 4,
      subtitleText:
        q.presenterIntro ?? `Thème ${q.subTheme} : ouvrez bien les yeux sur l’écran TV !`,
    });

    // Anti-Triche strict : correct_index n'est JAMAIS envoyé dans host:question_show
    io.to(`room:${roomCode}:host`).emit('host:question_show', {
      questionId: q.id,
      roundNumber: Math.max(1, room.currentRoundIndex),
      questionIndexInRound: qIdx + 1,
      subTheme: q.subTheme,
      format: q.format,
      prompt: q.prompt,
      choices: q.choices,
      mediaUrl: q.mediaKey ? repos.media.getPublicUrl(q.mediaKey) : undefined,
      timerDurationMs: 10000,
    });

    broadcastRoomState(roomCode);

    // TIME-01 : Attend host:ready_for_timer (ou démarre automatiquement après 1.5s en fallback)
    if (room.activeWatchdogTimer) clearTimeout(room.activeWatchdogTimer);
    room.activeWatchdogTimer = setTimeout(() => {
      startQuestionTimer(roomCode, 10000);
    }, 1500);
  }

  function revealQuestion(roomCode: string) {
    const room = roomManager.getRoom(roomCode);
    if (!room || (room.phase !== 'QUESTION_ACTIVE' && room.phase !== 'FINAL_COUNTDOWN')) return;
    if (room.activeWatchdogTimer) {
      clearTimeout(room.activeWatchdogTimer);
      room.activeWatchdogTimer = undefined;
    }

    if (room.questionPool.length === 0) return;
    const qIdx = Math.max(0, room.currentQuestionIndex);
    const q = room.questionPool[qIdx % room.questionPool.length];
    if (!q) return;

    const scoreDeltas: Record<number, number> = {};
    const updatedScores: Record<number, number> = {};

    if (room.currentRoundType === 'FINAL_COUNTDOWN') {
      const resultsBySlot: Record<number, { isCorrect: boolean; reactionSec: number }> = {};
      for (const [slotIndex] of room.players.entries()) {
        const ans = room.answers.get(slotIndex);
        resultsBySlot[slotIndex] = {
          isCorrect: ans?.color === q.correctIndex,
          reactionSec: ans?.reactionSec ?? 10,
        };
      }
      roomManager.resolveFinalCountdownQuestion(roomCode, resultsBySlot);
      for (const [slotIndex, player] of room.players.entries()) {
        scoreDeltas[slotIndex] = 0;
        updatedScores[slotIndex] = player.score;
      }
    } else if (room.currentRoundType === 'ON_THE_SPOT' && room.onTheSpotTargetSlot !== null) {
      const targetAns = room.answers.get(room.onTheSpotTargetSlot);
      const isCorrect = targetAns?.color === q.correctIndex;
      const res = roomManager.resolveOnTheSpotTurn(roomCode, isCorrect);
      for (const [slotIndex, player] of room.players.entries()) {
        scoreDeltas[slotIndex] =
          slotIndex === room.onTheSpotTargetSlot
            ? (res?.targetDelta ?? 0)
            : (res?.voterDeltas[slotIndex] ?? 0);
        updatedScores[slotIndex] = player.score;
      }
    } else {
      room.phase = 'QUESTION_REVEAL';

      for (const [slotIndex, player] of room.players.entries()) {
        const ans = room.answers.get(slotIndex);
        const isCorrect = ans?.color === q.correctIndex;
        let delta = 0;

        if (room.currentRoundType === 'FASTEST_FINGER') {
          delta = ScoringMath.fastestFinger(isCorrect, ans?.reactionSec ?? 10);
          player.score += delta;
        } else if (room.currentRoundType === 'HIGH_STAKES') {
          const bet = (player.roundMeta?.stakeBet ?? 50) as 50 | 100 | 250 | 500;
          delta = ScoringMath.highStakes(isCorrect, bet, player.score);
          player.score += delta;
        } else if (room.currentRoundType === 'BOILING_POINT') {
          const step = roomManager.applyBoilingPointAnswer(roomCode, slotIndex, isCorrect);
          delta = step?.pointsDelta ?? 0;
        } else {
          delta = ScoringMath.pointBuilder(isCorrect);
          player.score += delta;
        }

        player.riveState = isCorrect ? 4 : 5;
        scoreDeltas[slotIndex] = delta;
        updatedScores[slotIndex] = player.score;
      }
    }

    io.to(`room:${roomCode}:host`).emit('host:question_reveal', {
      questionId: q.id,
      correctIndex: q.correctIndex,
      scoreDeltas,
      updatedScores,
    });

    const winners = Array.from(room.players.values()).filter(
      (p) => (scoreDeltas[p.slotIndex] ?? 0) > 0
    );
    const roast =
      winners.length === 0
        ? 'Zéro pointé dans tout le salon ! Même ma grand-mère aurait buzzé Bleu...'
        : `Bien joué ${winners.map((w) => w.displayName).join(', ')} ! Les autres, réveillez-vous !`;

    io.to(`room:${roomCode}:host`).emit('host:presenter_speak_start', {
      utteranceId: `utt-rev-${Date.now()}`,
      mood: winners.length === 0 ? 1 : 4,
      subtitleText: roast,
    });

    broadcastRoomState(roomCode);
  }

  io.on('connection', (socket) => {
    socket.on('host:create_room', async (rawPayload, ack) => {
      const parsed = HostCreateRoomPayloadSchema.safeParse(rawPayload);
      if (!parsed.success || typeof ack !== 'function') {
        app.log.warn({ err: parsed.error }, '[SEC-01] Rejected invalid host:create_room payload');
        return;
      }

      const room = roomManager.createRoom(
        socket.id,
        parsed.data.format,
        parsed.data.customRoundsCount
      );
      await refreshRoomPool(room.roomCode);
      socket.data.hostRoomCode = room.roomCode;
      socket.join(`room:${room.roomCode}:host`);
      ack({
        roomCode: room.roomCode,
        joinUrl: `${ALLOWED_ORIGINS[0] ?? WEB_ORIGIN}/controller?room=${room.roomCode}`,
      });
      broadcastRoomState(room.roomCode);
    });

    socket.on('host:start_game', () => {
      const roomCode = socket.data.hostRoomCode as string | undefined;
      if (!roomCode) return;
      const room = roomManager.getRoom(roomCode);
      if (!room || room.hostSocketId !== socket.id) return;

      const nextIdx = room.currentQuestionIndex + 1;
      launchQuestion(roomCode, nextIdx);
    });

    socket.on('host:ready_for_timer', (rawPayload) => {
      const parsed = HostReadyForTimerPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        app.log.warn(
          { err: parsed.error },
          '[SEC-01] Rejected invalid host:ready_for_timer payload'
        );
        return;
      }
      const roomCode = socket.data.hostRoomCode as string | undefined;
      if (!roomCode) return;
      const room = roomManager.getRoom(roomCode);
      if (!room || room.hostSocketId !== socket.id) return;

      startQuestionTimer(roomCode, 10000);
    });

    socket.on('controller:join', async (rawPayload) => {
      const parsed = ControllerJoinPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        app.log.warn({ err: parsed.error }, '[SEC-01] Rejected invalid controller:join payload');
        return;
      }

      const joined = roomManager.joinOrReconnectPlayer(
        parsed.data.roomCode,
        socket.id,
        parsed.data
      );
      if (!joined) return;
      const room = roomManager.getRoom(parsed.data.roomCode);
      if (!room) return;

      // POOL-01 : Recalcul dynamique de la Banque du Salon dès qu'un joueur rejoint
      await refreshRoomPool(room.roomCode);

      socket.data.roomCode = room.roomCode;
      socket.data.slotIndex = joined.slotIndex;
      socket.join(`room:${room.roomCode}:controllers`);

      socket.emit('controller:joined', joined);
      broadcastRoomState(room.roomCode);
    });

    socket.on('controller:press_red', async (rawPayload) => {
      const parsed = ControllerPressRedPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        app.log.warn(
          { err: parsed.error },
          '[SEC-01] Rejected invalid controller:press_red payload'
        );
        return;
      }

      const { roomCode, slotIndex } = socket.data as { roomCode?: string; slotIndex?: number };
      if (!roomCode || slotIndex === undefined) return;
      const room = roomManager.getRoom(roomCode);
      if (!room) return;

      // Manche 4 : Tir de tarte en phase PIE_AIMING
      if (room.phase === 'PIE_AIMING' && room.buzzLockedSlot === slotIndex) {
        const hit = roomManager.handlePieThrow(roomCode, slotIndex);
        if (hit) {
          io.to(`room:${room.roomCode}:host`).emit('host:avatar_trigger', {
            slotIndex: hit.targetSlot,
            trigger: 'Hit_Pie',
            riveState: 5,
          });
          broadcastRoomState(roomCode);
        }
        return;
      }

      // Manches à prise de main au Buzzer Rouge (POINT_STEALER, PIE_FIGHT, FINAL_FLASHPOINT)
      if (room.phase === 'QUESTION_ACTIVE' || room.phase === 'FINAL_FLASHPOINT') {
        const buzz = await roomManager.handleRedBuzz(roomCode, slotIndex, redisClient);
        if (buzz.acquired) {
          io.to(`room:${room.roomCode}:host`).emit('host:avatar_trigger', {
            slotIndex,
            riveState: 3,
            playBuzzerSound: true,
          });
          broadcastRoomState(roomCode);
        }
        return;
      }

      // Mode Hors-Question : Taunt + Son de Buzzer sur la TV
      const player = room.players.get(slotIndex);
      if (player) {
        player.tauntCount += 1;
        player.riveState = 6; // Taunt
      }
      io.to(`room:${room.roomCode}:host`).emit('host:avatar_trigger', {
        slotIndex,
        riveState: 6,
        playBuzzerSound: true,
      });
      broadcastRoomState(room.roomCode);
    });

    socket.on('controller:press_color', (rawPayload) => {
      const parsed = ControllerPressColorPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        app.log.warn(
          { err: parsed.error },
          '[SEC-01] Rejected invalid controller:press_color payload'
        );
        return;
      }
      const { color } = parsed.data;

      const { roomCode, slotIndex } = socket.data as { roomCode?: string; slotIndex?: number };
      if (!roomCode || slotIndex === undefined) return;
      const room = roomManager.getRoom(roomCode);
      if (!room) return;

      const qIdx = Math.max(0, room.currentQuestionIndex);
      const currentQ =
        room.questionPool.length > 0 ? room.questionPool[qIdx % room.questionPool.length] : undefined;

      // 1. Choix du Perdant (LOSER_PICK_ROUND)
      if (room.phase === 'LOSER_PICK_ROUND') {
        const pickedRound = roomManager.handleLoserPickSelection(roomCode, slotIndex, color);
        if (pickedRound) {
          broadcastRoomState(roomCode);
          launchQuestion(roomCode, room.currentQuestionIndex + 1, pickedRound);
        }
        return;
      }

      // 2. La Mise — Phase de pari (HIGH_STAKES_BET)
      if (room.phase === 'HIGH_STAKES_BET') {
        const bet = roomManager.recordHighStakesBet(roomCode, slotIndex, color);
        if (bet !== null) {
          broadcastRoomState(roomCode);
        }
        return;
      }

      // 3. Sur la Sellette — Phase de vote (ON_THE_SPOT_VOTE)
      if (room.phase === 'ON_THE_SPOT_VOTE') {
        if (roomManager.recordOnTheSpotVote(roomCode, slotIndex, color)) {
          broadcastRoomState(roomCode);
        }
        return;
      }

      // 4. Stop ou Encore — Sélection de la cible du vol (POINT_STEAL_TARGET)
      if (room.phase === 'POINT_STEAL_TARGET') {
        const steal = roomManager.handlePointStealTargetSelection(roomCode, slotIndex, color);
        if (steal && currentQ) {
          broadcastRoomState(roomCode);
        }
        return;
      }

      // 5. Décision après verrouillage du Buzzer Rouge (BUZZ_LOCKED_DECISION)
      if (room.phase === 'BUZZ_LOCKED_DECISION' && room.buzzLockedSlot === slotIndex && currentQ) {
        if (room.currentRoundType === 'POINT_STEALER') {
          roomManager.handlePointStealerDecision(roomCode, slotIndex, color, currentQ.correctIndex);
          broadcastRoomState(roomCode);
        } else if (room.currentRoundType === 'PIE_FIGHT') {
          const aim = roomManager.handlePieFightAnswer(
            roomCode,
            slotIndex,
            color,
            currentQ.correctIndex
          );
          if (aim.enteredAiming) {
            startPieAimingCycle(roomCode);
          }
          broadcastRoomState(roomCode);
        } else if (room.currentRoundType === 'FINAL_FLASHPOINT') {
          roomManager.resolveFlashpointDecision(roomCode, slotIndex, color === currentQ.correctIndex);
          broadcastRoomState(roomCode);
        }
        return;
      }

      // 6. La Bombe (PASS_THE_BOMB)
      if (
        room.phase === 'QUESTION_ACTIVE' &&
        room.currentRoundType === 'PASS_THE_BOMB' &&
        currentQ
      ) {
        const bombStep = roomManager.handleBombHolderAnswer(
          roomCode,
          slotIndex,
          color === currentQ.correctIndex
        );
        if (bombStep) {
          if (bombStep.exploded) {
            io.to(`room:${room.roomCode}:host`).emit('host:avatar_trigger', {
              slotIndex,
              trigger: 'Bomb_Explode',
              riveState: 5,
            });
          }
          broadcastRoomState(roomCode);
        }
        return;
      }

      // 7. Réponse directe aux 4 couleurs (POINT_BUILDER, FASTEST_FINGER, HIGH_STAKES, BOILING_POINT, ON_THE_SPOT, FINAL_COUNTDOWN)
      if (room.phase === 'QUESTION_ACTIVE' || room.phase === 'FINAL_COUNTDOWN') {
        if (room.answers.has(slotIndex)) return; // Premier appui verrouillé !

        const reactionSec = Math.max(
          0,
          (Date.now() - (room.questionOpenedAtMs ?? Date.now())) / 1000
        );
        room.answers.set(slotIndex, { color, reactionSec });

        const player = room.players.get(slotIndex);
        if (player) {
          player.riveState = 2; // Answered_Waiting
        }

        socket.emit('controller:state_sync', {
          phase: room.phase,
          redLedMode: 'SOLID_LOCKED',
          activeColors: [false, false, false, false],
          hapticPattern: [40, 60, 40],
          statusBanner: 'RÉPONSE VERROUILLÉE — REGARDEZ LA TV !',
        });

        io.to(`room:${room.roomCode}:host`).emit('host:avatar_trigger', {
          slotIndex,
          riveState: 2,
        });
        broadcastRoomState(room.roomCode);

        if (roomManager.areAllConnectedPlayersAnswered(roomCode)) {
          revealQuestion(roomCode);
        }
      } else {
        // Hors-question : Mimiques d'avatar
        io.to(`room:${room.roomCode}:host`).emit('host:avatar_trigger', {
          slotIndex,
          riveState: ((color % 4) + 2) as 2 | 3 | 4 | 5,
        });
      }
    });

    socket.on('disconnect', () => {
      const { roomCode, slotIndex, hostRoomCode } = socket.data as {
        roomCode?: string;
        slotIndex?: number;
        hostRoomCode?: string;
      };

      if (roomCode && slotIndex !== undefined) {
        const updated = roomManager.markPlayerDisconnected(roomCode, slotIndex);
        if (updated) {
          broadcastRoomState(roomCode);
          const room = roomManager.getRoom(roomCode);
          if (
            room?.phase === 'QUESTION_ACTIVE' &&
            roomManager.areAllConnectedPlayersAnswered(roomCode)
          ) {
            revealQuestion(roomCode);
          }
        }
      }

      if (hostRoomCode) {
        const room = roomManager.getRoom(hostRoomCode);
        if (room && room.hostSocketId === socket.id) {
          roomManager.destroyRoom(hostRoomCode);
        }
      }
    });
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 Serveur Buzz! Web World actif sur http://localhost:${PORT}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
