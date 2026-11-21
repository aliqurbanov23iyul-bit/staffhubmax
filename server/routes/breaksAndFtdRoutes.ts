import { Router } from 'express';
import {
  canStartBreak,
  computeBreakTiming,
  formatOverdueAlertMessage,
} from '../core/breaks';
import {
  computeFtdStats,
  filterFtdEntries,
  groupFtdByManager,
  hasDuplicateFtd,
} from '../core/ftd';
import { hasPermission } from '../core/permissions';
import type { FtdStatus } from '../core/types';
import { getTodayDateKey } from '../core/dates';
import { store } from '../database/store';
import { requireAuth, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { realtime } from '../services/realtime';

export const breaksAndFtdRouter = Router();
breaksAndFtdRouter.use(requireAuth);

// --- BREAK MANAGEMENT ---
breaksAndFtdRouter.get('/breaks/my', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const sessions = store.ensureTodayBreakSessionsForUser(user);
  const now = new Date();
  const enriched = sessions.map((s) => ({
    ...s,
    timing: computeBreakTiming(s, now),
  }));
  res.json({ breaks: enriched, serverTime: now.toISOString() });
});

breaksAndFtdRouter.get(
  '/breaks/control',
  requirePermission('breaks.control_all'),
  (req: AuthenticatedRequest, res) => {
    const todayKey = getTodayDateKey();
    for (const u of store.users) {
      if (u.isActive) store.ensureTodayBreakSessionsForUser(u);
    }

    const now = new Date();
    const sessions = store.breakSessions
      .filter((s) => s.dateKey === todayKey)
      .map((s) => ({
        ...s,
        timing: computeBreakTiming(s, now),
      }))
      .sort((a, b) => a.userName.localeCompare(b.userName) || a.breakNumber - b.breakNumber);

    const activeBreaks = sessions.filter(
      (s) => s.timing.status === 'Molada' || s.timing.status === 'Gecikti',
    );
    const overdueBreaks = sessions.filter((s) => s.timing.isOverdue && s.status !== 'Tamamlandı');

    res.json({
      sessions,
      activeBreaks,
      overdueBreaks,
      serverTime: now.toISOString(),
    });
  },
);

breaksAndFtdRouter.post('/breaks/:id/start', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const todayKey = getTodayDateKey();
  const userSessions = store.breakSessions.filter(
    (s) => s.userId === user.id && s.dateKey === todayKey,
  );
  const check = canStartBreak(userSessions, req.params.id);
  if (!check.ok) {
    res.status(400).json({ error: check.reason });
    return;
  }

  const target = store.breakSessions.find(
    (s) => s.id === req.params.id && s.userId === user.id,
  );
  if (!target) {
    res.status(404).json({ error: 'Mola kaydı bulunamadı.' });
    return;
  }

  const nowIso = new Date().toISOString();
  target.status = 'Molada';
  target.startedAt = nowIso;
  target.endedAt = null;
  target.overdueAlertSent = false;

  await store.persistAuditLog({
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    actorId: user.id,
    actorName: user.displayName,
    actorRole: user.role,
    action: 'MOLA_BASLAT',
    targetType: 'break',
    targetId: target.id,
    details: `${user.displayName} ${target.breakNumber}. molasına çıktı (${target.plannedMinutes} dk).`,
    createdAt: nowIso,
  });

  const timing = computeBreakTiming(target, new Date());
  realtime.broadcastAll('break:updated', { session: target, timing });
  res.json({ session: { ...target, timing }, serverTime: nowIso });
});

