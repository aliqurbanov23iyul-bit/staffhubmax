import { Router } from 'express';
import { computeBreakTiming } from '../core/breaks';
import { computeAdminPerformance, filterOperations } from '../core/filters';
import { computeFtdStats } from '../core/ftd';
import { generateSecureTempPassword, hashPassword } from '../core/password';
import { ALL_PERMISSIONS, ALL_ROLES, hasPermission } from '../core/permissions';
import type { AnnouncementPriority, PermissionKey, User, UserRole } from '../core/types';
import { getTodayDateKey } from '../core/dates';
import { sanitizeUser, store } from '../database/store';
import { requireAuth, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { realtime } from '../services/realtime';

export const adminAndSettingsRouter = Router();
adminAndSettingsRouter.use(requireAuth);

const AVATAR_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#06B6D4'];

// --- DASHBOARD ---
adminAndSettingsRouter.get('/dashboard', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const now = new Date();
  const todayKey = getTodayDateKey(now);
  const onlineIds = new Set(realtime.getOnlineUserIds());

  // Announcements relevant to user
  const myAnnouncements = store.announcements
    .filter(
      (a) =>
        a.targetAudience === 'Tümü' ||
        a.targetAudience === user.role ||
        a.targetAudience === user.team,
    )
    .slice(0, 4)
    .map((a) => ({
      ...a,
      acknowledged: store.announcementAcks.some(
        (ack) => ack.announcementId === a.id && ack.userId === user.id,
      ),
    }));

  const myNotifications = store.notifications
    .filter((n) => n.userId === user.id)
    .slice(0, 5);

  // Manager / Team Leader metrics
  const myMembers = store.members.filter((m) => m.ownerId === user.id && !m.isArchived);
  const myOps = store.operations.filter((o) => o.managerId === user.id);
  const myRemindersToday = store.reminders.filter(
    (r) => r.userId === user.id && !r.isCompleted && r.dueAt.slice(0, 10) === todayKey,
  );
  const myBreaks = store.ensureTodayBreakSessionsForUser(user).map((s) => ({
    ...s,
    timing: computeBreakTiming(s, now),
  }));
  const activeBreak = myBreaks.find(
    (b) => b.timing.status === 'Molada' || b.timing.status === 'Gecikti',
  );
  const myFtd = store.ftdEntries.filter((f) => f.managerId === user.id);

  // Admin & Super Admin metrics
  for (const u of store.users) {
    if (u.isActive) store.ensureTodayBreakSessionsForUser(u);
  }
  const allTodayBreaks = store.breakSessions
    .filter((b) => b.dateKey === todayKey)
    .map((b) => ({ ...b, timing: computeBreakTiming(b, now) }));

  // Super Admin filtered view
  const filterEmployeeId =
    typeof req.query.employeeId === 'string' ? req.query.employeeId : 'all';
  const filterTeam = typeof req.query.team === 'string' ? req.query.team : 'all';
  const filterDate =
    typeof req.query.datePreset === 'string'
      ? (req.query.datePreset as 'all' | 'today' | 'yesterday' | 'week' | 'month')
      : 'all';
  const filterStatus = typeof req.query.status === 'string' ? req.query.status : 'Tümü';

  let scopedOps = filterOperations(store.operations, {
    managerId: filterEmployeeId,
    status: filterStatus as any,
    datePreset: filterDate,
    referenceNow: now,
  });
  if (filterTeam !== 'all') {
    scopedOps = scopedOps.filter((o) => o.team === filterTeam);
  }

  const teams = Array.from(new Set(store.users.map((u) => u.team).filter(Boolean)));

  res.json({
    role: user.role,
    managerStats: {
      totalMembers: myMembers.length,
      pendingOps: myOps.filter((o) => o.status === 'Bekliyor' || o.status === 'İşleme Alındı').length,
      completedOps: myOps.filter((o) => o.status === 'Tamamlandı').length,
      todayReminders: myRemindersToday.length,
      breakStatus: activeBreak ? activeBreak.timing.status : 'Çalışıyor',
      ftdCount: myFtd.length,
      ftdApprovedCount: myFtd.filter((f) => f.status === 'Onaylandı').length,
      ftdTotalAmount: myFtd.reduce((sum, f) => sum + f.amount, 0),
    },
    adminStats: {
      onlineStaff: store.users.filter((u) => onlineIds.has(u.id)).length,
      onBreakStaff: allTodayBreaks.filter(
        (b) => b.timing.status === 'Molada' || b.timing.status === 'Gecikti',
      ).length,
      overdueBreaks: allTodayBreaks.filter(
        (b) => b.timing.isOverdue && b.status !== 'Tamamlandı',
      ).length,
      pendingOps: store.operations.filter((o) => o.status === 'Bekliyor').length,
      inProgressOps: store.operations.filter((o) => o.status === 'İşleme Alındı').length,
      completedOps: store.operations.filter((o) => o.status === 'Tamamlandı').length,
      ftdPending: store.ftdEntries.filter((f) => f.status === 'Onay Bekliyor').length,
    },
    superAdminOverview: {
      totalEmployees: store.users.length,
      activeEmployees: store.users.filter((u) => u.isActive).length,
      totalMembers: store.members.filter((m) => !m.isArchived).length,
      filteredOpsCount: scopedOps.length,
      filteredCompletedCount: scopedOps.filter((o) => o.status === 'Tamamlandı').length,
      filteredPendingCount: scopedOps.filter((o) => o.status === 'Bekliyor').length,
      filteredRejectedCount: scopedOps.filter((o) => o.status === 'Reddedildi').length,
      ftdStats: computeFtdStats(store.ftdEntries),
      adminPerformance: computeAdminPerformance(scopedOps),
      recentFilteredOps: scopedOps.slice(0, 8),
      teams,
      employees: store.users.map(sanitizeUser),
    },
    myAnnouncements,
    myNotifications,
    recentActivities: store.auditLogs.slice(0, 8),
  });
});

