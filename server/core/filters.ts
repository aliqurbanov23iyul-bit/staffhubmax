import type { Member, MemberStatus, Operation, OperationStatus } from './types';

export interface OperationFilterInput {
  managerId?: string;
  adminId?: string;
  memberUsername?: string;
  operationType?: string;
  status?: OperationStatus | 'Tümü' | '';
  datePreset?: 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  timeFrom?: string; // HH:MM
  timeTo?: string;   // HH:MM
  sort?: 'newest' | 'oldest';
  referenceNow?: Date;
}

function toLocalYmd(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toLocalHm(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function filterOperations(
  operations: Operation[],
  filters: OperationFilterInput,
): Operation[] {
  const now = filters.referenceNow ?? new Date();
  const todayYmd = toLocalYmd(now);

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayYmd = toLocalYmd(yesterdayDate);

  const weekStartDate = new Date(now);
  const dayOfWeek = weekStartDate.getDay() === 0 ? 7 : weekStartDate.getDay();
  weekStartDate.setDate(weekStartDate.getDate() - (dayOfWeek - 1));
  const weekStartYmd = toLocalYmd(weekStartDate);

  const monthStartYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const result = operations.filter((op) => {
    if (filters.managerId && filters.managerId !== 'all' && op.managerId !== filters.managerId) {
      return false;
    }
    if (filters.adminId && filters.adminId !== 'all') {
      const matched =
        op.claimedByAdminId === filters.adminId || op.resolvedByAdminId === filters.adminId;
      if (!matched) return false;
    }
    if (filters.memberUsername && filters.memberUsername.trim()) {
      const needle = filters.memberUsername.trim().toLowerCase();
      if (!op.memberUsername.toLowerCase().includes(needle)) return false;
    }
    if (filters.operationType && filters.operationType.trim()) {
      const needle = filters.operationType.trim().toLowerCase();
      if (
        !op.operationType.toLowerCase().includes(needle) &&
        !op.rawMessage.toLowerCase().includes(needle)
      ) {
        return false;
      }
    }
    if (filters.status && filters.status !== 'Tümü' && op.status !== filters.status) {
      return false;
    }

    const created = new Date(op.createdAt);
    const opYmd = toLocalYmd(created);
    const opHm = toLocalHm(created);

    const preset = filters.datePreset || 'all';
    if (preset === 'today' && opYmd !== todayYmd) return false;
    if (preset === 'yesterday' && opYmd !== yesterdayYmd) return false;
    if (preset === 'week' && (opYmd < weekStartYmd || opYmd > todayYmd)) return false;
    if (preset === 'month' && (opYmd < monthStartYmd || opYmd > todayYmd)) return false;
    if (preset === 'custom') {
      if (filters.dateFrom && opYmd < filters.dateFrom) return false;
      if (filters.dateTo && opYmd > filters.dateTo) return false;
    }

    if (filters.timeFrom && opHm < filters.timeFrom) return false;
    if (filters.timeTo && opHm > filters.timeTo) return false;

    return true;
  });

  const sortOrder = filters.sort || 'newest';
  result.sort((a, b) => {
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sortOrder === 'oldest' ? diff : -diff;
  });

  return result;
}

export interface AdminPerformanceStat {
  adminId: string;
  adminName: string;
  completedCount: number;
  inProgressCount: number;
  rejectedCount: number;
  avgResponseSeconds: number;
  totalHandled: number;
}

export function computeAdminPerformance(operations: Operation[]): AdminPerformanceStat[] {
  const map = new Map<
    string,
    {
      adminId: string;
      adminName: string;
      completedCount: number;
      inProgressCount: number;
      rejectedCount: number;
      responseDurationsSec: number[];
    }
  >();

  for (const op of operations) {
    const adminId = op.resolvedByAdminId || op.claimedByAdminId;
    const adminName = op.resolvedByAdminName || op.claimedByAdminName;
    if (!adminId || !adminName) continue;

    let entry = map.get(adminId);
    if (!entry) {
      entry = {
        adminId,
        adminName,
        completedCount: 0,
        inProgressCount: 0,
        rejectedCount: 0,
        responseDurationsSec: [],
      };
      map.set(adminId, entry);
    }

    if (op.status === 'Tamamlandı') entry.completedCount += 1;
    else if (op.status === 'İşleme Alındı') entry.inProgressCount += 1;
    else if (op.status === 'Reddedildi') entry.rejectedCount += 1;

    if (op.claimedAt) {
      const sec = Math.max(
        0,
        Math.round((new Date(op.claimedAt).getTime() - new Date(op.createdAt).getTime()) / 1000),
      );
      entry.responseDurationsSec.push(sec);
    }
  }

  return Array.from(map.values())
    .map((e) => ({
      adminId: e.adminId,
      adminName: e.adminName,
      completedCount: e.completedCount,
      inProgressCount: e.inProgressCount,
      rejectedCount: e.rejectedCount,
      avgResponseSeconds:
        e.responseDurationsSec.length > 0
          ? Math.round(
              e.responseDurationsSec.reduce((acc, v) => acc + v, 0) / e.responseDurationsSec.length,
            )
          : 0,
      totalHandled: e.completedCount + e.inProgressCount + e.rejectedCount,
    }))
    .sort((a, b) => b.totalHandled - a.totalHandled);
}

export interface MemberFilterInput {
  search?: string;
  status?: MemberStatus | 'Tümü' | '';
  includeArchived?: boolean;
  sort?: 'newest' | 'oldest' | 'last_comment';
}

export function filterAndSortMembers(members: Member[], filters: MemberFilterInput): Member[] {
  const filtered = members.filter((m) => {
    if (!filters.includeArchived && m.isArchived) return false;
    if (filters.status && filters.status !== 'Tümü' && m.status !== filters.status) return false;
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      const hit =
        m.username.toLowerCase().includes(q) ||
        m.latestComment.toLowerCase().includes(q) ||
        (m.realName || '').toLowerCase().includes(q) ||
        (m.ownerName || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  const sort = filters.sort || 'newest';
  filtered.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (sort === 'last_comment') {
      const aTime = a.latestCommentAt ? new Date(a.latestCommentAt).getTime() : 0;
      const bTime = b.latestCommentAt ? new Date(b.latestCommentAt).getTime() : 0;
      return bTime - aTime;
    }
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sort === 'oldest' ? diff : -diff;
  });

  return filtered;
}

export function findDuplicateMember(members: Member[], username: string): Member | undefined {
  const norm = username.trim().toLowerCase();
  return members.find((m) => m.normalizedUsername === norm && !m.isArchived);
}
