// Ported verbatim from includes/backend.php getLiveStatus() and getBadgeInfo().
// Business rule: donated within the last 120 days -> "Not Available" regardless
// of willingness; otherwise willingness decides ("Unavailable"/"Available").

export const AVAILABILITY_COOLDOWN_DAYS = 120;

/**
 * Day-difference between a donation date and today, computed against the
 * Asia/Dhaka calendar day (matches PHP server behavior on the original host).
 * Accepts 'YYYY-MM-DD'; returns null for sentinels ('no', '' , '0000-00-00').
 */
export function daysSinceDonation(lastDonation: string | null | undefined): number | null {
  if (!lastDonation || lastDonation === "no" || lastDonation === "0000-00-00") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(lastDonation);
  if (!m) return null;
  // Asia/Dhaka is UTC+6 year-round (no DST)
  const dhakaOffsetMs = 6 * 3600_000;
  const lastMs = Date.UTC(+m[1], +m[2] - 1, +m[3]) - dhakaOffsetMs;
  const nowDhaka = Date.now() + dhakaOffsetMs;
  const dayMs = 86_400_000;
  return Math.floor((nowDhaka - lastMs) / dayMs);
}

/** Exact port of getLiveStatus(). */
export function getLiveStatus(
  lastDonation: string | null | undefined,
  willing: string | null | undefined = "yes"
): "Not Available" | "Unavailable" | "Available" {
  const days = daysSinceDonation(lastDonation);
  if (days !== null && days < AVAILABILITY_COOLDOWN_DAYS) return "Not Available";
  if (willing === "no") return "Unavailable";
  return "Available";
}

export interface BadgeInfo {
  level: "New" | "Active" | "Hero" | "Legend";
  icon: string;
  color: string;
  bg: string;
  border: string;
}

/** Exact port of getBadgeInfo(). */
export function getBadgeInfo(total: number): BadgeInfo {
  if (total >= 10)
    return { level: "Legend", icon: "👑", color: "#f59e0b", bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)" };
  if (total >= 5)
    return { level: "Hero", icon: "🦸", color: "#8b5cf6", bg: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.4)" };
  if (total >= 2)
    return { level: "Active", icon: "⭐", color: "#3b82f6", bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.4)" };
  return { level: "New", icon: "🌱", color: "#10b981", bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.4)" };
}
