import { describe, expect, it, vi } from 'vitest';
import { RoomManager } from '../state/room-machine.js';

describe('RoomManager Disconnect, Early Reveal & Memory Cleanup (CONN-01, MEM-01)', () => {
  it('encapsulates questionIndex and answers on ActiveRoom and triggers early reveal when a remaining player disconnects (CONN-01)', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('host-socket-1', 'NORMAL');

    const p1 = manager.joinOrReconnectPlayer(room.roomCode, 'sock-p1', { guestName: 'Alice' });
    const p2 = manager.joinOrReconnectPlayer(room.roomCode, 'sock-p2', { guestName: 'Bob' });
    expect(p1?.slotIndex).toBe(0);
    expect(p2?.slotIndex).toBe(1);

    room.phase = 'QUESTION_ACTIVE';
    room.answers.set(0, { color: 1, reactionSec: 1.25 });

    // Bob (slot 1) has not answered yet -> not all connected players have answered
    expect(manager.areAllConnectedPlayersAnswered(room.roomCode)).toBe(false);

    // Bob loses Wi-Fi and disconnects
    const disconnected = manager.markPlayerDisconnected(room.roomCode, 1);
    expect(disconnected).toBe(true);
    expect(room.players.get(1)?.isConnected).toBe(false);

    // Now Alice (slot 0) is the only connected player and has already answered -> early reveal!
    expect(manager.areAllConnectedPlayersAnswered(room.roomCode)).toBe(true);

    // If Bob reconnects with his reconnectToken, isConnected becomes true again
    const reconnected = manager.joinOrReconnectPlayer(room.roomCode, 'sock-p2-new', {
      reconnectToken: p2?.reconnectToken,
    });
    expect(reconnected?.slotIndex).toBe(1);
    expect(room.players.get(1)?.isConnected).toBe(true);
  });

  it('does not trigger early reveal if ALL players disconnect with 0 connected players remaining', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('host-socket-1', 'SHORT');
    manager.joinOrReconnectPlayer(room.roomCode, 'sock-p1', { guestName: 'Alice' });

    room.phase = 'QUESTION_ACTIVE';
    manager.markPlayerDisconnected(room.roomCode, 0);

    expect(manager.areAllConnectedPlayersAnswered(room.roomCode)).toBe(false);
  });

  it('clears watchdog timers and purges room & local locks on destroyRoom (MEM-01)', async () => {
    vi.useFakeTimers();
    const manager = new RoomManager();
    const room = manager.createRoom('host-socket-1', 'SHORT');

    const watchdogSpy = vi.fn();
    room.activeWatchdogTimer = setTimeout(watchdogSpy, 10000);
    await manager.tryAcquireBuzzLock(room.roomCode, 0);

    manager.destroyRoom(room.roomCode);

    vi.advanceTimersByTime(15000);
    expect(watchdogSpy).not.toHaveBeenCalled();
    expect(manager.getRoom(room.roomCode)).toBeUndefined();

    // Lock for that roomCode was purged so a new lock acquisition would succeed immediately
    expect(await manager.tryAcquireBuzzLock(room.roomCode, 1)).toBe(true);
    vi.useRealTimers();
  });
});