// --- STAFF MANAGEMENT & ACCOUNT CREATION ---
adminAndSettingsRouter.get('/users', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const onlineIds = new Set(realtime.getOnlineUserIds());
  const canInspect = hasPermission(user.role, 'staff.inspect', store.rolePermissions);
  if (!canInspect && user.role !== 'Super Admin') {
    // Allow minimal directory for mentions/filters
    res.json({
      users: store.users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        team: u.team,
        avatarColor: u.avatarColor,
        isActive: u.isActive,
        isOnline: onlineIds.has(u.id),
      })),
    });
    return;
  }

  res.json({
    users: store.users.map((u) => ({
      ...sanitizeUser(u),
      isOnline: onlineIds.has(u.id),
    })),
  });
});

adminAndSettingsRouter.post(
  '/users',
  requirePermission('staff.manage'),
  async (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const { username, displayName, role, team } = req.body ?? {};
    if (typeof username !== 'string' || !username.trim()) {
      res.status(400).json({ error: 'Kullanıcı adı zorunludur.' });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3 || cleanUsername.length > 80) {
      res.status(400).json({ error: 'Kullanıcı adı 3 ile 80 karakter arasında olmalıdır.' });
      return;
    }
    if (store.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      res.status(409).json({ error: 'Bu kullanıcı adı ile kayıtlı bir hesap zaten var.' });
      return;
    }

    const safeRole: UserRole = ALL_ROLES.includes(role) ? role : 'Menecer';
    if (safeRole === 'Super Admin' && actor.role !== 'Super Admin') {
      res.status(403).json({ error: 'Yalnızca Super Admin yeni Super Admin hesabı oluşturabilir.' });
      return;
    }

    const derivedName =
      typeof displayName === 'string' && displayName.trim()
        ? displayName.trim()
        : cleanUsername.split('@')[0];

    const tempPassword = generateSecureTempPassword(14);
    const nowIso = new Date().toISOString();
    const newUser: User = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      username: cleanUsername,
      displayName: derivedName,
      role: safeRole,
      team: typeof team === 'string' && team.trim() ? team.trim() : 'Genel',
      passwordHash: hashPassword(tempPassword),
      isActive: true,
      mustChangePassword: true,
      avatarColor: AVATAR_COLORS[store.users.length % AVATAR_COLORS.length],
      lastLoginAt: null,
      createdAt: nowIso,
    };

    store.users.push(newUser);
    await store.persistUser(newUser);
    store.ensureDefaultTemplatesAndSettings(newUser);

    await store.persistAuditLog({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      actorId: actor.id,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'HESAP_OLUSTUR',
      targetType: 'user',
      targetId: newUser.id,
      details: `${newUser.username} (${newUser.role} · ${newUser.team}) hesabı oluşturuldu.`,
      createdAt: nowIso,
    });

    // Return temporary password ONCE upon creation
    res.status(201).json({
      user: sanitizeUser(newUser),
      temporaryPassword: tempPassword,
    });
  },
);

