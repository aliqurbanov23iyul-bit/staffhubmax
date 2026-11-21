import { Router } from 'express';
import { filterAndSortMembers, findDuplicateMember } from '../core/filters';
import { hasPermission } from '../core/permissions';
import type { Member, MemberStatus } from '../core/types';
import { store } from '../database/store';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { realtime } from '../services/realtime';

export const crmRouter = Router();
crmRouter.use(requireAuth);

const ALLOWED_STATUSES: MemberStatus[] = [
  'Yeni',
  'Takipte',
  'Aranacak',
  'VIP',
  'Ulaşılamadı',
  'Pasif',
];

crmRouter.get('/members', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const canInspectAll = hasPermission(user.role, 'members.inspect_all', store.rolePermissions);
  const ownerFilter = typeof req.query.ownerId === 'string' ? req.query.ownerId : undefined;

  let base = store.members;
  if (!canInspectAll) {
    base = base.filter((m) => m.ownerId === user.id);
  } else if (ownerFilter && ownerFilter !== 'all') {
    base = base.filter((m) => m.ownerId === ownerFilter);
  }

  const list = filterAndSortMembers(base, {
    search: typeof req.query.search === 'string' ? req.query.search : '',
    status: (typeof req.query.status === 'string' ? req.query.status : 'Tümü') as MemberStatus | 'Tümü',
    includeArchived: req.query.archived === 'true',
    sort: (typeof req.query.sort === 'string' ? req.query.sort : 'newest') as
      | 'newest'
      | 'oldest'
      | 'last_comment',
  });

  // Compute duplicate username indicators across active members
  const usernameCounts = new Map<string, number>();
  for (const m of store.members) {
    if (m.isArchived) continue;
    usernameCounts.set(m.normalizedUsername, (usernameCounts.get(m.normalizedUsername) || 0) + 1);
  }

  const enriched = list.map((m) => ({
    ...m,
    hasDuplicateAcrossSystem: (usernameCounts.get(m.normalizedUsername) || 0) > 1,
  }));

  res.json({ members: enriched });
});

crmRouter.post('/members', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const { username, realName, phone, email, notes, status, forceDuplicate } = req.body ?? {};

  if (typeof username !== 'string' || !username.trim()) {
    res.status(400).json({ error: 'Üye kullanıcı adı zorunludur.' });
    return;
  }

  const cleanUsername = username.trim();
  if (cleanUsername.length < 2 || cleanUsername.length > 48) {
    res.status(400).json({ error: 'Kullanıcı adı 2 ile 48 karakter arasında olmalıdır.' });
    return;
  }

  const ownMembers = store.members.filter((m) => m.ownerId === user.id);
  const duplicateOwn = findDuplicateMember(ownMembers, cleanUsername);
  if (duplicateOwn && !forceDuplicate) {
    res.status(409).json({
      error: `"${cleanUsername}" adlı üye zaten listenizde mevcut.`,
      duplicate: duplicateOwn,
    });
    return;
  }

  const duplicateGlobal = findDuplicateMember(store.members, cleanUsername);

  const nowIso = new Date().toISOString();
  const safeStatus: MemberStatus = ALLOWED_STATUSES.includes(status) ? status : 'Yeni';
  const member: Member = {
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    username: cleanUsername,
    normalizedUsername: cleanUsername.toLowerCase(),
    ownerId: user.id,
    ownerName: user.displayName,
    team: user.team,
    realName: typeof realName === 'string' ? realName.trim() : '',
    phone: typeof phone === 'string' ? phone.trim() : '',
    email: typeof email === 'string' ? email.trim() : '',
    notes: typeof notes === 'string' ? notes.trim() : '',
    status: safeStatus,
    isPinned: false,
    isArchived: false,
    latestComment: '',
    latestCommentAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.members.unshift(member);

  await store.persistAuditLog({
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    actorId: user.id,
    actorName: user.displayName,
    actorRole: user.role,
    action: 'UYE_EKLE',
    targetType: 'member',
    targetId: member.id,
    details: `${member.username} CRM listesine eklendi.`,
    createdAt: nowIso,
  });

  res.status(201).json({
    member,
    duplicateWarning: duplicateGlobal
      ? `Not: "${cleanUsername}" başka bir personelin (${duplicateGlobal.ownerName}) listesinde de kayıtlı.`
      : null,
  });
});

