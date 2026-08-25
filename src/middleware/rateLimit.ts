import { Request, Response, NextFunction } from "express";
import { db } from "../db";

// Ported from PHP checkRateLimit(): per-action sliding window keyed by
// session identity (auth_uid) or client fingerprint (IP + device hint).
// DB-backed so it works on serverless (in-memory state is forbidden on Vercel).

export function rateLimit(action: string, max: number, windowSeconds: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = res.locals.session?.auth_uid as string | undefined;
      const key = (uid || req.ip || "anon").slice(0, 150);
      const now = new Date();
      const row = await db.rateLimit.findUnique({
        where: { key_action: { key, action } },
      });

      if (!row || now.getTime() - row.windowStart.getTime() > windowSeconds * 1000) {
        await db.rateLimit.upsert({
          where: { key_action: { key, action } },
          create: { key, action, windowStart: now, count: 1 },
          update: { windowStart: now, count: 1 },
        });
        return next();
      }

      if (row.count >= max) {
        // Matches the PHP behavior of returning an error JSON with a Bengali message
        return res
          .status(429)
          .json({ status: "error", msg: "অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।" });
      }

      await db.rateLimit.update({
        where: { key_action: { key, action } },
        data: { count: { increment: 1 } },
      });
      next();
    } catch (err) {
      // Rate limiting must never take down a request path; fail open but log.
      console.error("rateLimit error", err);
      next();
    }
  };
}

/** Opportunistic cleanup of expired windows (called from cron). */
export async function purgeRateLimits(olderThanMs = 24 * 3600_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const r = await db.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } });
  return r.count;
}
