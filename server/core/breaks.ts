import type { BreakSession, BreakStatus } from './types';

export interface BreakTimingSnapshot {
  status: BreakStatus;
  totalAllowedSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  overdueSeconds: number;
  overdueMinutes: number;
  isDue: boolean;
  isOverdue: boolean;
}

export function parseScheduledDateTime(dateKey: string, scheduledTime: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = scheduledTime.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

export function computeBreakTiming(
  session: BreakSession,
  now: Date = new Date(),
): BreakTimingSnapshot {
  const totalAllowedSeconds = Math.max(1, (session.plannedMinutes + session.extraMinutes) * 60);

  if (session.status === 'Tamamlandı') {
    const startMs = session.startedAt ? new Date(session.startedAt).getTime() : now.getTime();
    const endMs = session.endedAt ? new Date(session.endedAt).getTime() : startMs;
    const elapsedSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
    const overdueSeconds = Math.max(0, elapsedSeconds - totalAllowedSeconds);
    return {
      status: 'Tamamlandı',
      totalAllowedSeconds,
      elapsedSeconds,
      remainingSeconds: Math.max(0, totalAllowedSeconds - elapsedSeconds),
      overdueSeconds,
      overdueMinutes: Math.ceil(overdueSeconds / 60),
      isDue: false,
      isOverdue: overdueSeconds > 0,
    };
  }

  if (session.status === 'Molada' || session.status === 'Gecikti') {
    const startMs = session.startedAt ? new Date(session.startedAt).getTime() : now.getTime();
    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startMs) / 1000));
    const remainingSeconds = Math.max(0, totalAllowedSeconds - elapsedSeconds);
    const overdueSeconds = Math.max(0, elapsedSeconds - totalAllowedSeconds);
    const isOverdue = overdueSeconds > 0;
    return {
      status: isOverdue ? 'Gecikti' : 'Molada',
      totalAllowedSeconds,
      elapsedSeconds,
      remainingSeconds,
      overdueSeconds,
      overdueMinutes: overdueSeconds > 0 ? Math.max(1, Math.floor(overdueSeconds / 60)) : 0,
      isDue: false,
      isOverdue,
    };
  }

  // Planned or Due
  const scheduledDt = parseScheduledDateTime(session.dateKey, session.scheduledTime);
  const isDue = now.getTime() >= scheduledDt.getTime();
  return {
    status: isDue ? 'Mola Saati Geldi' : 'Planlandı',
    totalAllowedSeconds,
    elapsedSeconds: 0,
    remainingSeconds: totalAllowedSeconds,
    overdueSeconds: 0,
    overdueMinutes: 0,
    isDue,
    isOverdue: false,
  };
}

export function canStartBreak(
  allUserSessions: BreakSession[],
  targetSessionId: string,
): { ok: boolean; reason?: string } {
  const active = allUserSessions.find(
    (s) => s.id !== targetSessionId && (s.status === 'Molada' || s.status === 'Gecikti'),
  );
  if (active) {
    return {
      ok: false,
      reason: `Aynı anda yalnızca bir aktif mola başlatılabilir (${active.breakNumber}. Mola devam ediyor).`,
    };
  }

  const target = allUserSessions.find((s) => s.id === targetSessionId);
  if (!target) {
    return { ok: false, reason: 'Mola kaydı bulunamadı.' };
  }
  if (target.status === 'Tamamlandı') {
    return { ok: false, reason: 'Bu mola zaten tamamlandı.' };
  }
  if (target.status === 'Molada' || target.status === 'Gecikti') {
    return { ok: false, reason: 'Bu mola zaten başlatılmış.' };
  }
  return { ok: true };
}

export function formatOverdueAlertMessage(
  session: BreakSession,
  timing: BreakTimingSnapshot,
): string {
  const elapsedMin = Math.floor(timing.elapsedSeconds / 60);
  const plannedMin = session.plannedMinutes + session.extraMinutes;
  const delayMin = Math.max(1, elapsedMin - plannedMin);
  return `MOLA SÜRESİ AŞILDI — Personel: ${session.userName} · Planlanan: ${plannedMin} Dk · Geçen: ${elapsedMin} Dk · Gecikme: ${delayMin} Dk`;
}
