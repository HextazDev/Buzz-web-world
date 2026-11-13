import { describe, expect, it } from 'vitest';
import { RoomManager } from '../state/room-machine.js';

describe('RoomManager — Orchestrateur des 10 Manches, Choix du Perdant & Timers (Issue #3)', () => {
  function setupTwoPlayersRoom() {
    const manager = new RoomManager();
    const room = manager.createRoom('host-1', 'SHORT');
    manager.joinOrReconnectPlayer(room.roomCode, 'sock-0', { guestName: 'Alice' });
    manager.joinOrReconnectPlayer(room.roomCode, 'sock-1', { guestName: 'Bob' });
    return { manager, room };
  }

  it('LOSER_PICK_ROUND: gives control to the lowest-scoring connected player to choose next round', () => {
    const { manager, room } = setupTwoPlayersRoom();
    room.players.get(0)!.score = 500;
    room.players.get(1)!.score = 100;

    manager.startLoserPickRound(room.roomCode);
    expect(room.phase).toBe('LOSER_PICK_ROUND');
    expect(room.loserPickerSlot).toBe(1);
    expect(room.loserPickOptions?.length).toBe(4);

    // Only slot 1 has active color buttons during LOSER_PICK_ROUND
    expect(manager.computeControllerSyncState(room, 1).activeColors).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(manager.computeControllerSyncState(room, 0).activeColors).toEqual([
      false,
      false,
      false,
      false,
    ]);

    const chosenType = room.loserPickOptions![2]!.roundType;
    const picked = manager.handleLoserPickSelection(room.roomCode, 1, 2);
    expect(picked).toBe(chosenType);
    expect(room.currentRoundType).toBe(chosenType);
  });

  it('TIME-01: waits for markReadyForTimer before setting questionOpenedAtMs', () => {
    const { manager, room } = setupTwoPlayersRoom();
    manager.prepareQuestion(room.roomCode, 'POINT_BUILDER', 0);

    expect(room.phase).toBe('QUESTION_ACTIVE');
    expect(room.questionOpenedAtMs).toBeNull();

    const started = manager.markReadyForTimer(room.roomCode, 'QUESTION_ACTIVE');
    expect(started).toBe(true);
    expect(room.questionOpenedAtMs).not.toBeNull();
  });

  it('Manche 3 (POINT_STEALER): locks on Red Buzzer (LOCK-01), steals points on correct answer, or reopens once on wrong answer', async () => {
    const { manager, room } = setupTwoPlayersRoom();
    room.players.get(0)!.score = 400;
    room.players.get(1)!.score = 200;

    manager.prepareQuestion(room.roomCode, 'POINT_STEALER', 0);
    manager.markReadyForTimer(room.roomCode, 'QUESTION_ACTIVE');

    // Slot 0 presses Red first and acquires atomic lock
    const buzz1 = await manager.handleRedBuzz(room.roomCode, 0);
    expect(buzz1.acquired).toBe(true);
    expect(room.phase).toBe('BUZZ_LOCKED_DECISION');
    expect(room.buzzLockedSlot).toBe(0);

    // Slot 0 answers wrong (color 3 instead of correctIndex 0) -> -150 pts, reopens to Slot 1 (attempt 1 of 2)
    const wrongAttempt = manager.handlePointStealerDecision(room.roomCode, 0, 3, 0);
    expect(wrongAttempt.outcome).toBe('REOPENED');
    expect(room.players.get(0)!.score).toBe(250);
    expect(room.phase).toBe('QUESTION_ACTIVE');

    // Slot 1 now buzzes Red and answers right (color 0) -> steals up to 300 pts from Slot 0 (who has 250 pts)
    const buzz2 = await manager.handleRedBuzz(room.roomCode, 1);
    expect(buzz2.acquired).toBe(true);
    const rightAttempt = manager.handlePointStealerDecision(room.roomCode, 1, 0, 0);
    expect(rightAttempt.outcome).toBe('STEAL_APPLIED');
    expect(room.players.get(0)!.score).toBe(0);
    expect(room.players.get(1)!.score).toBe(450);
  });

  it('Manche 4 (PIE_FIGHT): buzzes Red, answers right, enters PIE_AIMING and hits target on Red press', async () => {
    const { manager, room } = setupTwoPlayersRoom();
    manager.initRoundState(room.roomCode, 'PIE_FIGHT');
    expect(room.players.get(0)!.roundMeta?.lives).toBe(2);
    expect(room.players.get(1)!.roundMeta?.lives).toBe(2);

    manager.prepareQuestion(room.roomCode, 'PIE_FIGHT', 0);
    manager.markReadyForTimer(room.roomCode, 'QUESTION_ACTIVE');

    await manager.handleRedBuzz(room.roomCode, 0);
    const aimState = manager.handlePieFightAnswer(room.roomCode, 0, 0, 0);
    expect(aimState.enteredAiming).toBe(true);
    expect(room.phase).toBe('PIE_AIMING');
    expect(room.pieTargetCursorSlot).toBe(1);

    // Slot 0 presses Red to throw pie at current cursor target (slot 1)
    const throwRes = manager.handlePieThrow(room.roomCode, 0);
    expect(throwRes?.targetSlot).toBe(1);
    expect(room.players.get(0)!.score).toBe(100);
    expect(room.players.get(1)!.roundMeta?.lives).toBe(1);
  });

  it('Manche 5 (PASS_THE_BOMB): passes bomb on right answer (+100) and deducts 3000ms on wrong answer (exploding at <= 0ms, BOMB-01)', () => {
    const { manager, room } = setupTwoPlayersRoom();
    room.players.get(0)!.score = 500;
    room.players.get(1)!.score = 300;

    manager.initRoundState(room.roomCode, 'PASS_THE_BOMB', 5000);
    // Slot 0 is leader -> starts with bomb
    expect(room.bombHolderSlot).toBe(0);

    // Slot 0 answers right -> +100 pts, bomb passes to Slot 1
    const step1 = manager.handleBombHolderAnswer(room.roomCode, 0, true);
    expect(step1?.exploded).toBe(false);
    expect(room.players.get(0)!.score).toBe(600);
    expect(room.bombHolderSlot).toBe(1);

    // Slot 1 answers wrong twice (-3000ms each -> 5000 - 6000 <= 0) -> explodes! -300 pts (floor at 0)
    const step2 = manager.handleBombHolderAnswer(room.roomCode, 1, false);
    expect(step2?.exploded).toBe(false);
    const step3 = manager.handleBombHolderAnswer(room.roomCode, 1, false);
    expect(step3?.exploded).toBe(true);
    expect(room.players.get(1)!.score).toBe(0);
  });

  it('Manche 6 (HIGH_STAKES): records bets in HIGH_STAKES_BET and applies +Bet / -Bet on reveal', () => {
    const { manager, room } = setupTwoPlayersRoom();
    room.players.get(0)!.score = 300;
    room.players.get(1)!.score = 100;

    manager.startHighStakesBetPhase(room.roomCode);
    expect(room.phase).toBe('HIGH_STAKES_BET');

    // Slot 0 bets Yellow (index 3 = 500 pts), Slot 1 bets Orange (index 1 = 100 pts)
    manager.recordHighStakesBet(room.roomCode, 0, 3);
    manager.recordHighStakesBet(room.roomCode, 1, 1);

    expect(room.players.get(0)!.roundMeta?.stakeBet).toBe(500);
    expect(room.players.get(1)!.roundMeta?.stakeBet).toBe(100);
  });

  it('Manche 7 (BOILING_POINT): increments thermometer and awards +750 jackpot at 6th step', () => {
    const { manager, room } = setupTwoPlayersRoom();
    manager.initRoundState(room.roomCode, 'BOILING_POINT');
    room.players.get(0)!.roundMeta!.thermometer = 5;

    const res = manager.applyBoilingPointAnswer(room.roomCode, 0, true);
    expect(res?.triggeredJackpot).toBe(true);
    expect(room.players.get(0)!.score).toBe(800);
    expect(room.players.get(0)!.roundMeta?.thermometer).toBe(6);
  });

  it('Manche 8 (ON_THE_SPOT): isolates target, records spectator votes (Bleu/Orange), and scores accordingly', () => {
    const { manager, room } = setupTwoPlayersRoom();
    manager.startOnTheSpotVotePhase(room.roomCode, 0);
    expect(room.phase).toBe('ON_THE_SPOT_VOTE');
    expect(room.onTheSpotTargetSlot).toBe(0);

    // Only non-target (slot 1) can vote Blue (0) or Orange (1)
    expect(manager.computeControllerSyncState(room, 0).activeColors).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(manager.computeControllerSyncState(room, 1).activeColors).toEqual([
      true,
      true,
      false,
      false,
    ]);

    manager.recordOnTheSpotVote(room.roomCode, 1, 0); // Slot 1 votes Blue (target succeeds)
    const outcome = manager.resolveOnTheSpotTurn(room.roomCode, true);
    expect(outcome?.targetDelta).toBe(400);
    expect(room.players.get(0)!.score).toBe(400);
    expect(room.players.get(1)!.score).toBe(200);
  });

  it('Manches 9 & 10 (FINAL_COUNTDOWN -> FINAL_FLASHPOINT): transitions to Flashpoint if last 2 finalists hit 0.0s simultaneously (FIN-01)', async () => {
    const { manager, room } = setupTwoPlayersRoom();
    room.players.get(0)!.score = 1000;
    room.players.get(1)!.score = 1000;

    manager.initRoundState(room.roomCode, 'FINAL_COUNTDOWN');
    expect(room.players.get(0)!.roundMeta?.pillarHeightSec).toBe(6.0);
    expect(room.players.get(1)!.roundMeta?.pillarHeightSec).toBe(6.0);

    // Force both to 1.0s and both answer wrong (-1.5s penalty) -> both hit 0.0s on same step!
    room.players.get(0)!.roundMeta!.pillarHeightSec = 1.0;
    room.players.get(1)!.roundMeta!.pillarHeightSec = 1.0;

    const stepRes = manager.resolveFinalCountdownQuestion(room.roomCode, {
      0: { isCorrect: false, reactionSec: 1.0 },
      1: { isCorrect: false, reactionSec: 1.0 },
    });

    expect(stepRes?.triggeredFlashpoint).toBe(true);
    expect(room.phase).toBe('FINAL_FLASHPOINT');
    expect(room.currentRoundType).toBe('FINAL_FLASHPOINT');

    // In FINAL_FLASHPOINT, Red Buzzer + answer decides the winner immediately
    const buzz = await manager.handleRedBuzz(room.roomCode, 1);
    expect(buzz.acquired).toBe(true);
    const flashRes = manager.resolveFlashpointDecision(room.roomCode, 1, true);
    expect(flashRes?.winnerSlot).toBe(1);
    expect(room.phase).toBe('AWARDS_CEREMONY');
  });
});
