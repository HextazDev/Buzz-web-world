import { describe, expect, it } from 'vitest';
import { createInMemoryRepositories } from '../repositories/in-memory.js';
import { RoomManager } from '../state/room-machine.js';
import {
  buildCloudHealthPayload,
  resolvePublicJoinUrl,
  SOCKET_IO_CLOUD_HEARTBEAT,
} from '../services/cloudDeploymentConfig.js';

describe('Cloud-First HTTPS Packaging, Health & WSS Heartbeat (#9)', () => {
  it('[WSS-01] exposes tuned Socket.io heartbeat intervals for 4G/5G <-> Wi-Fi mobile handoff', () => {
    expect(SOCKET_IO_CLOUD_HEARTBEAT.pingInterval).toBe(15000);
    expect(SOCKET_IO_CLOUD_HEARTBEAT.pingTimeout).toBe(10000);
  });

  it('resolves HTTPS Jackbox-style joinUrl behind a Cloud reverse proxy (PUBLIC_WEB_URL)', () => {
    const url = resolvePublicJoinUrl('K9X2', 'https://buzz.hextaz.dev/', 'http://localhost:5173');
    expect(url).toBe('https://buzz.hextaz.dev/controller?room=K9X2');

    const fallback = resolvePublicJoinUrl('A1B2', undefined, 'http://localhost:5173');
    expect(fallback).toBe('http://localhost:5173/controller?room=A1B2');
  });

  it('[SEC-ENV-01] builds /health payload with activeRoomsCount and storage backends without leaking secrets', () => {
    const roomManager = new RoomManager();
    const repos = createInMemoryRepositories();
    roomManager.createRoom('host-1', 'SHORT');
    roomManager.createRoom('host-2', 'NORMAL');

    const health = buildCloudHealthPayload(roomManager, repos, false);
    expect(health.status).toBe('ok');
    expect(health.activeRoomsCount).toBe(2);
    expect(health.dbBackend).toBe('in-memory');
    expect(health.lockBackend).toBe('in-memory');
    expect(health.cloudFirstMode).toBe('zero-docker-autonomous');
    expect(JSON.stringify(health)).not.toContain('AUTH_SECRET');
    expect(JSON.stringify(health)).not.toContain('DATABASE_URL');
  });
});
