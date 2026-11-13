import { describe, expect, it, vi } from 'vitest';
import { RoomManager } from '../state/room-machine.js';

describe('RoomManager — Formats, 8-Player Cap, Atomic Locks & Controller Sync (CONN-02)', () => {
  it('configures totalRounds according to game format (SHORT, NORMAL, LONG, CUSTOM)', () => {
    const manager = new RoomManager();
    expect(manager.createRoom('h1', 'SHORT').totalRounds).toBe(3);
    expect(manager.createRoom('h2', 'NORMAL').totalRounds).toBe(5);
    expect(manager.createRoom('h3', 'LONG').totalRounds).toBe(8);
    expect(manager.createRoom('h4', 'CUSTOM', 10).totalRounds).toBe(10);
    expect(manager.createRoom('h5', 'CUSTOM', 1).totalRounds).toBe(2);
    expect(manager.createRoom('h6', 'CUSTOM', 99).totalRounds).toBe(12);
  });

  it('accepts up to 8 players (slots 0..7), rejects a 9th player, and still allows reconnection (CONN-02)', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('host-1', 'NORMAL');

    const tokens: string[] = [];
    for (let i = 0; i < 8; i++) {
      const joined = manager.joinOrReconnectPlayer(room.roomCode, `sock-${i}`, {
        guestName: `Player ${i + 1}`,
      });
      expect(joined).not.toBeNull();
      expect(joined?.slotIndex).toBe(i);
      tokens.push(joined!.reconnectToken);
    }

    // 9th distinct player is rejected
    const ninth = manager.joinOrReconnectPlayer(room.roomCode, 'sock-9', {
      guestName: 'Intruder',
    });
    expect(ninth).toBeNull();
    expect(room.players.size).toBe(8);

    // Slot 3 can still reconnect even when room is full
    const reconnected = manager.joinOrReconnectPlayer(room.roomCode, 'sock-3-new', {
      reconnectToken: tokens[3],
    });
    expect(reconnected?.slotIndex).toBe(3);
    expect(room.players.get(3)?.socketId).toBe('sock-3-new');
  });

  it('enforces 4000 ms atomic buzz lock in memory and supports Redis NX PX 4000 client', async () => {
    vi.useFakeTimers();
    const manager = new RoomManager();
    const room = manager.createRoom('host-1', 'SHORT');

    expect(await manager.tryAcquireBuzzLock(room.roomCode, 0)).toBe(true);
    expect(await manager.tryAcquireBuzzLock(room.roomCode, 1)).toBe(false);

    // Advance 3999 ms -> still locked
    vi.advanceTimersByTime(3999);
    expect(await manager.tryAcquireBuzzLock(room.roomCode, 1)).toBe(false);

    // Advance +2 ms (total 4001 ms) -> lock expired, slot 1 can acquire
    vi.advanceTimersByTime(2);
    expect(await manager.tryAcquireBuzzLock(room.roomCode, 1)).toBe(true);

    // Verify Redis adapter delegation
    const redisMock = {
      set: vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null),
    };
    expect(await manager.tryAcquireBuzzLock(room.roomCode, 2, redisMock)).toBe(true);
    expect(redisMock.set).toHaveBeenCalledWith(
      `room:${room.roomCode}:buzz_lock`,
      '2',
      'NX',
      'PX',
      4000
    );
    expect(await manager.tryAcquireBuzzLock(room.roomCode, 3, redisMock)).toBe(false);

    vi.useRealTimers();
  });

  it('computes accurate LED and active color states across room phases', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('host-1', 'SHORT');

    // LOBBY -> Taunt active
    expect(manager.computeControllerSyncState(room, 0)).toEqual({
      phase: 'LOBBY',
      redLedMode: 'PULSE_READY',
      activeColors: [true, true, true, true],
      statusBanner: 'REGARDEZ LA TÉLÉVISION — MODE TAUNT ACTIF',
    });

    // QUESTION_ACTIVE -> Open before answer, locked after answer
    room.phase = 'QUESTION_ACTIVE';
    expect(manager.computeControllerSyncState(room, 0).activeColors).toEqual([
      true,
      true,
      true,
      true,
    ]);
    room.answers.set(0, { color: 2, reactionSec: 1.1 });
    expect(manager.computeControllerSyncState(room, 0)).toEqual({
      phase: 'QUESTION_ACTIVE',
      redLedMode: 'SOLID_LOCKED',
      activeColors: [false, false, false, false],
      statusBanner: 'RÉPONSE VERROUILLÉE — REGARDEZ LA TV !',
    });

    // BUZZ_LOCKED_DECISION -> Only holder has active colors
    room.phase = 'BUZZ_LOCKED_DECISION';
    room.buzzLockedSlot = 2;
    expect(manager.computeControllerSyncState(room, 2).activeColors).toEqual([
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

    // PIE_AIMING -> Shooter has AIM_TRIGGER
    room.phase = 'PIE_AIMING';
    room.buzzLockedSlot = 1;
    expect(manager.computeControllerSyncState(room, 1).redLedMode).toBe('AIM_TRIGGER');
    expect(manager.computeControllerSyncState(room, 0).redLedMode).toBe('OFF');
  });
});
