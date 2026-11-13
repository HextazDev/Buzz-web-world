import type { FastifyInstance } from 'fastify';
import { QuizPackCreateSchema, QuizPackRateSchema } from '@buzz/shared';
import type { AppRepositories } from '../repositories/interfaces.js';
import { verifyAuthToken } from './auth.js';

export function registerPackRoutes(app: FastifyInstance, repos: AppRepositories): void {
  app.get('/api/packs', async (request, reply) => {
    const userId = verifyAuthToken(request.headers.authorization);
    const publicPacks = await repos.packs.listPublicAndOfficialPacks();
    if (!userId) {
      return reply.status(200).send({ packs: publicPacks });
    }

    const userPacks = await repos.packs.listUserAccessiblePacks(userId);
    const mergedById = new Map(publicPacks.map((p) => [p.id, p]));
    for (const up of userPacks) {
      mergedById.set(up.id, up);
    }

    return reply.status(200).send({
      packs: Array.from(mergedById.values()),
    });
  });

  app.post('/api/packs', async (request, reply) => {
    const userId = verifyAuthToken(request.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: 'UNAUTHORIZED' });
    }

    const parsed = QuizPackCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'PACK_VALIDATION_FAILED',
        issues: parsed.error.issues,
      });
    }

    const pack = await repos.packs.createPack(userId, parsed.data, { isOfficial: false });
    return reply.status(201).send({ pack });
  });

  app.post<{ Params: { id: string } }>('/api/packs/:id/download', async (request, reply) => {
    const userId = verifyAuthToken(request.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: 'UNAUTHORIZED' });
    }

    const updated = await repos.packs.downloadPack(userId, request.params.id);
    if (!updated) {
      return reply.status(404).send({ error: 'PACK_NOT_FOUND' });
    }

    return reply.status(200).send({ pack: updated });
  });

  app.post<{ Params: { id: string } }>('/api/packs/:id/clone', async (request, reply) => {
    const userId = verifyAuthToken(request.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: 'UNAUTHORIZED' });
    }

    const cloned = await repos.packs.clonePack(userId, request.params.id);
    if (!cloned) {
      return reply.status(404).send({ error: 'PACK_NOT_FOUND' });
    }

    return reply.status(201).send({ pack: cloned });
  });

  app.post<{ Params: { id: string } }>('/api/packs/:id/rate', async (request, reply) => {
    const userId = verifyAuthToken(request.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: 'UNAUTHORIZED' });
    }

    const parsed = QuizPackRateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        issues: parsed.error.issues,
      });
    }

    const updated = await repos.packs.ratePack(request.params.id, parsed.data.rating);
    if (!updated) {
      return reply.status(404).send({ error: 'PACK_NOT_FOUND' });
    }

    return reply.status(200).send({ pack: updated });
  });
}
