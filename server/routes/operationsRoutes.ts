import { Router } from 'express';
import { computeAdminPerformance, filterOperations } from '../core/filters';
import {
  applyOperationClaim,
  applyOperationComplete,
  applyOperationReject,
  parseOperationChatMessage,
} from '../core/operations';
import { hasPermission } from '../core/permissions';
import type { Operation, OperationStatus } from '../core/types';
import { store } from '../database/store';
import { requireAuth, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { realtime } from '../services/realtime';

export const operationsRouter = Router();
operationsRouter.use(requireAuth);

// Chat-First İşlem Chat list:
// Managers see their own requests; İşlem Admini & Super Admin see the shared queue
operationsRouter.get('/operations/chat', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const canProcess = hasPermission(user.role, 'operations.process', store.rolePermissions);
  const canInspectAll = hasPermission(user.role, 'operations.inspect_all', store.rolePermissions);

  const list =
    canProcess || canInspectAll
      ? [...store.operations]
      : store.operations.filter((o) => o.managerId === user.id);

  // Chat chronological order (oldest -> newest at bottom)
  list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  res.json({ operations: list });
});

// Super Admin Tüm İşlemler structured oversight with multi-filtering + Admin Performance
operationsRouter.get(
  '/operations/all',
  requirePermission('operations.inspect_all'),
  (req: AuthenticatedRequest, res) => {
    const filtered = filterOperations(store.operations, {
      managerId: typeof req.query.managerId === 'string' ? req.query.managerId : undefined,
      adminId: typeof req.query.adminId === 'string' ? req.query.adminId : undefined,
      memberUsername:
        typeof req.query.memberUsername === 'string' ? req.query.memberUsername : undefined,
      operationType:
        typeof req.query.operationType === 'string' ? req.query.operationType : undefined,
      status: (typeof req.query.status === 'string' ? req.query.status : 'Tümü') as
        | OperationStatus
        | 'Tümü',
      datePreset: (typeof req.query.datePreset === 'string' ? req.query.datePreset : 'all') as
        | 'all'
        | 'today'
        | 'yesterday'
        | 'week'
        | 'month'
        | 'custom',
      dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
      timeFrom: typeof req.query.timeFrom === 'string' ? req.query.timeFrom : undefined,
      timeTo: typeof req.query.timeTo === 'string' ? req.query.timeTo : undefined,
      sort: (typeof req.query.sort === 'string' ? req.query.sort : 'newest') as
        | 'newest'
        | 'oldest',
    });

    const adminPerformance = computeAdminPerformance(store.operations);

    res.json({
      operations: filtered,
      adminPerformance,
    });
  },
);

