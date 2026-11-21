export interface BreakPlanInput { scheduledTime: string; durationMinutes: number; }
export function validateBreakPlans(input: unknown, existing: BreakPlanInput[] = []): { plans: BreakPlanInput[]; error?: string } {
  if (!Array.isArray(input) || input.length < 1 || input.length > 12) return { plans: [], error: 'Bir seferde 1–12 mola ekleyebilirsiniz.' };
  const plans: BreakPlanInput[] = [];
  for (const row of input) {
    if (!row || typeof row.scheduledTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.scheduledTime)) {
      return { plans: [], error: 'Mola saatini 00:00–23:59 arasında girin.' };
    }
    const durationMinutes = Number(row.durationMinutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 120) return { plans: [], error: 'Mola süresi 5–120 arasında tam dakika olmalıdır.' };
    plans.push({ scheduledTime: row.scheduledTime, durationMinutes });
  }
  const all = [...existing, ...plans].map((row) => {
    const [hour, minute] = row.scheduledTime.split(':').map(Number);
    return { start: hour * 60 + minute, duration: row.durationMinutes };
  });
  // Compare across midnight too (for example 23:50–00:20 against 00:10).
  for (let i = existing.length; i < all.length; i++) for (let j = 0; j < i; j++) {
    if ([-1440, 0, 1440].some((offset) => all[i].start < all[j].start + offset + all[j].duration && all[i].start + all[i].duration > all[j].start + offset)) {
      return { plans: [], error: 'Mola saatleri birbiriyle veya mevcut programla çakışıyor.' };
    }
  }
  return { plans: plans.sort((a,b) => a.scheduledTime.localeCompare(b.scheduledTime)) };
}
