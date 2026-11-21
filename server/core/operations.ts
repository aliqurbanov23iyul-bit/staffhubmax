import type { Operation, OperationHistoryEntry, OperationStatus } from './types';

export interface ParsedOperationMessage {
  memberUsername: string;
  operationType: string;
}

export function parseOperationChatMessage(rawMessage: string): ParsedOperationMessage {
  const trimmed = rawMessage.trim();
  const parts = trimmed.split(/\s+/);
  const memberUsername = parts[0] || 'belirsiz';
  const rest = parts.slice(1).join(' ').trim();

  if (!rest) {
    return { memberUsername, operationType: 'Genel Talep' };
  }

  // Normalize common abbreviations while preserving readability
  const hasKayip = /kayıp|kayip/i.test(rest);
  let normalized = rest
    .replace(/(^|\s)(kayip|kayıp)(?=\s|$)/gi, '$1Kayıp')
    .replace(/(^|\s)bonusu(?=\s|$)/gi, '$1Bonusu')
    .replace(/(^|\s)çekim(?=\s|$)/gi, '$1Çekim')
    .replace(/(^|\s)yatırım(?=\s|$)/gi, '$1Yatırım')
    .replace(/(^|\s)freespin(?=\s|$)/gi, '$1Freespin');

  if (hasKayip) {
    normalized = normalized.replace(/(^|\s)kt(?=\s|$)/gi, '$1KT');
  } else {
    normalized = normalized.replace(/(^|\s)kt(?=\s|$)/gi, '$1Kayıp Bonusu KT');
  }

  // Capitalize first letter nicely
  const operationType = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return { memberUsername, operationType };
}

export function canClaimOperation(op: Operation): { ok: boolean; reason?: string } {
  if (op.status !== 'Bekliyor') {
    return {
      ok: false,
      reason: `Bu işlem zaten "${op.status}" durumunda.`,
    };
  }
  if (op.claimedByAdminId) {
    return {
      ok: false,
      reason: `Bu işlem ${op.claimedByAdminName || 'başka bir admin'} tarafından işleme alındı.`,
    };
  }
  return { ok: true };
}

export function applyOperationClaim(
  op: Operation,
  adminId: string,
  adminName: string,
  nowIso: string,
): { operation: Operation; historyEntry: OperationHistoryEntry } {
  const check = canClaimOperation(op);
  if (!check.ok) {
    throw new Error(check.reason || 'İşlem alınamadı.');
  }

  const updated: Operation = {
    ...op,
    status: 'İşleme Alındı',
    claimedByAdminId: adminId,
    claimedByAdminName: adminName,
    claimedAt: nowIso,
  };

  const historyEntry: OperationHistoryEntry = {
    id: `oph_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    operationId: op.id,
    status: 'İşleme Alındı',
    actorId: adminId,
    actorName: adminName,
    note: `${adminName} İşleme Aldı`,
    createdAt: nowIso,
  };

  return { operation: updated, historyEntry };
}

export function applyOperationComplete(
  op: Operation,
  adminId: string,
  adminName: string,
  isSuperAdmin: boolean,
  nowIso: string,
): { operation: Operation; historyEntry: OperationHistoryEntry } {
  if (op.status !== 'İşleme Alındı') {
    throw new Error('Yalnızca "İşleme Alındı" durumundaki talepler tamamlanabilir.');
  }
  if (!isSuperAdmin && op.claimedByAdminId && op.claimedByAdminId !== adminId) {
    throw new Error(`Bu işlemi yalnızca ${op.claimedByAdminName} veya Super Admin tamamlayabilir.`);
  }

  const updated: Operation = {
    ...op,
    status: 'Tamamlandı',
    resolvedByAdminId: adminId,
    resolvedByAdminName: adminName,
    resolvedAt: nowIso,
  };

  const historyEntry: OperationHistoryEntry = {
    id: `oph_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    operationId: op.id,
    status: 'Tamamlandı',
    actorId: adminId,
    actorName: adminName,
    note: `${adminName} Tamamladı`,
    createdAt: nowIso,
  };

  return { operation: updated, historyEntry };
}

export function applyOperationReject(
  op: Operation,
  adminId: string,
  adminName: string,
  isSuperAdmin: boolean,
  reason: string,
  nowIso: string,
): { operation: Operation; historyEntry: OperationHistoryEntry } {
  if (op.status !== 'İşleme Alındı') {
    throw new Error('Yalnızca "İşleme Alındı" durumundaki talepler reddedilebilir.');
  }
  if (!isSuperAdmin && op.claimedByAdminId && op.claimedByAdminId !== adminId) {
    throw new Error(`Bu işlemi yalnızca ${op.claimedByAdminName} veya Super Admin reddedebilir.`);
  }
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('Reddetme nedeni zorunludur.');
  }

  const updated: Operation = {
    ...op,
    status: 'Reddedildi',
    resolvedByAdminId: adminId,
    resolvedByAdminName: adminName,
    resolvedAt: nowIso,
    rejectionReason: cleanReason,
  };

  const historyEntry: OperationHistoryEntry = {
    id: `oph_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    operationId: op.id,
    status: 'Reddedildi',
    actorId: adminId,
    actorName: adminName,
    note: `${adminName} Reddetti: ${cleanReason}`,
    createdAt: nowIso,
  };

  return { operation: updated, historyEntry };
}

export function getOperationStatusLabel(status: OperationStatus): string {
  return status;
}
