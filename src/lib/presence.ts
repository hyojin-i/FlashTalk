/** Users without a heartbeat within this window are treated as offline in search. */
export const PRESENCE_OFFLINE_THRESHOLD_MS = 2 * 60 * 1000;

export function isPresenceEffectivelyOnline(
  isOnline: boolean,
  lastSeen: string | Date | null | undefined
): boolean {
  if (!isOnline) return false;
  if (!lastSeen) return false;
  const lastSeenMs = new Date(lastSeen).getTime();
  if (Number.isNaN(lastSeenMs)) return false;
  return Date.now() - lastSeenMs <= PRESENCE_OFFLINE_THRESHOLD_MS;
}