breaksAndFtdRouter.post('/breaks/:id/end', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const target = store.breakSessions.find((s) => s.id === req.params.id);
  if (!target) {
    res.status(404).json({ error: 'Mola kaydı bulunamadı.' });
    return;
  }

  const canControlAll = hasPermission(user.role, 'breaks.control_all', store.rolePermissions);
  if (target.userId !== user.id && !canControlAll) {
    res.status(403).json({ error: 'Bu molayı sonlandırma yetkiniz yok.' });
    return;
  }

  if (target.status !== 'Molada' && target.status !== 'Gecikti') {
    res.status(400).json({ error: 'Yalnızca aktif olan mola sonlandırılabilir.' });
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const preEndTiming = computeBreakTiming(target, now);
  target.status = 'Tamamlandı';
  target.endedAt = nowIso;

  if (preEndTiming.isOverdue && !target.overdueAlertSent) {
    target.overdueAlertSent = true;
    const alertMsg = formatOverdueAlertMessage(target, preEndTiming);
    const admins = store.users.filter((u) =>
      ['Super Admin', 'İşlem Admini', 'Takım Lideri'].includes(u.role),
    );
    for (const admin of admins) {
      realtime.pushNotification({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: admin.id,
        type: 'break_overdue',
        title: 'MOLA SÜRESİ AŞILDI',
        description: alertMsg,
        linkPage: 'break-control',
        linkEntityId: target.id,
        isRead: false,
        createdAt: nowIso,
      });
    }
  }

  await store.persistAuditLog({
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    actorId: user.id,
    actorName: user.displayName,
    actorRole: user.role,
    action: 'MOLA_BITIR',
    targetType: 'break',
    targetId: target.id,
    details: `${target.userName} ${target.breakNumber}. molasını bitirdi.`,
    createdAt: nowIso,
  });

  const timing = computeBreakTiming(target, now);
  realtime.broadcastAll('break:updated', { session: target, timing });
  res.json({ session: { ...target, timing }, serverTime: nowIso });
});

breaksAndFtdRouter.post(
  '/breaks/schedules',
  requirePermission('breaks.control_all'),
  async (req: AuthenticatedRequest, res) => {
    const admin = req.authUser!;
    const { userId, scheduledTime, durationMinutes } = req.body ?? {};
    const targetUser = store.users.find((u) => u.id === userId);
    if (!targetUser) {
      res.status(404).json({ error: 'Personel bulunamadı.' });
      return;
    }
    if (typeof scheduledTime !== 'string' || !/^\d{2}:\d{2}$/.test(scheduledTime)) {
      res.status(400).json({ error: 'Geçerli bir saat girin (SS:DD).' });
      return;
    }
    const dur = Number(durationMinutes);
    if (!Number.isFinite(dur) || dur < 5 || dur > 120) {
      res.status(400).json({ error: 'Mola süresi 5 ile 120 dakika arasında olmalıdır.' });
      return;
    }

    const existing = store.breakSchedules.filter((s) => s.userId === targetUser.id);
    const nextNum =
      existing.length > 0 ? Math.max(...existing.map((s) => s.breakNumber)) + 1 : 1;

    const sched = {
      id: `bs_${targetUser.id}_${Date.now()}`,
      userId: targetUser.id,
      userName: targetUser.displayName,
      team: targetUser.team,
      breakNumber: nextNum,
      scheduledTime,
      durationMinutes: Math.round(dur),
      extraMinutes: 0,
      createdAt: new Date().toISOString(),
    };
    store.breakSchedules.push(sched);
    store.ensureTodayBreakSessionsForUser(targetUser);

    await store.persistAuditLog({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'MOLA_EKLE',
      targetType: 'break_schedule',
      targetId: sched.id,
      details: `${targetUser.displayName} için ${scheduledTime} (${dur} dk) mola planlandı.`,
      createdAt: new Date().toISOString(),
    });

    realtime.broadcastAll('break:updated', { userId: targetUser.id });
    res.status(201).json({ schedule: sched });
  },
);