crmRouter.patch('/members/:id', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const member = store.members.find((m) => m.id === req.params.id);
  if (!member) {
    res.status(404).json({ error: 'Üye bulunamadı.' });
    return;
  }

  const canInspectAll = hasPermission(user.role, 'members.inspect_all', store.rolePermissions);
  if (member.ownerId !== user.id && !canInspectAll) {
    res.status(403).json({ error: 'Bu üyeyi düzenleme yetkiniz yok.' });
    return;
  }

  const { username, realName, phone, email, notes, status, isPinned, isArchived } = req.body ?? {};
  if (typeof username === 'string' && username.trim()) {
    member.username = username.trim();
    member.normalizedUsername = username.trim().toLowerCase();
  }
  if (typeof realName === 'string') member.realName = realName.trim();
  if (typeof phone === 'string') member.phone = phone.trim();
  if (typeof email === 'string') member.email = email.trim();
  if (typeof notes === 'string') member.notes = notes.trim();
  if (ALLOWED_STATUSES.includes(status)) member.status = status;
  if (typeof isPinned === 'boolean') member.isPinned = isPinned;
  if (typeof isArchived === 'boolean') member.isArchived = isArchived;
  member.updatedAt = new Date().toISOString();

  res.json({ member });
});

crmRouter.post('/members/bulk', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const { ids, action, status } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'En az bir üye seçilmelidir.' });
    return;
  }

  const canInspectAll = hasPermission(user.role, 'members.inspect_all', store.rolePermissions);
  let updatedCount = 0;

  for (const member of store.members) {
    if (!ids.includes(member.id)) continue;
    if (member.ownerId !== user.id && !canInspectAll) continue;
    if (action === 'archive') {
      member.isArchived = true;
      updatedCount += 1;
    } else if (action === 'unarchive') {
      member.isArchived = false;
      updatedCount += 1;
    } else if (action === 'pin') {
      member.isPinned = true;
      updatedCount += 1;
    } else if (action === 'status' && ALLOWED_STATUSES.includes(status)) {
      member.status = status;
      updatedCount += 1;
    }
    member.updatedAt = new Date().toISOString();
  }

  res.json({ ok: true, updatedCount });
});

crmRouter.get('/members/:id/comments', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const member = store.members.find((m) => m.id === req.params.id);
  if (!member) {
    res.status(404).json({ error: 'Üye bulunamadı.' });
    return;
  }

  const canInspectAll = hasPermission(user.role, 'members.inspect_all', store.rolePermissions);
  if (member.ownerId !== user.id && !canInspectAll) {
    res.status(403).json({ error: 'Bu üyenin yorumlarını görme yetkiniz yok.' });
    return;
  }

  const comments = store.memberComments
    .filter((c) => c.memberId === member.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ member, comments });
});