adminAndSettingsRouter.patch(
  '/users/:id',
  requirePermission('staff.manage'),
  async (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const target = store.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Personel bulunamadı.' });
      return;
    }
    if (target.id === actor.id && req.body?.isActive === false) {
      res.status(400).json({ error: 'Kendi hesabınızı devre dışı bırakamazsınız.' });
      return;
    }

    const { displayName, role, team, isActive } = req.body ?? {};
    if (typeof displayName === 'string' && displayName.trim()) {
      target.displayName = displayName.trim();
    }
    if (ALL_ROLES.includes(role)) {
      if (role === 'Super Admin' && actor.role !== 'Super Admin') {
        res.status(403).json({ error: 'Yalnızca Super Admin bu rolü atayabilir.' });
        return;
      }
      target.role = role;
    }
    if (typeof team === 'string' && team.trim()) {
      target.team = team.trim();
    }
    if (typeof isActive === 'boolean') {
      target.isActive = isActive;
      if (!isActive) {
        store.sessions = store.sessions.filter((s) => s.userId !== target.id);
      }
    }

    await store.persistUser(target);
    await store.persistAuditLog({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      actorId: actor.id,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'PERSONEL_GUNCELLE',
      targetType: 'user',
      targetId: target.id,
      details: `${target.username} bilgileri güncellendi (${target.role} · ${target.isActive ? 'Aktif' : 'Pasif'}).`,
      createdAt: new Date().toISOString(),
    });

    res.json({ user: sanitizeUser(target) });
  },
);

adminAndSettingsRouter.post(
  '/users/:id/reset-password',
  requirePermission('staff.manage'),
  async (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const target = store.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Personel bulunamadı.' });
      return;
    }
    const tempPassword = generateSecureTempPassword(14);
    target.passwordHash = hashPassword(tempPassword);
    target.mustChangePassword = true;
    await store.persistUser(target);

    await store.persistAuditLog({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      actorId: actor.id,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'SIFRE_SIFIRLA',
      targetType: 'user',
      targetId: target.id,
      details: `${target.username} için geçici şifre sıfırlandı.`,
      createdAt: new Date().toISOString(),
    });

    res.json({
      user: sanitizeUser(target),
      temporaryPassword: tempPassword,
    });
  },
);

