import { Router } from 'express';
import { hasPermission } from '../core/permissions';
import type { ChatAttachment, ChatMessage } from '../core/types';
import { sanitizeUser, store } from '../database/store';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { realtime } from '../services/realtime';

export const chatRouter = Router();
chatRouter.use(requireAuth);
chatRouter.use((req: AuthenticatedRequest, res, next) => {
  if (!req.path.startsWith('/chat/messages')) { next(); return; }
  const user = req.authUser!;
  const messageId = req.path.split('/')[3];
  const message = messageId ? store.chatMessages.find((item) => item.id === messageId) : null;
  const channelId = message?.channelId || (req.method === 'GET' ? req.query.channelId : req.body?.channelId) || 'ch_genel';
  const channel = store.channels.find((item) => item.id === channelId);
  const admin = ['Super Admin', 'İşlem Admini'].includes(user.role);
  if (!channel || (!admin && (channel.teamScope ? channel.teamScope !== user.team : channel.isPrivate))) {
    res.status(403).json({ error: 'Bu kanala erişiminiz yok.' }); return;
  }
  next();
});

chatRouter.get('/chat/channels', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const onlineIds = new Set(realtime.getOnlineUserIds());

  const channels = store.channels.filter((ch) => {
    if (!ch.teamScope && !ch.isPrivate) return true;
    if (user.role === 'Super Admin' || user.role === 'İşlem Admini') return true;
    return ch.teamScope === user.team;
  });

  const staffPresence = store.users
    .filter((u) => u.isActive)
    .map((u) => ({
      ...sanitizeUser(u),
      isOnline: onlineIds.has(u.id),
    }));

  res.json({ channels, staffPresence });
});

chatRouter.get('/chat/messages', (req: AuthenticatedRequest, res) => {
  const channelId =
    typeof req.query.channelId === 'string' ? req.query.channelId : 'ch_genel';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  let msgs = store.chatMessages.filter(
    (m) => m.channelId === channelId && !m.isDeleted,
  );

  if (search) {
    msgs = msgs.filter(
      (m) =>
        m.content.toLowerCase().includes(search) ||
        m.senderName.toLowerCase().includes(search),
    );
  }

  msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const pinned = msgs.filter((m) => m.isPinned);

  res.json({ messages: msgs, pinned });
});

chatRouter.post('/chat/messages', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const { channelId, content, replyToId, attachments } = req.body ?? {};
  const cleanChannelId = typeof channelId === 'string' ? channelId : 'ch_genel';
  const cleanContent = typeof content === 'string' ? content.trim() : '';

  const safeAttachments: ChatAttachment[] = Array.isArray(attachments)
    ? attachments.slice(0, 3).map((a) => ({
        name: String(a?.name || 'dosya').slice(0, 80),
        type: String(a?.type || 'application/octet-stream').slice(0, 60),
        size: Number(a?.size || 0),
        dataUrl:
          typeof a?.dataUrl === 'string' && a.dataUrl.startsWith('data:image/')
            ? a.dataUrl.slice(0, 300_000)
            : undefined,
      }))
    : [];

  if (!cleanContent && safeAttachments.length === 0) {
    res.status(400).json({ error: 'Mesaj içeriği veya dosya eklenmelidir.' });
    return;
  }

  // Extract @mentions
  const mentionMatches = cleanContent.match(/@([A-Za-z0-9_.\-çğıöşüÇĞİÖŞÜ]+)/g) || [];
  const rawMentions = mentionMatches.map((m) => m.slice(1).toLowerCase());
  const canMassMention = hasPermission(user.role, 'chat.mass_mention', store.rolePermissions);

  if ((rawMentions.includes('everyone') || rawMentions.includes('admins')) && !canMassMention) {
    res.status(403).json({
      error: '@everyone ve @admins etiketleri yalnızca yetkili roller tarafından kullanılabilir.',
    });
    return;
  }

  let replyPreview: string | null = null;
  if (typeof replyToId === 'string' && replyToId) {
    const parent = store.chatMessages.find((m) => m.id === replyToId);
    if (parent && !parent.isDeleted) {
      replyPreview = `${parent.senderName}: ${parent.content.slice(0, 72)}`;
    }
  }

  const nowIso = new Date().toISOString();
  const msg: ChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    channelId: cleanChannelId,
    senderId: user.id,
    senderName: user.displayName,
    senderRole: user.role,
    senderAvatarColor: user.avatarColor,
    content: cleanContent,
    replyToId: typeof replyToId === 'string' ? replyToId : null,
    replyPreview,
    mentions: rawMentions,
    reactions: [],
    attachments: safeAttachments,
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.chatMessages.push(msg);
  realtime.broadcastAll('chat:message', msg);

  // Dispatch mention notifications
  if (rawMentions.length > 0) {
    const targetUsers = new Set<string>();
    if (rawMentions.includes('everyone')) {
      for (const u of store.users) {
        if (u.id !== user.id && u.isActive) targetUsers.add(u.id);
      }
    }
    if (rawMentions.includes('admins')) {
      for (const u of store.users) {
        if (u.id !== user.id && u.isActive && (u.role === 'Super Admin' || u.role === 'İşlem Admini')) {
          targetUsers.add(u.id);
        }
      }
    }
    for (const token of rawMentions) {
      if (token === 'everyone' || token === 'admins') continue;
      for (const u of store.users) {
        const handle = u.username.split('@')[0].toLowerCase();
        if (
          u.id !== user.id &&
          (handle === token || u.displayName.toLowerCase().replace(/\s+/g, '') === token)
        ) {
          targetUsers.add(u.id);
        }
      }
    }

    for (const uid of targetUsers) {
      realtime.pushNotification({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: uid,
        type: 'mention',
        title: `${user.displayName} sizden bahsetti`,
        description: cleanContent.slice(0, 100),
        linkPage: 'general-chat',
        linkEntityId: msg.id,
        isRead: false,
        createdAt: nowIso,
      });
    }
  }

  res.status(201).json({ message: msg });
});

