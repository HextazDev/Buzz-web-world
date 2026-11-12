import { describe, expect, it } from 'vitest';
import {
  ControllerJoinPayloadSchema,
  ControllerPressColorPayloadSchema,
  ControllerPressRedPayloadSchema,
  HostCreateRoomPayloadSchema,
  HostReadyForTimerPayloadSchema,
} from '../schemas.js';

describe('Socket.io Boundary Schemas (SEC-01)', () => {
  it('validates HostCreateRoomPayloadSchema and rejects out-of-range customRoundsCount', () => {
    expect(HostCreateRoomPayloadSchema.safeParse({ format: 'NORMAL' }).success).toBe(true);
    expect(
      HostCreateRoomPayloadSchema.safeParse({ format: 'CUSTOM', customRoundsCount: 6 }).success
    ).toBe(true);
    expect(
      HostCreateRoomPayloadSchema.safeParse({ format: 'CUSTOM', customRoundsCount: 999 }).success
    ).toBe(false);
    expect(HostCreateRoomPayloadSchema.safeParse(null).success).toBe(false);
  });

  it('validates ControllerJoinPayloadSchema and rejects null or malformed roomCode', () => {
    expect(
      ControllerJoinPayloadSchema.safeParse({ roomCode: 'abcd', guestName: 'Alice' }).success
    ).toBe(true);
    expect(ControllerJoinPayloadSchema.safeParse({ roomCode: null }).success).toBe(false);
    expect(ControllerJoinPayloadSchema.safeParse({ roomCode: 'AB' }).success).toBe(false);
    expect(ControllerJoinPayloadSchema.safeParse(undefined).success).toBe(false);
  });

  it('validates ControllerPressRedPayloadSchema and ControllerPressColorPayloadSchema', () => {
    expect(ControllerPressRedPayloadSchema.safeParse({ clientSentAt: 1700000000000 }).success).toBe(
      true
    );
    expect(ControllerPressRedPayloadSchema.safeParse({}).success).toBe(false);

    expect(
      ControllerPressColorPayloadSchema.safeParse({ color: 0, clientSentAt: 1700000000000 }).success
    ).toBe(true);
    expect(
      ControllerPressColorPayloadSchema.safeParse({ color: 3, clientSentAt: 1700000000000 }).success
    ).toBe(true);
    expect(
      ControllerPressColorPayloadSchema.safeParse({ color: 4, clientSentAt: 1700000000000 }).success
    ).toBe(false);
    expect(
      ControllerPressColorPayloadSchema.safeParse({ color: -1, clientSentAt: 1700000000000 })
        .success
    ).toBe(false);
  });

  it('validates HostReadyForTimerPayloadSchema', () => {
    expect(
      HostReadyForTimerPayloadSchema.safeParse({
        phase: 'QUESTION_ACTIVE',
        questionId: 'q-demo-1',
      }).success
    ).toBe(true);
    expect(HostReadyForTimerPayloadSchema.safeParse({ phase: 'INVALID_PHASE' }).success).toBe(
      false
    );
  });
});
