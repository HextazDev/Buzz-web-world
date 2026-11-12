import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import {
  ScoringMath,
  type BuzzerColor,
  type ControllerToServerEvents,
  type HostToServerEvents,
  type QuestionFormat,
  type ServerToControllerEvents,
  type ServerToHostEvents,
} from '@buzz/shared';
import { RoomManager } from './state/room-machine.js';

const PORT = Number(process.env.PORT ?? 3456);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

interface DemoQuestion {
  id: string;
  subTheme: string;
  format: QuestionFormat;
  prompt: string;
  choices: [string, string, string, string];
  correctIndex: BuzzerColor;
  presenterIntro: string;
}

const DEMO_QUESTIONS: DemoQuestion[] = [
  {
    id: 'q-demo-1',
    subTheme: 'Jeux Vidéo Cultes',
    format: 'TEXT_CLASSIC',
    prompt: 'Sur quelle console est sorti Buzz! Quiz World en 2009 ?',
    choices: ['PlayStation 3', 'Nintendo 64', 'Sega Dreamcast', 'Atari 2600'],
    correctIndex: 0,
    presenterIntro: 'Première question ! Voyons qui a un minimum de culture générale dans ce salon...',
  },
  {
    id: 'q-demo-2',
    subTheme: 'Culture Web & Tech',
    format: 'TEXT_CLASSIC',
    prompt: 'Quelle couleur se trouve tout en haut des 4 boutons de réponse sur votre Buzzer ?',
    choices: ['Le Bleu', 'Le Vert', 'Le Jaune', 'Le Violet'],
    correctIndex: 0,
    presenterIntro: 'Ne regardez pas votre téléphone pour tricher... ah bah si, vous avez le droit !',
  },
  {
    id: 'q-demo-3',
    subTheme: 'Cinéma & Pop Culture',
    format: 'TEXT_CLASSIC',
    prompt: 'Dans quel film entend-on la réplique culte : « Le gras, c’est la vie » ?',
    choices: ['Les Bronzés', 'Kaamelott', 'Astérix & Obélix', 'OSS 117'],
    correctIndex: 1,
    presenterIntro: 'Attention, Doigt sur la gâchette : plus vous répondez vite, plus ça paye !',
  },
];

