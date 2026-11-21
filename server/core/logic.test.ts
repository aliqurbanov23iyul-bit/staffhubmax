import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSecureTempPassword,
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from './password';
import {
  EXCLUDED_MODULES,
  SIDEBAR_NAV_ITEMS,
  getAuthorizedNavItems,
  hasPermission,
} from './permissions';
import {
  parseOperationChatMessage,
  applyOperationClaim,
  applyOperationComplete,
  applyOperationReject,
} from './operations';
import {
  filterOperations,
  computeAdminPerformance,
  filterAndSortMembers,
  findDuplicateMember,
} from './filters';
import {
  computeBreakTiming,
  canStartBreak,
  formatOverdueAlertMessage,
} from './breaks';
import {
  hasDuplicateFtd,
  computeFtdStats,
  groupFtdByManager,
} from './ftd';
import type { BreakSession, FtdEntry, Member, Operation } from './types';

test('password generator creates 12-16 char passwords and scrypt verifies cleanly', () => {
  const pw = generateSecureTempPassword(14);
  assert.equal(pw.length, 14);
  assert.match(pw, /[A-Z]/);
  assert.match(pw, /[a-z]/);
  assert.match(pw, /[0-9]/);
  assert.match(pw, /[!@#$%&*?]/);

  const hash = hashPassword(pw);
  assert.ok(hash.includes(':'));
  assert.equal(verifyPassword(pw, hash), true);
  assert.equal(verifyPassword(pw + 'x', hash), false);
  assert.equal(validatePasswordStrength('short').valid, false);
  assert.equal(validatePasswordStrength('onlyletters').valid, false);
  assert.equal(validatePasswordStrength('Güvenli123').valid, true);
});

test('permissions exclude forbidden modules and scope nav items by role', () => {
  const labels = SIDEBAR_NAV_ITEMS.map((i) => i.label);
  for (const forbidden of EXCLUDED_MODULES) {
    assert.equal(labels.includes(forbidden), false, `Forbidden module ${forbidden} must not exist`);
  }

  const managerNav = getAuthorizedNavItems('Menecer').map((i) => i.id);
  assert.ok(managerNav.includes('members'));
  assert.ok(managerNav.includes('operations-chat'));
  assert.ok(!managerNav.includes('all-operations'));
  assert.ok(!managerNav.includes('permissions'));

  const superAdminNav = getAuthorizedNavItems('Super Admin').map((i) => i.id);
  assert.ok(superAdminNav.includes('all-operations'));
  assert.ok(superAdminNav.includes('permissions'));
  assert.ok(superAdminNav.includes('audit-logs'));

  assert.equal(hasPermission('Menecer', 'ftd.approve'), false);
  assert.equal(hasPermission('İşlem Admini', 'ftd.approve'), true);
});

test('operation chat parser & single-admin claim/complete/reject state machine', () => {
  const parsed = parseOperationChatMessage('ali4133 50% kayıp bonusu KT');
  assert.equal(parsed.memberUsername, 'ali4133');
  assert.equal(parsed.operationType, '50% Kayıp Bonusu KT');

  const shortParsed = parseOperationChatMessage('veli99 50% KT');
  assert.equal(shortParsed.operationType, '50% Kayıp Bonusu KT');

  const baseOp: Operation = {
    id: 'op1',
    managerId: 'u_okan',
    managerName: 'Okan',
    team: 'VIP Ekip',
    memberUsername: 'ali4133',
    operationType: '50% Kayıp Bonusu KT',
    rawMessage: 'ali4133 50% kayıp bonusu KT',
    status: 'Bekliyor',
    claimedByAdminId: null,
    claimedByAdminName: null,
    claimedAt: null,
    resolvedByAdminId: null,
    resolvedByAdminName: null,
    resolvedAt: null,
    rejectionReason: null,
    createdAt: '2026-11-21T12:40:00.000Z',
  };

  const claimed = applyOperationClaim(baseOp, 'u_can', 'Can', '2026-11-21T12:41:00.000Z');
  assert.equal(claimed.operation.status, 'İşleme Alındı');
  assert.equal(claimed.operation.claimedByAdminName, 'Can');

  assert.throws(() => {
    applyOperationClaim(claimed.operation, 'u_other', 'Diğer Admin', '2026-11-21T12:42:00.000Z');
  });

  assert.throws(() => {
    applyOperationReject(claimed.operation, 'u_can', 'Can', false, '   ', '2026-11-21T12:43:00.000Z');
  });

  const completed = applyOperationComplete(claimed.operation, 'u_can', 'Can', false, '2026-11-21T12:44:00.000Z');
  assert.equal(completed.operation.status, 'Tamamlandı');
  assert.equal(completed.operation.resolvedByAdminName, 'Can');
});

test('Super Admin operation multi-filtering and admin performance calculation', () => {
  const now = new Date(2026, 10, 21, 16, 0, 0);
  const ops: Operation[] = [
    {
      id: 'op_1',
      managerId: 'u_okan',
      managerName: 'Okan',
      team: 'VIP Ekip',
      memberUsername: 'ali4133',
      operationType: '50% Kayıp Bonusu',
      rawMessage: 'ali4133 50% kayıp bonusu',
      status: 'Tamamlandı',
      claimedByAdminId: 'u_can',
      claimedByAdminName: 'Can',
      claimedAt: new Date(2026, 10, 21, 15, 43, 0).toISOString(),
      resolvedByAdminId: 'u_can',
      resolvedByAdminName: 'Can',
      resolvedAt: new Date(2026, 10, 21, 15, 45, 0).toISOString(),
      rejectionReason: null,
      createdAt: new Date(2026, 10, 21, 15, 42, 0).toISOString(),
    },
    {
      id: 'op_2',
      managerId: 'u_ahmet',
      managerName: 'Ahmet',
      team: 'Standart',
      memberUsername: 'veli99',
      operationType: 'Çekim Kontrol',
      rawMessage: 'veli99 çekim kontrol',
      status: 'Bekliyor',
      claimedByAdminId: null,
      claimedByAdminName: null,
      claimedAt: null,
      resolvedByAdminId: null,
      resolvedByAdminName: null,
      resolvedAt: null,
      rejectionReason: null,
      createdAt: new Date(2026, 10, 20, 11, 0, 0).toISOString(),
    },
  ];

  const okanToday = filterOperations(ops, {
    managerId: 'u_okan',
    datePreset: 'today',
    referenceNow: now,
  });
  assert.equal(okanToday.length, 1);
  assert.equal(okanToday[0].id, 'op_1');

  const perf = computeAdminPerformance(ops);
  assert.equal(perf.length, 1);
  assert.equal(perf[0].adminName, 'Can');
  assert.equal(perf[0].completedCount, 1);
  assert.equal(perf[0].avgResponseSeconds, 60);
});

test('Member CRM duplicate detection and pinned-first sorting', () => {
  const members: Member[] = [
    {
      id: 'm1',
      username: 'Ali3213',
      normalizedUsername: 'ali3213',
      ownerId: 'u1',
      ownerName: 'Okan',
      team: 'VIP',
      status: 'Yeni',
      isPinned: false,
      isArchived: false,
      latestComment: 'Akşam aranacak',
      latestCommentAt: '2026-11-21T10:00:00.000Z',
      createdAt: '2026-11-21T09:00:00.000Z',
      updatedAt: '2026-11-21T10:00:00.000Z',
    },
    {
      id: 'm2',
      username: 'Mehmet77',
      normalizedUsername: 'mehmet77',
      ownerId: 'u1',
      ownerName: 'Okan',
      team: 'VIP',
      status: 'VIP',
      isPinned: true,
      isArchived: false,
      latestComment: 'Bilgilendirme yapıldı',
      latestCommentAt: '2026-11-21T08:00:00.000Z',
      createdAt: '2026-11-20T09:00:00.000Z',
      updatedAt: '2026-11-21T08:00:00.000Z',
    },
  ];

  assert.ok(findDuplicateMember(members, '  ali3213 '));
  assert.equal(findDuplicateMember(members, 'yeni_uye'), undefined);

  const sorted = filterAndSortMembers(members, { sort: 'newest' });
  assert.equal(sorted[0].id, 'm2'); // Pinned first
});

test('Break timing detects due, active countdown, overdue, and single-active constraint', () => {
  const sessions: BreakSession[] = [
    {
      id: 'b1',
      scheduleId: 's1',
      userId: 'u1',
      userName: 'Okan',
      team: 'VIP',
      breakNumber: 1,
      scheduledTime: '11:00',
      plannedMinutes: 15,
      extraMinutes: 0,
      dateKey: '2026-11-21',
      status: 'Molada',
      startedAt: new Date(2026, 10, 21, 11, 0, 0).toISOString(),
      endedAt: null,
      overdueAlertSent: false,
    },
    {
      id: 'b2',
      scheduleId: 's2',
      userId: 'u1',
      userName: 'Okan',
      team: 'VIP',
      breakNumber: 2,
      scheduledTime: '13:30',
      plannedMinutes: 30,
      extraMinutes: 0,
      dateKey: '2026-11-21',
      status: 'Planlandı',
      startedAt: null,
      endedAt: null,
      overdueAlertSent: false,
    },
  ];

  assert.equal(canStartBreak(sessions, 'b2').ok, false);

  // 18 minutes after 11:00 -> 3 minutes overdue
  const after18Min = new Date(2026, 10, 21, 11, 18, 0);
  const timing = computeBreakTiming(sessions[0], after18Min);
  assert.equal(timing.status, 'Gecikti');
  assert.equal(timing.isOverdue, true);
  assert.equal(timing.overdueMinutes, 3);
  assert.ok(formatOverdueAlertMessage(sessions[0], timing).includes('Gecikme: 3 Dk'));
});

test('FTD duplicate prevention, stats, and manager grouping', () => {
  const entries: FtdEntry[] = [
    {
      id: 'f1',
      managerId: 'u_okan',
      managerName: 'Okan',
      team: 'VIP',
      memberUsername: 'ali4133',
      normalizedMemberUsername: 'ali4133',
      amount: 150,
      currency: 'TRY',
      status: 'Onay Bekliyor',
      approvedByAdminId: null,
      approvedByAdminName: null,
      approvedAt: null,
      createdAt: '2026-11-21T10:00:00.000Z',
    },
    {
      id: 'f2',
      managerId: 'u_okan',
      managerName: 'Okan',
      team: 'VIP',
      memberUsername: 'mehmet772',
      normalizedMemberUsername: 'mehmet772',
      amount: 300,
      currency: 'TRY',
      status: 'Onaylandı',
      approvedByAdminId: 'u_can',
      approvedByAdminName: 'Can',
      approvedAt: '2026-11-21T10:15:00.000Z',
      createdAt: '2026-11-21T09:50:00.000Z',
    },
  ];

  assert.equal(hasDuplicateFtd(entries, 'ALI4133'), true);
  assert.equal(hasDuplicateFtd(entries, 'can554'), false);

  const stats = computeFtdStats(entries);
  assert.equal(stats.totalCount, 2);
  assert.equal(stats.approvedCount, 1);
  assert.equal(stats.pendingCount, 1);
  assert.equal(stats.totalAmount, 450);

  const grouped = groupFtdByManager(entries);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].managerName, 'Okan');
});
