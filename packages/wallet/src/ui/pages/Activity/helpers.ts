import type { ActivityItem } from '@/domain/activity';

export type DayGroup = 'Today' | 'Yesterday' | 'Earlier';
export const DAY_ORDER: readonly DayGroup[] = ['Today', 'Yesterday', 'Earlier'];

export function groupByDay(items: ActivityItem[], nowMs: number): Record<DayGroup, ActivityItem[]> {
  const startOfToday = new Date(nowMs).setHours(0, 0, 0, 0);
  const dayMs        = 24 * 60 * 60 * 1000;
  const out: Record<DayGroup, ActivityItem[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const item of items) {
    if      (item.timestamp >= startOfToday)         out.Today.push(item);
    else if (item.timestamp >= startOfToday - dayMs) out.Yesterday.push(item);
    else                                             out.Earlier.push(item);
  }
  return out;
}