async function bootstrap() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  const roomManager = new RoomManager();
  const roomQuestionIndex = new Map<string, number>();
  const roomAnswers = new Map<string, Map<number, { color: BuzzerColor; reactionSec: number }>>();

  app.get('/health', async () => ({ status: 'ok', service: 'buzz-web-world-server' }));

  await app.ready();

  const io = new SocketIOServer<
    ControllerToServerEvents & HostToServerEvents,
    ServerToControllerEvents & ServerToHostEvents
  >(app.server, {
    cors: { origin: '*' },
  });

  function syncAllControllers(roomCode: string) {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    for (const [slotIndex, player] of room.players.entries()) {
      if (player.socketId) {
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
      players: Array.from(room.players.values()),
    });
    syncAllControllers(roomCode);
  }

  function launchQuestion(roomCode: string, qIdx: number) {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    const q = DEMO_QUESTIONS[qIdx % DEMO_QUESTIONS.length]!;

    roomQuestionIndex.set(roomCode, qIdx);
    roomAnswers.set(roomCode, new Map());
    room.phase = 'QUESTION_ACTIVE';
    room.currentRoundIndex = 1;
    room.currentRoundType = qIdx >= 2 ? 'FASTEST_FINGER' : 'POINT_BUILDER';
    room.questionOpenedAtMs = Date.now();

    for (const p of room.players.values()) {
      p.riveState = 1; // Thinking
    }

    io.to(`room:${roomCode}:host`).emit('host:presenter_speak_start', {
      utteranceId: `utt-${Date.now()}`,
      mood: 4,
      subtitleText: q.presenterIntro,
    });

    // Anti-Triche strict : correct_index n'est JAMAIS envoyé dans host:question_show
    io.to(`room:${roomCode}:host`).emit('host:question_show', {
      questionId: q.id,
      roundNumber: 1,
      questionIndexInRound: qIdx + 1,
      subTheme: q.subTheme,
      format: q.format,
      prompt: q.prompt,
      choices: q.choices,
      timerDurationMs: 10000,
    });

    broadcastRoomState(roomCode);

    if (room.activeWatchdogTimer) clearTimeout(room.activeWatchdogTimer);
    room.activeWatchdogTimer = setTimeout(() => {
      revealQuestion(roomCode);
    }, 10000);
  }

  function revealQuestion(roomCode: string) {
    const room = roomManager.getRoom(roomCode);
    if (!room || room.phase !== 'QUESTION_ACTIVE') return;
    if (room.activeWatchdogTimer) clearTimeout(room.activeWatchdogTimer);

    const qIdx = roomQuestionIndex.get(roomCode) ?? 0;
    const q = DEMO_QUESTIONS[qIdx % DEMO_QUESTIONS.length]!;
    const answers = roomAnswers.get(roomCode) ?? new Map();

    room.phase = 'QUESTION_REVEAL';

    const scoreDeltas: Record<number, number> = {};
    const updatedScores: Record<number, number> = {};

    for (const [slotIndex, player] of room.players.entries()) {
      const ans = answers.get(slotIndex);
      const isCorrect = ans?.color === q.correctIndex;
      const delta =
        room.currentRoundType === 'FASTEST_FINGER'
          ? ScoringMath.fastestFinger(isCorrect, ans?.reactionSec ?? 10)
          : ScoringMath.pointBuilder(isCorrect);

      player.score += delta;
      player.riveState = isCorrect ? 4 : 5; // 4: Celebrate, 5: Angry_Lose
      scoreDeltas[slotIndex] = delta;
      updatedScores[slotIndex] = player.score;
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
    socket.on('host:create_room', (payload, ack) => {
      const room = roomManager.createRoom(socket.id, payload.format, payload.customRoundsCount);
      socket.data.hostRoomCode = room.roomCode;
      socket.join(`room:${room.roomCode}:host`);
      ack({
        roomCode: room.roomCode,
        joinUrl: `${WEB_ORIGIN}/controller?room=${room.roomCode}`,
      });
      broadcastRoomState(room.roomCode);
    });

    socket.on('host:start_game', () => {
      const roomCode = socket.data.hostRoomCode as string | undefined;
      if (!roomCode) return;
      const nextIdx = (roomQuestionIndex.get(roomCode) ?? -1) + 1;
      launchQuestion(roomCode, nextIdx);
    });

    socket.on('controller:join', (payload) => {
      const joined = roomManager.joinOrReconnectPlayer(payload.roomCode, socket.id, payload);
      if (!joined) return;
      const room = roomManager.getRoom(payload.roomCode);
      if (!room) return;

      socket.data.roomCode = room.roomCode;
      socket.data.slotIndex = joined.slotIndex;
      socket.join(`room:${room.roomCode}:controllers`);

      socket.emit('controller:joined', joined);
      broadcastRoomState(room.roomCode);
    });

    socket.on('controller:press_red', async () => {
      const { roomCode, slotIndex } = socket.data as { roomCode?: string; slotIndex?: number };
      if (!roomCode || slotIndex === undefined) return;
      const room = roomManager.getRoom(roomCode);
      if (!room) return;

      // Mode Hors-Question : Taunt + Son de Buzzer sur la TV
      if (room.phase !== 'QUESTION_ACTIVE') {
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
        return;
      }
    });

    socket.on('controller:press_color', ({ color }) => {
      const { roomCode, slotIndex } = socket.data as { roomCode?: string; slotIndex?: number };
      if (!roomCode || slotIndex === undefined) return;
      const room = roomManager.getRoom(roomCode);
      if (!room) return;

      if (room.phase === 'QUESTION_ACTIVE') {
        const answers = roomAnswers.get(roomCode);
        if (!answers || answers.has(slotIndex)) return; // Premier appui verrouillé !

        const reactionSec = Math.max(0, (Date.now() - (room.questionOpenedAtMs ?? Date.now())) / 1000);
        answers.set(slotIndex, { color, reactionSec });

        const player = room.players.get(slotIndex);
        if (player) {
          player.riveState = 2; // Answered_Waiting
        }

        // Verrouille les boutons de ce joueur sur son smartphone
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

        // Si tous les joueurs connectés ont répondu, on révèle immédiatement !
        if (answers.size >= room.players.size && room.players.size > 0) {
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
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 Serveur Buzz! Web World actif sur http://localhost:${PORT}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