breaksAndFtdRouter.patch(
  '/breaks/schedules/:id',
  requirePermission('breaks.control_all'),
  (req: AuthenticatedRequest, res) => {
    const { scheduledTime, durationMinutes, extraMinutes } = req.body ?? {};
    const session = store.breakSessions.find((s) => s.id === req.params.id);
    const sched = store.breakSchedules.find(
      (s) => s.id === req.params.id || (session && s.id === session.scheduleId),
    );

    if (!sched && !session) {
      res.status(404).json({ error: 'Mola planı bulunamadı.' });
      return;
    }

    if (typeof scheduledTime === 'string' && /^\d{2}:\d{2}$/.test(scheduledTime)) {
      if (sched) sched.scheduledTime = scheduledTime;
      if (session) session.scheduledTime = scheduledTime;
    }
    if (durationMinutes !== undefined) {
      const dur = Number(durationMinutes);
      if (Number.isFinite(dur) && dur >= 5 && dur <= 120) {
        if (sched) sched.durationMinutes = Math.round(dur);
        if (session) session.plannedMinutes = Math.round(dur);
      }
    }
    if (extraMinutes !== undefined) {
      const ext = Number(extraMinutes);
      if (Number.isFinite(ext) && ext >= 0 && ext <= 60) {
        if (sched) sched.extraMinutes = Math.round(ext);
        if (session) session.extraMinutes = Math.round(ext);
      }
    }

    realtime.broadcastAll('break:updated', { session });
    res.json({ schedule: sched, session });
  },
);