operationsRouter.post('/operations', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  if (
    !hasPermission(user.role, 'operations.create', store.rolePermissions) &&
    user.role !== 'Super Admin'
  ) {
    res.status(403).json({ error: 'İşlem talebi gönderme yetkiniz yok.' });
    return;
  }

  const { message } = req.body ?? {};
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'İşlem mesajı boş olamaz.' });
    return;
  }

  const rawMessage = message.trim();
  const parsed = parseOperationChatMessage(rawMessage);
  const nowIso = new Date().toISOString();

  const op: Operation = {
    id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    managerId: user.id,
    managerName: user.displayName,
    team: user.team,
    memberUsername: parsed.memberUsername,
    operationType: parsed.operationType,
    rawMessage,
    status: 'Bekliyor',
    claimedByAdminId: null,
    claimedByAdminName: null,
    claimedAt: null,
    resolvedByAdminId: null,
    resolvedByAdminName: null,
    resolvedAt: null,
    rejectionReason: null,
    createdAt: nowIso,
  };

  store.operations.push(op);
  store.operationHistory.push({
    id: `oph_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    operationId: op.id,
    status: 'Bekliyor',
    actorId: user.id,
    actorName: user.displayName,
    note: 'Talep Oluşturuldu',
    createdAt: nowIso,
  });

  await store.persistAuditLog({
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    actorId: user.id,
    actorName: user.displayName,
    actorRole: user.role,
    action: 'ISLEM_TALEBI',
    targetType: 'operation',
    targetId: op.id,
    details: `${op.memberUsername} — ${op.operationType}`,
    createdAt: nowIso,
  });

  realtime.broadcastAll('operation:created', op);

  res.status(201).json({ operation: op });
});

operationsRouter.post(
  '/operations/:id/claim',
  requirePermission('operations.process'),
  async (req: AuthenticatedRequest, res) => {
    const admin = req.authUser!;
    const idx = store.operations.findIndex((o) => o.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'İşlem bulunamadı.' });
      return;
    }

    try {
      const nowIso = new Date().toISOString();
      const { operation, historyEntry } = applyOperationClaim(
        store.operations[idx],
        admin.id,
        admin.displayName,
        nowIso,
      );
      store.operations[idx] = operation;
      store.operationHistory.push(historyEntry);

      realtime.pushNotification({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: operation.managerId,
        type: 'operation_accepted',
        title: 'İşleminiz Alındı',
        description: `${operation.memberUsername} talebiniz ${admin.displayName} tarafından işleme alındı.`,
        linkPage: 'operations-chat',
        linkEntityId: operation.id,
        isRead: false,
        createdAt: nowIso,
      });

      await store.persistAuditLog({
        id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        actorId: admin.id,
        actorName: admin.displayName,
        actorRole: admin.role,
        action: 'ISLEME_AL',
        targetType: 'operation',
        targetId: operation.id,
        details: `${operation.memberUsername} talebi işleme alındı.`,
        createdAt: nowIso,
      });

      realtime.broadcastAll('operation:updated', operation);
      res.json({ operation });
    } catch (err) {
      res.status(409).json({ error: (err as Error).message });
    }
  },
);

operationsRouter.post(
  '/operations/:id/complete',
  requirePermission('operations.process'),
  async (req: AuthenticatedRequest, res) => {
    const admin = req.authUser!;
    const idx = store.operations.findIndex((o) => o.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'İşlem bulunamadı.' });
      return;
    }

    try {
      const nowIso = new Date().toISOString();
      const { operation, historyEntry } = applyOperationComplete(
        store.operations[idx],
        admin.id,
        admin.displayName,
        admin.role === 'Super Admin',
        nowIso,
      );
      store.operations[idx] = operation;
      store.operationHistory.push(historyEntry);

      realtime.pushNotification({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: operation.managerId,
        type: 'operation_completed',
        title: 'İşlem Tamamlandı',
        description: `${operation.memberUsername} (${operation.operationType}) talebiniz ${admin.displayName} tarafından tamamlandı.`,
        linkPage: 'operations-chat',
        linkEntityId: operation.id,
        isRead: false,
        createdAt: nowIso,
      });

      await store.persistAuditLog({
        id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        actorId: admin.id,
        actorName: admin.displayName,
        actorRole: admin.role,
        action: 'ISLEM_TAMAMLA',
        targetType: 'operation',
        targetId: operation.id,
        details: `${operation.memberUsername} — ${operation.operationType} tamamlandı.`,
        createdAt: nowIso,
      });

      realtime.broadcastAll('operation:updated', operation);
      res.json({ operation });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

operationsRouter.post(
  '/operations/:id/reject',
  requirePermission('operations.process'),
  async (req: AuthenticatedRequest, res) => {
    const admin = req.authUser!;
    const idx = store.operations.findIndex((o) => o.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'İşlem bulunamadı.' });
      return;
    }

    try {
      const nowIso = new Date().toISOString();
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
      const { operation, historyEntry } = applyOperationReject(
        store.operations[idx],
        admin.id,
        admin.displayName,
        admin.role === 'Super Admin',
        reason,
        nowIso,
      );
      store.operations[idx] = operation;
      store.operationHistory.push(historyEntry);

      realtime.pushNotification({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: operation.managerId,
        type: 'operation_rejected',
        title: 'İşlem Reddedildi',
        description: `${operation.memberUsername} talebiniz reddedildi: ${operation.rejectionReason}`,
        linkPage: 'operations-chat',
        linkEntityId: operation.id,
        isRead: false,
        createdAt: nowIso,
      });

      await store.persistAuditLog({
        id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        actorId: admin.id,
        actorName: admin.displayName,
        actorRole: admin.role,
        action: 'ISLEM_REDDET',
        targetType: 'operation',
        targetId: operation.id,
        details: `${operation.memberUsername} reddedildi (${operation.rejectionReason}).`,
        createdAt: nowIso,
      });

      realtime.broadcastAll('operation:updated', operation);
      res.json({ operation });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

operationsRouter.get('/operations/:id/history', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const op = store.operations.find((o) => o.id === req.params.id);
  if (!op) {
    res.status(404).json({ error: 'İşlem bulunamadı.' });
    return;
  }

  const canInspectAll = hasPermission(user.role, 'operations.inspect_all', store.rolePermissions);
  if (op.managerId !== user.id && !canInspectAll) {
    res.status(403).json({ error: 'Bu işlem geçmişini görüntüleme yetkiniz yok.' });
    return;
  }

  const history = store.operationHistory
    .filter((h) => h.operationId === op.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  res.json({ operation: op, history });
});
