import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AppRepositories } from '../repositories/interfaces.js';
import type { RoomManager } from '../state/room-machine.js';

/**
 * WSS-01 : Paramètres de heartbeat Socket.io optimisés pour les reverse-proxies Cloud
 * (Cloudflare, Fly.io, Railway, Render) et la bascule mobile Wi-Fi <-> 4G/5G.
 */
export const SOCKET_IO_CLOUD_HEARTBEAT = {
  pingInterval: 15000,
  pingTimeout: 10000,
} as const;

export function resolvePublicJoinUrl(
  roomCode: string,
  publicWebUrl: string | undefined,
  fallbackOrigin: string
): string {
  const base = (publicWebUrl?.trim() || fallbackOrigin.trim()).replace(/\/+$/, '');
  return `${base}/controller?room=${encodeURIComponent(roomCode.trim().toUpperCase())}`;
}

export function buildCloudHealthPayload(
  roomManager: RoomManager,
  repos: AppRepositories,
  hasRedis: boolean
): {
  status: 'ok';
  service: 'buzz-web-world-server';
  dbBackend: 'in-memory' | 'postgres';
  lockBackend: 'in-memory' | 'redis';
  cloudFirstMode: 'managed-cloud' | 'zero-docker-autonomous';
  activeRoomsCount: number;
} {
  const isManaged = repos.backend === 'postgres' || hasRedis;
  return {
    status: 'ok',
    service: 'buzz-web-world-server',
    dbBackend: repos.backend,
    lockBackend: hasRedis ? 'redis' : 'in-memory',
    cloudFirstMode: isManaged ? 'managed-cloud' : 'zero-docker-autonomous',
    activeRoomsCount: roomManager.getActiveRoomsCount(),
  };
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.riv': 'application/octet-stream',
  '.ico': 'image/x-icon',
};

/**
 * En mode mono-conteneur Cloud (SERVE_STATIC_WEB=true), sert le bundle statique @buzz/web/dist
 * et redirige les routes SPA (/host, /controller, /hub) vers index.html.
 */
export function registerOptionalStaticSpaServing(
  app: FastifyInstance,
  webDistDir: string
): void {
  const indexHtmlPath = join(webDistDir, 'index.html');
  if (!existsSync(indexHtmlPath)) return;

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/socket.io')) {
      return reply.status(404).send({ error: 'NOT_FOUND' });
    }

    const cleanPath = normalize(request.url.split('?')[0] ?? '/').replace(/^(\.\.(\/|\\|$))+/, '');
    const candidatePath = join(webDistDir, cleanPath);

    if (cleanPath !== '/' && existsSync(candidatePath)) {
      try {
        const ext = extname(candidatePath);
        const content = readFileSync(candidatePath);
        return reply
          .type(MIME_TYPES[ext] ?? 'application/octet-stream')
          .send(content);
      } catch {
        // Fallback vers index.html SPA
      }
    }

    const indexHtml = readFileSync(indexHtmlPath);
    return reply.type('text/html; charset=utf-8').send(indexHtml);
  });
}