breaksAndFtdRouter.post(
  '/breaks/:id/extend',
  requirePermission('breaks.control_all'),
  async (req: AuthenticatedRequest, res) => {
    const admin = req.authUser!;
    const addMin = Number(req.body?.minutes ?? 5);
    if (!Number.isFinite(addMin) || addMin < 1 || addMin > 60) {
      res.status(400).json({ error: 'Ek süre 1 ile 60 dakika arasında olmalıdır.' });
      return;
    }
    const session = store.breakSessions.find((s) => s.id === req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Mola oturumu bulunamadı.' });
      return;
    }
    session.extraMinutes += Math.round(addMin);
    const timing = computeBreakTiming(session, new Date());
    if (!timing.isOverdue && session.status === 'Gecikti') {
      session.status = 'Molada';
    }

    realtime.pushNotification({
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: session.userId,
      type: 'break_due',
      title: 'Ek Mola Süresi Tanımlandı',
      description: `${admin.displayName} ${session.breakNumber}. molanıza +${Math.round(addMin)} dk ek süre tanımladı.`,
      linkPage: 'breaks',
      linkEntityId: session.id,
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    realtime.broadcastAll('break:updated', { session, timing });
    res.json({ session: { ...session, timing } });
  },
);

breaksAndFtdRouter.delete(
  '/breaks/schedules/:id',
  requirePermission('breaks.control_all'),
  (req: AuthenticatedRequest, res) => {
    const session = store.breakSessions.find((s) => s.id === req.params.id);
    const schedId = session ? session.scheduleId : req.params.id;
    store.breakSchedules = store.breakSchedules.filter((s) => s.id !== schedId);
    store.breakSessions = store.breakSessions.filter(
      (s) => s.scheduleId !== schedId || s.status === 'Tamamlandı',
    );
    realtime.broadcastAll('break:updated', { removedScheduleId: schedId });
    res.json({ ok: true });
  },
);

// --- FTD TABLE & APPROVALS ---
breaksAndFtdRouter.get('/ftd', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const canApprove = hasPermission(user.role, 'ftd.approve', store.rolePermissions);
  const isSupervisor = user.role === 'Super Admin' || user.role === 'Takım Lideri';

  const base =
    canApprove || isSupervisor
      ? store.ftdEntries
      : store.ftdEntries.filter((e) => e.managerId === user.id);

  const filtered = filterFtdEntries(base, {
    managerId: typeof req.query.managerId === 'string' ? req.query.managerId : undefined,
    date: typeof req.query.date === 'string' ? req.query.date : undefined,
    status: (typeof req.query.status === 'string' ? req.query.status : 'Tümü') as
      | FtdStatus
      | 'Tümü',
    memberUsername:
      typeof req.query.memberUsername === 'string' ? req.query.memberUsername : undefined,
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({
    entries: filtered,
    grouped: groupFtdByManager(filtered),
    stats: computeFtdStats(filtered),
  });
});

breaksAndFtdRouter.post('/ftd', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  if (
    !hasPermission(user.role, 'ftd.create', store.rolePermissions) &&
    user.role !== 'Super Admin'
  ) {
    res.status(403).json({ error: 'FTD kaydı ekleme yetkiniz yok.' });
    return;
  }

  const { memberUsername, amount } = req.body ?? {};
  if (typeof memberUsername !== 'string' || !memberUsername.trim()) {
    res.status(400).json({ error: 'Üye kullanıcı adı zorunludur.' });
    return;
  }
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: 'Geçerli bir FTD tutarı giriniz.' });
    return;
  }

  const cleanUsername = memberUsername.trim();
  if (hasDuplicateFtd(store.ftdEntries, cleanUsername)) {
    res.status(409).json({
      error: `"${cleanUsername}" için zaten bir İlk Yatırım (FTD) kaydı bulunmaktadır. Mükerrer FTD eklenemez.`,
    });
    return;
  }

  const nowIso = new Date().toISOString();
  const entry = {
    id: `ftd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    managerId: user.id,
    managerName: user.displayName,
    team: user.team,
    memberUsername: cleanUsername,
    normalizedMemberUsername: cleanUsername.toLowerCase(),
    amount: Math.round(numAmount * 100) / 100,
    currency: 'TRY',
    status: 'Onay Bekliyor' as const,
    approvedByAdminId: null,
    approvedByAdminName: null,
    approvedAt: null,
    createdAt: nowIso,
  };

  store.ftdEntries.unshift(entry);
  await store.persistAuditLog({
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    actorId: user.id,
    actorName: user.displayName,
    actorRole: user.role,
    action: 'FTD_EKLE',
    targetType: 'ftd',
    targetId: entry.id,
    details: `${entry.memberUsername} — ${entry.amount} ₺ manuel FTD kaydı eklendi.`,
    createdAt: nowIso,
  });

  realtime.broadcastAll('ftd:created', entry);
  res.status(201).json({ entry });
});

breaksAndFtdRouter.post(
  '/ftd/:id/approve',
  requirePermission('ftd.approve'),
  async (req: AuthenticatedRequest, res) => {
    const admin = req.authUser!;
    const entry = store.ftdEntries.find((e) => e.id === req.params.id);
    if (!entry) {
      res.status(404).json({ error: 'FTD kaydı bulunamadı.' });
      return;
    }
    if (entry.status === 'Onaylandı') {
      res.status(409).json({ error: 'Bu FTD kaydı zaten onaylanmış.' });
      return;
    }

    const nowIso = new Date().toISOString();
    entry.status = 'Onaylandı';
    entry.approvedByAdminId = admin.id;
    entry.approvedByAdminName = admin.displayName;
    entry.approvedAt = nowIso;

    realtime.pushNotification({
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: entry.managerId,
      type: 'ftd_approved',
      title: 'FTD Onaylandı',
      description: `${entry.memberUsername} (${entry.amount} ₺) FTD kaydınız ${admin.displayName} tarafından onaylandı.`,
      linkPage: 'ftd',
      linkEntityId: entry.id,
      isRead: false,
      createdAt: nowIso,
    });

    await store.persistAuditLog({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'FTD_ONAYLA',
      targetType: 'ftd',
      targetId: entry.id,
      details: `${entry.memberUsername} (${entry.amount} ₺) FTD kaydı onaylandı.`,
      createdAt: nowIso,
    });

    realtime.broadcastAll('ftd:approved', entry);
    res.json({ entry });
  },
);
