import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { AuthLoginSchema, AuthRegisterSchema } from '@buzz/shared';
import type { AppRepositories } from '../repositories/interfaces.js';

const AUTH_SECRET = process.env.AUTH_SECRET ?? 'buzz-web-world-dev-secret';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = scryptSync(password, salt, 64);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return timingSafeEqual(keyBuffer, derivedBuffer);
}

export function signAuthToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, iat: Date.now() }),
    'utf8'
  ).toString('base64url');
  const signature = createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyAuthToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) return null;
  const token = authorizationHeader.slice('Bearer '.length).trim();
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return null;

  const expectedSig = createHmac('sha256', AUTH_SECRET).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      sub?: string;
    };
    return typeof decoded.sub === 'string' ? decoded.sub : null;
  } catch {
    return null;
  }
}

export function registerAuthRoutes(app: FastifyInstance, repos: AppRepositories): void {
  app.post('/api/auth/register', async (request, reply) => {
    const parsed = AuthRegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        issues: parsed.error.issues,
      });
    }

    const existingEmail = await repos.users.findByEmail(parsed.data.email);
    if (existingEmail) {
      return reply.status(409).send({ error: 'EMAIL_ALREADY_USED' });
    }

    const existingUsername = await repos.users.findByUsername(parsed.data.username);
    if (existingUsername) {
      return reply.status(409).send({ error: 'USERNAME_ALREADY_USED' });
    }

    const passwordHash = hashPassword(parsed.data.password);
    const user = await repos.users.createUser(parsed.data, passwordHash);
    const token = signAuthToken(user.id);

    return reply.status(201).send({ token, user });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = AuthLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        issues: parsed.error.issues,
      });
    }

    const entity = await repos.users.findByEmail(parsed.data.email);
    if (!entity || !verifyPassword(parsed.data.password, entity.passwordHash)) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS' });
    }

    const user = await repos.users.findById(entity.id);
    const token = signAuthToken(entity.id);
    return reply.status(200).send({ token, user });
  });

  app.get('/api/auth/me', async (request, reply) => {
    const userId = verifyAuthToken(request.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: 'UNAUTHORIZED' });
    }

    const user = await repos.users.findById(userId);
    if (!user) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND' });
    }

    const rivalries = await repos.rivalries.listUserRivalries(userId);
    return reply.status(200).send({ user, rivalries });
  });
}