chatRouter.patch('/chat/messages/:id', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const msg = store.chatMessages.find((m) => m.id === req.params.id && !m.isDeleted);
  if (!msg) {
    res.status(404).json({ error: 'Mesaj bulunamadı.' });
    return;
  }
  const canMod = hasPermission(user.role, 'chat.moderate', store.rolePermissions);
  if (msg.senderId !== user.id && !canMod) {
    res.status(403).json({ error: 'Bu mesajı düzenleme yetkiniz yok.' });
    return;
  }
  const { content } = req.body ?? {};
  if (typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'Mesaj içeriği boş olamaz.' });
    return;
  }
  msg.content = content.trim();
  msg.isEdited = true;
  msg.updatedAt = new Date().toISOString();
  realtime.broadcastAll('chat:updated', msg);
  res.json({ message: msg });
});

chatRouter.delete('/chat/messages/:id', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const msg = store.chatMessages.find((m) => m.id === req.params.id && !m.isDeleted);
  if (!msg) {
    res.status(404).json({ error: 'Mesaj bulunamadı.' });
    return;
  }
  const canMod = hasPermission(user.role, 'chat.moderate', store.rolePermissions);
  if (msg.senderId !== user.id && !canMod) {
    res.status(403).json({ error: 'Bu mesajı silme yetkiniz yok.' });
    return;
  }
  msg.isDeleted = true;
  msg.updatedAt = new Date().toISOString();
  realtime.broadcastAll('chat:deleted', { id: msg.id, channelId: msg.channelId });
  res.json({ ok: true });
});

chatRouter.post('/chat/messages/:id/react', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const msg = store.chatMessages.find((m) => m.id === req.params.id && !m.isDeleted);
  if (!msg) {
    res.status(404).json({ error: 'Mesaj bulunamadı.' });
    return;
  }
  const { emoji } = req.body ?? {};
  if (typeof emoji !== 'string' || !emoji.trim()) {
    res.status(400).json({ error: 'Emoji geçersiz.' });
    return;
  }
  const cleanEmoji = emoji.trim().slice(0, 8);
  let reaction = msg.reactions.find((r) => r.emoji === cleanEmoji);
  if (!reaction) {
    reaction = { emoji: cleanEmoji, userIds: [user.id] };
    msg.reactions.push(reaction);
  } else if (reaction.userIds.includes(user.id)) {
    reaction.userIds = reaction.userIds.filter((id) => id !== user.id);
    if (reaction.userIds.length === 0) {
      msg.reactions = msg.reactions.filter((r) => r.emoji !== cleanEmoji);
    }
  } else {
    reaction.userIds.push(user.id);
  }

  realtime.broadcastAll('chat:reaction', { id: msg.id, channelId: msg.channelId, reactions: msg.reactions });
  res.json({ message: msg });
});

chatRouter.post('/chat/messages/:id/pin', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  if (!hasPermission(user.role, 'chat.moderate', store.rolePermissions)) {
    res.status(403).json({ error: 'Mesaj sabitleme yetkiniz yok.' });
    return;
  }
  const msg = store.chatMessages.find((m) => m.id === req.params.id && !m.isDeleted);
  if (!msg) {
    res.status(404).json({ error: 'Mesaj bulunamadı.' });
    return;
  }
  msg.isPinned = !msg.isPinned;
  realtime.broadcastAll('chat:updated', msg);
  res.json({ message: msg });
});
