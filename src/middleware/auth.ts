import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db } from "../db";
import { SESSION_COOKIE, SessionPayload, verifySession } from "../session";

declare module "express-serve-static-core" {
  interface Request {
    session?: SessionPayload;
  }
}

export function attachSession(secret: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const raw = req.cookies?.[SESSION_COOKIE];
    if (raw) {
      const payload = verifySession(raw, secret);
      if (payload) req.session = payload;
    }
    next();
  };
}

/** Ported from PHP checkCSRF(): POST-only + hash_equals token comparison. */
export function checkCSRF(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "POST") {
    return res.status(403).json({ status: "error", msg: "Security check failed" });
  }
  const token = (req.body?.csrf_token as string) || "";
  const expected = req.session?.csrf_token;
  if (!expected || !token || !timingSafeEqualStr(token, expected)) {
    return res.status(403).json({ status: "error", msg: "Security check failed" });
  }
  next();
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.auth_uid) {
    return res.status(401).json({ status: "error", msg: "লগইন প্রয়োজন।" });
  }
  next();
}

// Admin auth arrives in Phase 2; until then admins are simply users.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.auth_uid) {
    return res.status(403).json({ status: "error", msg: "Access denied" });
  }
  next();
}

/**
 * Ported from _has_active_blood_request(): callers may only reveal donor
 * phones / log calls / send contact requests while they have an Active
 * emergency request of their own. This is a critical anti-abuse gate.
 */
export async function hasActiveBloodRequest(authUid: string): Promise<boolean> {
  const count = await db.bloodRequest.count({
    where: { authUid, status: "Active", createdAt: { gt: expiryCutoff() } },
  });
  return count > 0;
}

export function requireActiveBloodRequest(req: Request, res: Response, next: NextFunction) {
  hasActiveBloodRequest(req.session!.auth_uid)
    .then((ok) => {
      if (!ok) {
        return res.status(403).json({
          status: "error",
          request_only: true,
          msg: "রক্ত চাইতে হবে আগে — নিজের একটি সক্রিয় রক্তের অনুরোধ ছাড়া ডোনারের নম্বর পাওয়া যাবে না।",
        });
      }
      next();
    })
    .catch(next);
}

import { config } from "../config";
export function expiryCutoff(): Date {
  return new Date(Date.now() - config.rules.requestExpiryHours * 3600_000);
}
