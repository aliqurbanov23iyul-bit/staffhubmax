import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { hashSessionToken } from '../core/password';
import { hasPermission } from '../core/permissions';
import type { PermissionKey, SessionRecord, User } from '../core/types';
import { store } from '../database/store';

export const SESSION_COOKIE_NAME = 'mb_session';

export interface AuthenticatedRequest extends Request {
  authUser?: User;
  authSession?: SessionRecord;
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      res.status(429).json({
        error: 'Çok fazla istek gönderildi. Lütfen kısa bir süre bekleyin.',
      });
      return;
    }
    next();
  };
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) result[key] = val;
  }
  return result;
}

export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME];
  }
  return null;
}

export function resolveSessionFromToken(token: string | null): { user: User; session: SessionRecord } | null {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const now = Date.now();
  const session = store.sessions.find((s) => s.tokenHash === tokenHash);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= now) {
    store.sessions = store.sessions.filter((s) => s.id !== session.id);
    return null;
  }
  const user = store.users.find((u) => u.id === session.userId);
  if (!user || !user.isActive) return null;
  session.lastSeenAt = new Date().toISOString();
  return { user, session };
}

export function createSessionForUser(user: User, req: Request): { token: string; session: SessionRecord } {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7); // 7 days
  const session: SessionRecord = {
    id: `sess_${crypto.randomBytes(8).toString('hex')}`,
    tokenHash: hashSessionToken(token),
    userId: user.id,
    userAgent: String(req.headers['user-agent'] || 'Tarayıcı').slice(0, 140),
    ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
  store.sessions.push(session);
  return { token, session };
}

export function setSessionCookie(res: Response, req: Request, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${60 * 60 * 24 * 7}`,
  ];
  if (isHttps) {
    attrs.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(res: Response, req: Request): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (isHttps) {
    attrs.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // CSRF check for mutating cookie-based requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const hasBearer = Boolean(req.headers.authorization?.startsWith('Bearer '));
    const hasXhr = req.headers['x-requested-with'] === 'XMLHttpRequest';
    const origin = req.headers.origin;
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;
    const originMatchesHost =
      origin && host && (origin.includes(host) || origin.startsWith('http://localhost'));
    if (!hasBearer && !hasXhr && !originMatchesHost) {
      res.status(403).json({ error: 'Güvenlik doğrulaması başarısız (CSRF).' });
      return;
    }
  }

  const token = extractTokenFromRequest(req);
  const resolved = resolveSessionFromToken(token);
  if (!resolved) {
    res.status(401).json({ error: 'Oturum geçersiz veya süresi dolmuş.' });
    return;
  }

  req.authUser = resolved.user;
  req.authSession = resolved.session;
  next();
}

export function requirePermission(permission: PermissionKey) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = req.authUser;
    if (!user) {
      res.status(401).json({ error: 'Oturum gerekli.' });
      return;
    }
    if (!hasPermission(user.role, permission, store.rolePermissions)) {
      res.status(403).json({ error: 'Bu işlem için yetkiniz bulunmamaktadır.' });
      return;
    }
    next();
  };
}