adminAndSettingsRouter.get(
  '/users/:id/inspect',
  requirePermission('staff.inspect'),
  (req: AuthenticatedRequest, res) => {
    const target = store.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Personel bulunamadı.' });
      return;
    }

    const members = store.members.filter((m) => m.ownerId === target.id && !m.isArchived);
    const memberIds = new Set(members.map((m) => m.id));
    const comments = store.memberComments
      .filter((c) => c.authorId === target.id || memberIds.has(c.memberId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const reminders = store.reminders.filter((r) => r.userId === target.id);
    const operations = store.operations
      .filter(
        (o) =>
          o.managerId === target.id ||
          o.claimedByAdminId === target.id ||
          o.resolvedByAdminId === target.id,
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const breaks = store.ensureTodayBreakSessionsForUser(target).map((b) => ({
      ...b,
      timing: computeBreakTiming(b, new Date()),
    }));
    const ftdEntries = store.ftdEntries.filter((f) => f.managerId === target.id);
    const activityHistory = store.auditLogs
      .filter((a) => a.actorId === target.id)
      .slice(0, 30);

    res.json({
      user: sanitizeUser(target),
      members,
      comments,
      reminders,
      operations,
      breaks,
      ftdEntries,
      activityHistory,
    });
  },
);

// --- ANNOUNCEMENTS ---
adminAndSettingsRouter.get('/announcements', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const canManage = hasPermission(user.role, 'announcements.manage', store.rolePermissions);
  const relevantUsersCount = (audience: string) => {
    if (audience === 'Tümü') return store.users.filter((u) => u.isActive).length;
    return store.users.filter(
      (u) => u.isActive && (u.role === audience || u.team === audience),
    ).length;
  };

  const list = store.announcements
    .filter(
      (a) =>
        canManage ||
        a.targetAudience === 'Tümü' ||
        a.targetAudience === user.role ||
        a.targetAudience === user.team,
    )
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .map((a) => {
      const acks = store.announcementAcks.filter((ack) => ack.announcementId === a.id);
      const targetUsers = store.users.filter(
        (u) =>
          u.isActive &&
          (a.targetAudience === 'Tümü' ||
            u.role === a.targetAudience ||
            u.team === a.targetAudience),
      );
      const unreadUsers = targetUsers.filter(
        (u) => !acks.some((ack) => ack.userId === u.id),
      );
      const totalTarget = Math.max(1, relevantUsersCount(a.targetAudience));
      return {
        ...a,
        acknowledgedByMe: acks.some((ack) => ack.userId === user.id),
        ackCount: acks.length,
        totalTarget,
        ackPercentage: Math.min(100, Math.round((acks.length / totalTarget) * 100)),
        acks: canManage ? acks : undefined,
        unreadUsers: canManage ? unreadUsers.map(sanitizeUser) : undefined,
      };
    });

  res.json({ announcements: list });
});

adminAndSettingsRouter.post(
  '/announcements',
  requirePermission('announcements.manage'),
  async (req: AuthenticatedRequest, res) => {
    const admin = req.authUser!;
    const { title, content, priority, targetAudience, publishedAt } = req.body ?? {};
    if (typeof title !== 'string' || !title.trim() || typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: 'Duyuru başlığı ve içeriği zorunludur.' });
      return;
    }

    const safePriority: AnnouncementPriority = ['Normal', 'Önemli', 'Acil'].includes(priority)
      ? priority
      : 'Normal';
    const audience =
      typeof targetAudience === 'string' && targetAudience.trim() ? targetAudience.trim() : 'Tümü';
    const nowIso = new Date().toISOString();
    const pubIso =
      typeof publishedAt === 'string' && publishedAt ? new Date(publishedAt).toISOString() : nowIso;

    const ann = {
      id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      content: content.trim(),
      priority: safePriority,
      targetAudience: audience,
      authorId: admin.id,
      authorName: admin.displayName,
      publishedAt: pubIso,
      createdAt: nowIso,
    };

    store.announcements.unshift(ann);

    // Notify target staff
    const targets = store.users.filter(
      (u) =>
        u.isActive &&
        u.id !== admin.id &&
        (audience === 'Tümü' || u.role === audience || u.team === audience),
    );
    for (const t of targets) {
      realtime.pushNotification({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: t.id,
        type: 'announcement',
        title: `Yeni Duyuru (${safePriority})`,
        description: ann.title,
        linkPage: 'announcements',
        linkEntityId: ann.id,
        isRead: false,
        createdAt: nowIso,
      });
    }

    await store.persistAuditLog({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'DUYURU_YAYINLA',
      targetType: 'announcement',
      targetId: ann.id,
      details: `${ann.title} (${audience}) yayınlandı.`,
      createdAt: nowIso,
    });

    realtime.broadcastAll('announcement:created', ann);
    res.status(201).json({ announcement: ann });
  },
);