crmRouter.post('/members/:id/comments', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const member = store.members.find((m) => m.id === req.params.id);
  if (!member) {
    res.status(404).json({ error: 'Üye bulunamadı.' });
    return;
  }

  const canInspectAll = hasPermission(user.role, 'members.inspect_all', store.rolePermissions);
  if (member.ownerId !== user.id && !canInspectAll) {
    res.status(403).json({ error: 'Bu üyeye yorum ekleme yetkiniz yok.' });
    return;
  }

  const { content } = req.body ?? {};
  if (typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'Yorum metni boş olamaz.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const comment = {
    id: `mc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    memberId: member.id,
    authorId: user.id,
    authorName: user.displayName,
    content: content.trim(),
    createdAt: nowIso,
  };

  store.memberComments.push(comment);
  member.latestComment = comment.content;
  member.latestCommentAt = nowIso;
  member.updatedAt = nowIso;

  res.status(201).json({ comment, member });
});

// Comment Templates
crmRouter.get('/comment-templates', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  store.ensureDefaultTemplatesAndSettings(user);
  const templates = store.commentTemplates
    .filter((t) => t.userId === user.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  res.json({ templates });
});

crmRouter.post('/comment-templates', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const { text } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'Şablon metni boş olamaz.' });
    return;
  }
  const existing = store.commentTemplates.filter((t) => t.userId === user.id);
  const template = {
    id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId: user.id,
    text: text.trim(),
    sortOrder: existing.length,
    createdAt: new Date().toISOString(),
  };
  store.commentTemplates.push(template);
  res.status(201).json({ template });
});

crmRouter.patch('/comment-templates/:id', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const tpl = store.commentTemplates.find(
    (t) => t.id === req.params.id && t.userId === user.id,
  );
  if (!tpl) {
    res.status(404).json({ error: 'Şablon bulunamadı.' });
    return;
  }
  const { text } = req.body ?? {};
  if (typeof text === 'string' && text.trim()) {
    tpl.text = text.trim();
  }
  res.json({ template: tpl });
});

crmRouter.delete('/comment-templates/:id', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  store.commentTemplates = store.commentTemplates.filter(
    (t) => !(t.id === req.params.id && t.userId === user.id),
  );
  res.json({ ok: true });
});

crmRouter.post('/comment-templates/reorder', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const { orderedIds } = req.body ?? {};
  if (!Array.isArray(orderedIds)) {
    res.status(400).json({ error: 'Sıralama listesi geçersiz.' });
    return;
  }
  orderedIds.forEach((id: string, idx: number) => {
    const tpl = store.commentTemplates.find((t) => t.id === id && t.userId === user.id);
    if (tpl) tpl.sortOrder = idx;
  });
  const templates = store.commentTemplates
    .filter((t) => t.userId === user.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  res.json({ templates });
});

// Reminders
crmRouter.get('/reminders', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const list = store.reminders
    .filter((r) => r.userId === user.id)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  res.json({ reminders: list });
});

crmRouter.post('/reminders', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const { title, dueAt, memberId } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim() || typeof dueAt !== 'string' || !dueAt) {
    res.status(400).json({ error: 'Hatırlatıcı başlığı ve zamanı zorunludur.' });
    return;
  }
  const member = memberId ? store.members.find((m) => m.id === memberId) : null;
  const reminder = {
    id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId: user.id,
    memberId: member ? member.id : null,
    memberUsername: member ? member.username : null,
    title: title.trim(),
    dueAt: new Date(dueAt).toISOString(),
    isCompleted: false,
    notified: false,
    createdAt: new Date().toISOString(),
  };
  store.reminders.push(reminder);

  realtime.pushNotification({
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId: user.id,
    type: 'reminder',
    title: 'Hatırlatıcı Planlandı',
    description: `${reminder.title}`,
    linkPage: 'members',
    linkEntityId: reminder.id,
    isRead: false,
    createdAt: new Date().toISOString(),
  });

  res.status(201).json({ reminder });
});

crmRouter.patch('/reminders/:id', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const reminder = store.reminders.find(
    (r) => r.id === req.params.id && r.userId === user.id,
  );
  if (!reminder) {
    res.status(404).json({ error: 'Hatırlatıcı bulunamadı.' });
    return;
  }
  if (typeof req.body?.isCompleted === 'boolean') {
    reminder.isCompleted = req.body.isCompleted;
  }
  res.json({ reminder });
});

crmRouter.delete('/reminders/:id', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  store.reminders = store.reminders.filter(
    (r) => !(r.id === req.params.id && r.userId === user.id),
  );
  res.json({ ok: true });
});
