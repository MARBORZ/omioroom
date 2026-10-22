import type { Translations } from "./i18n/types.js";

/**
 * Universal Slavic/Russian pluralization helper:
 * 1 день, 2 дня, 5 дней.
 */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export interface ExpirationInfo {
  text: string;
  isUrgent: boolean;
}

/**
 * Formats the auto-delete countdown of an empty room:
 * - >= 24h: "Удалится через 6 д 23 ч" / "Deletes in 6d 23h"
 * - < 24h:  "Удалится через 5 ч 30 мин" / "Deletes in 5h 30m"
 * - < 1h:   "Удалится через 45 мин" / "Deletes in 45m" (marked as isUrgent: true)
 * - < 1m:   "Удалится меньше чем через минуту" / "Deletes in less than a minute"
 * - null/undefined: returns null (room is occupied or has no expiration).
 */
export function formatRoomExpiration(
  expiresAt: string | null | undefined,
  now: number,
  t: Translations
): ExpirationInfo | null {
  if (!expiresAt) return null;
  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) return null;

  const diffMs = target - now;
  if (diffMs <= 0) {
    return {
      text: t.myRooms.expiresSoon,
      isUrgent: true,
    };
  }

  const totalMinutes = Math.floor(diffMs / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  // Less than 1 hour: urgent (accent color)
  if (totalHours < 1) {
    const mins = Math.max(1, minutes);
    return {
      text: t.myRooms.expiresMinutes(mins),
      isUrgent: true,
    };
  }

  // Less than 24 hours: hours and minutes
  if (days < 1) {
    return {
      text: t.myRooms.expiresHoursMinutes(hours, minutes),
      isUrgent: false,
    };
  }

  // 1 day or more: days and hours
  return {
    text: t.myRooms.expiresDaysHours(days, hours),
    isUrgent: false,
  };
}
