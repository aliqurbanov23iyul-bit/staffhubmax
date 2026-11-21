import type { FtdEntry, FtdStatus } from './types';

export interface FtdStats {
  totalCount: number;
  approvedCount: number;
  pendingCount: number;
  totalAmount: number;
  approvedAmount: number;
}

export function hasDuplicateFtd(entries: FtdEntry[], memberUsername: string): boolean {
  const norm = memberUsername.trim().toLowerCase();
  return entries.some((e) => e.normalizedMemberUsername === norm);
}

export function computeFtdStats(entries: FtdEntry[]): FtdStats {
  let approvedCount = 0;
  let pendingCount = 0;
  let totalAmount = 0;
  let approvedAmount = 0;

  for (const entry of entries) {
    totalAmount += Number(entry.amount) || 0;
    if (entry.status === 'Onaylandı') {
      approvedCount += 1;
      approvedAmount += Number(entry.amount) || 0;
    } else {
      pendingCount += 1;
    }
  }

  return {
    totalCount: entries.length,
    approvedCount,
    pendingCount,
    totalAmount,
    approvedAmount,
  };
}

export interface FtdManagerGroup {
  managerId: string;
  managerName: string;
  entries: FtdEntry[];
  totalAmount: number;
  pendingCount: number;
}

export function groupFtdByManager(entries: FtdEntry[]): FtdManagerGroup[] {
  const groups = new Map<string, FtdManagerGroup>();

  for (const entry of entries) {
    let g = groups.get(entry.managerId);
    if (!g) {
      g = {
        managerId: entry.managerId,
        managerName: entry.managerName,
        entries: [],
        totalAmount: 0,
        pendingCount: 0,
      };
      groups.set(entry.managerId, g);
    }
    g.entries.push(entry);
    g.totalAmount += Number(entry.amount) || 0;
    if (entry.status === 'Onay Bekliyor') g.pendingCount += 1;
  }

  return Array.from(groups.values()).sort((a, b) => b.pendingCount - a.pendingCount);
}

export function filterFtdEntries(
  entries: FtdEntry[],
  filters: {
    managerId?: string;
    date?: string;
    status?: FtdStatus | 'Tümü' | '';
    memberUsername?: string;
  },
): FtdEntry[] {
  return entries.filter((e) => {
    if (filters.managerId && filters.managerId !== 'all' && e.managerId !== filters.managerId) {
      return false;
    }
    if (filters.status && filters.status !== 'Tümü' && e.status !== filters.status) {
      return false;
    }
    if (filters.memberUsername && filters.memberUsername.trim()) {
      if (
        !e.memberUsername.toLowerCase().includes(filters.memberUsername.trim().toLowerCase())
      ) {
        return false;
      }
    }
    if (filters.date) {
      const entryDate = e.createdAt.slice(0, 10);
      if (entryDate !== filters.date) return false;
    }
    return true;
  });
}