adminAndSettingsRouter.post('/announcements/:id/acknowledge', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const ann = store.announcements.find((a) => a.id === req.params.id);
  if (!ann) {
    res.status(404).json({ error: 'Duyuru bulunamadı.' });
    return;
  }

  const existing = store.announcementAcks.find(
    (ack) => ack.announcementId === ann.id && ack.userId === user.id,
  );
  if (!existing) {
    const ack = {
      id: `ack_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      announcementId: ann.id,
      userId: user.id,
      userName: user.displayName,
      acknowledgedAt: new Date().toISOString(),
    };
    store.announcementAcks.push(ack);
    realtime.broadcastAll('announcement:acknowledged', ack);
  }

  res.json({ ok: true });
});

adminAndSettingsRouter.post(
  '/announcements/:id/remind',
  requirePermission('announcements.manage'),
  (req: AuthenticatedRequest, res) => {
    const ann = store.announcements.find((a) => a.id === req.params.id);
    if (!ann) {
      res.status(404).json({ error: 'Duyuru bulunamadı.' });
      return;
    }

    const acks = store.announcementAcks.filter((ack) => ack.announcementId === ann.id);
    const targets = store.users.filter(
      (u) =>
        u.isActive &&
        (ann.targetAudience === 'Tümü' ||
          u.role === ann.targetAudience ||
          u.team === ann.targetAudience) &&
        !acks.some((ack) => ack.userId === u.id),
    );

    const nowIso = new Date().toISOString();
    for (const t of targets) {
      realtime.pushNotification({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: t.id,
        type: 'announcement',
        title: 'Duyuru Okuma Hatırlatması',
        description: `"${ann.title}" duyurusunu henüz onaylamadınız.`,
        linkPage: 'announcements',
        linkEntityId: ann.id,
        isRead: false,
        createdAt: nowIso,
      });
    }

    res.json({ ok: true, remindedCount: targets.length });
  },
);

// --- NOTIFICATIONS ---
adminAndSettingsRouter.get('/notifications', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const list = store.notifications
    .filter((n) => n.userId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const unreadCount = list.filter((n) => !n.isRead).length;
  res.json({ notifications: list, unreadCount });
});

adminAndSettingsRouter.post('/notifications/read-all', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  for (const n of store.notifications) {
    if (n.userId === user.id) n.isRead = true;
  }
  res.json({ ok: true });
});

adminAndSettingsRouter.post('/notifications/:id/read', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const n = store.notifications.find(
    (item) => item.id === req.params.id && item.userId === user.id,
  );
  if (n) n.isRead = true;
  res.json({ ok: true });
});

// --- SETTINGS & PROFILE ---
adminAndSettingsRouter.get('/settings', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  store.ensureDefaultTemplatesAndSettings(user);
  const settings = store.userSettings.find((s) => s.userId === user.id);
  res.json({ settings });
});

adminAndSettingsRouter.patch('/settings', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  store.ensureDefaultTemplatesAndSettings(user);
  const settings = store.userSettings.find((s) => s.userId === user.id)!;
  const body = req.body ?? {};

  if (body.themeMode === 'dark' || body.themeMode === 'light') settings.themeMode = body.themeMode;
  if (
    ['mor-neon', 'ocean-blue', 'emerald', 'rose', 'amber', 'midnight'].includes(body.themePreset)
  ) {
    settings.themePreset = body.themePreset;
  }
  if (typeof body.customAccentColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(body.customAccentColor)) {
    settings.customAccentColor = body.customAccentColor;
  }
  if (['compact', 'normal', 'large'].includes(body.fontSize)) settings.fontSize = body.fontSize;
  if (typeof body.compactMode === 'boolean') settings.compactMode = body.compactMode;
  if (['narrow', 'normal', 'wide'].includes(body.sidebarWidth)) settings.sidebarWidth = body.sidebarWidth;
  if (['full', 'subtle', 'reduced'].includes(body.animationIntensity)) {
    settings.animationIntensity = body.animationIntensity;
  }
  if (typeof body.backgroundEffects === 'boolean') settings.backgroundEffects = body.backgroundEffects;
  if (['balanced', 'dense'].includes(body.dashboardLayout)) settings.dashboardLayout = body.dashboardLayout;
  if (typeof body.soundEnabled === 'boolean') settings.soundEnabled = body.soundEnabled;
  if (typeof body.notificationVolume === 'number') {
    settings.notificationVolume = Math.max(0, Math.min(100, Math.round(body.notificationVolume)));
  }
  if (typeof body.notifyChat === 'boolean') settings.notifyChat = body.notifyChat;
  if (typeof body.notifyOperations === 'boolean') settings.notifyOperations = body.notifyOperations;
  if (typeof body.notifyBreaks === 'boolean') settings.notifyBreaks = body.notifyBreaks;
  if (typeof body.notifyAnnouncements === 'boolean') settings.notifyAnnouncements = body.notifyAnnouncements;
  if (typeof body.desktopNotifications === 'boolean') settings.desktopNotifications = body.desktopNotifications;
  if (typeof body.quietMode === 'boolean') settings.quietMode = body.quietMode;

  if (typeof body.displayName === 'string' && body.displayName.trim()) {
    user.displayName = body.displayName.trim().slice(0, 60);
    await store.persistUser(user);
  }
  if (typeof body.avatarUrl === 'string') {
    if (body.avatarUrl === '' || body.avatarUrl.startsWith('data:image/')) {
      user.avatarUrl = body.avatarUrl ? body.avatarUrl.slice(0, 200_000) : null;
      await store.persistUser(user);
    }
  }

  res.json({ settings, user: sanitizeUser(user) });
});

// --- REPORTS, AUDIT LOGS, PERMISSIONS ---
adminAndSettingsRouter.get(
  '/reports',
  requirePermission('reports.view'),
  (_req: AuthenticatedRequest, res) => {
    const adminPerformance = computeAdminPerformance(store.operations);
    const ftdStats = computeFtdStats(store.ftdEntries);
    const byTeam = new Map<string, { team: string; members: number; operations: number; ftdAmount: number }>();

    for (const u of store.users) {
      if (!byTeam.has(u.team)) {
        byTeam.set(u.team, { team: u.team, members: 0, operations: 0, ftdAmount: 0 });
      }
    }
    for (const m of store.members) {
      if (m.isArchived) continue;
      const t = byTeam.get(m.team);
      if (t) t.members += 1;
    }
    for (const op of store.operations) {
      const t = byTeam.get(op.team);
      if (t) t.operations += 1;
    }
    for (const f of store.ftdEntries) {
      const t = byTeam.get(f.team);
      if (t) t.ftdAmount += f.amount;
    }

    res.json({
      adminPerformance,
      ftdStats,
      teamSummary: Array.from(byTeam.values()),
      operationBreakdown: {
        total: store.operations.length,
        pending: store.operations.filter((o) => o.status === 'Bekliyor').length,
        inProgress: store.operations.filter((o) => o.status === 'İşleme Alındı').length,
        completed: store.operations.filter((o) => o.status === 'Tamamlandı').length,
        rejected: store.operations.filter((o) => o.status === 'Reddedildi').length,
      },
    });
  },
);

adminAndSettingsRouter.get(
  '/audit-logs',
  requirePermission('audit.view'),
  (req: AuthenticatedRequest, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const list = search
      ? store.auditLogs.filter(
          (l) =>
            l.actorName.toLowerCase().includes(search) ||
            l.action.toLowerCase().includes(search) ||
            l.details.toLowerCase().includes(search),
        )
      : store.auditLogs;
    res.json({ logs: list.slice(0, 150) });
  },
);

adminAndSettingsRouter.get(
  '/permissions',
  requirePermission('permissions.manage'),
  (_req: AuthenticatedRequest, res) => {
    res.json({
      roles: ALL_ROLES,
      permissions: ALL_PERMISSIONS,
      matrix: store.rolePermissions,
    });
  },
);

adminAndSettingsRouter.patch(
  '/permissions',
  requirePermission('permissions.manage'),
  async (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const { role, permissions } = req.body ?? {};
    if (!ALL_ROLES.includes(role) || !Array.isArray(permissions)) {
      res.status(400).json({ error: 'Geçersiz rol veya yetki listesi.' });
      return;
    }
    if (role === 'Super Admin') {
      res.status(400).json({ error: 'Super Admin yetkileri kısıtlanamaz.' });
      return;
    }

    const validKeys = new Set(ALL_PERMISSIONS.map((p) => p.key));
    store.rolePermissions[role as UserRole] = permissions.filter((p) =>
      validKeys.has(p),
    ) as PermissionKey[];

    await store.persistAuditLog({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      actorId: actor.id,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'YETKI_GUNCELLE',
      targetType: 'role',
      targetId: role,
      details: `${role} rolünün yetkileri güncellendi.`,
      createdAt: new Date().toISOString(),
    });

    res.json({ matrix: store.rolePermissions });
  },
);
