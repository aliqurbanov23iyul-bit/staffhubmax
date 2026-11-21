import { Router } from 'express';
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from '../core/password';
import { getAuthorizedNavItems } from '../core/permissions';
import { sanitizeUser, store } from '../database/store';
import {
  clearSessionCookie,
  createSessionForUser,
  rateLimit,
  requireAuth,
  setSessionCookie,
  type AuthenticatedRequest,
} from '../middleware/auth';
import { realtime } from '../services/realtime';

export const authRouter = Router();

authRouter.post('/login', rateLimit(30, 60_000), async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Kullanıcı adı ve şifre zorunludur.' });
    return;
  }

  const normalized = username.trim().toLowerCase();
  const user = store.users.find((u) => u.username.toLowerCase() === normalized);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: 'Hesabınız devre dışı bırakılmıştır. Yönetici ile iletişime geçin.' });
    return;
  }

  user.lastLoginAt = new Date().toISOString();
  await store.persistUser(user);
  store.ensureDefaultTemplatesAndSettings(user);
  store.ensureTodayBreakSessionsForUser(user);

  const { token, session } = createSessionForUser(user, req);
  setSessionCookie(res, req, token);

  await store.persistAuditLog({
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    actorId: user.id,
    actorName: user.displayName,
    actorRole: user.role,
    action: 'OTURUM_ACILDI',
    targetType: 'session',
    targetId: session.id,
    details: `${user.username} sisteme giriş yaptı.`,
    createdAt: new Date().toISOString(),
  });

  const settings = store.userSettings.find((s) => s.userId === user.id);
  const navItems = getAuthorizedNavItems(user.role, store.rolePermissions);

  res.json({
    token,
    user: sanitizeUser(user),
    settings,
    navItems,
    permissions: store.rolePermissions[user.role] ?? [],
    mode: store.mode,
    databaseConnected: store.databaseConnected,
  });
});

authRouter.post('/logout', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.authSession) {
    store.sessions = store.sessions.filter((s) => s.id !== req.authSession!.id);
  }
  clearSessionCookie(res, req);
  realtime.broadcastPresence();
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  store.ensureDefaultTemplatesAndSettings(user);
  const settings = store.userSettings.find((s) => s.userId === user.id);
  const navItems = getAuthorizedNavItems(user.role, store.rolePermissions);
  const activeSessions = store.sessions
    .filter((s) => s.userId === user.id)
    .map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      isCurrent: s.id === req.authSession?.id,
    }));

  res.json({
    user: sanitizeUser(user),
    settings,
    navItems,
    permissions: store.rolePermissions[user.role] ?? [],
    activeSessions,
    mode: store.mode,
    databaseConnected: store.databaseConnected,
  });
});

authRouter.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const { currentPassword, newPassword, confirmPassword } = req.body ?? {};

  if (
    typeof currentPassword !== 'string' ||
    typeof newPassword !== 'string' ||
    typeof confirmPassword !== 'string'
  ) {
    res.status(400).json({ error: 'Tüm şifre alanları zorunludur.' });
    return;
  }

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    res.status(400).json({ error: 'Mevcut şifreniz doğrulanamadı.' });
    return;
  }

  if (newPassword !== confirmPassword) {
    res.status(400).json({ error: 'Yeni şifreler birbiriyle eşleşmiyor.' });
    return;
  }

  const check = validatePasswordStrength(newPassword);
  if (!check.valid) {
    res.status(400).json({ error: check.message });
    return;
  }

  user.passwordHash = hashPassword(newPassword);
  user.mustChangePassword = false;
  await store.persistUser(user);

  await store.persistAuditLog({
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    actorId: user.id,
    actorName: user.displayName,
    actorRole: user.role,
    action: 'SIFRE_DEGISTIRILDI',
    targetType: 'user',
    targetId: user.id,
    details: 'Kullanıcı kendi şifresini güncelledi.',
    createdAt: new Date().toISOString(),
  });

  res.json({ ok: true, message: 'Şifreniz başarıyla güncellendi.' });
});

authRouter.delete('/sessions/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const targetId = req.params.id;
  store.sessions = store.sessions.filter(
    (s) => !(s.id === targetId && s.userId === user.id),
  );
  res.json({ ok: true });
});
