import express from "express";
import { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import crypto from "crypto";
import { config } from "./config";
import {
  SESSION_COOKIE,
  signSession,
  newCsrfToken,
} from "./session";
import {
  attachSession,
  checkCSRF,
  requireAuth,
  hasActiveBloodRequest,
} from "./middleware/auth";
import { rateLimit } from "./middleware/rateLimit";
import { db } from "./db";

import * as donorsRoutes from "./routes/donors";
import * as requestsRoutes from "./routes/requests";
import * as requestsRead from "./routes/requestsRead";
import * as redemption from "./routes/redemption";
import * as callsRoutes from "./routes/calls";
import * as communityRoutes from "./routes/community";
import * as miscRoutes from "./routes/misc";
import * as authRoutes from "./routes/authRoutes";
import * as verifyRoutes from "./routes/verify";
import * as accountRoutes from "./routes/account";
import { readRequestDocument } from "./services/storage";
import { esc } from "./routes/donorCards";
import { purgeRateLimits } from "./middleware/rateLimit";
import path from "path";
import { renderShell } from "./views/renderShell";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 2 },
});

interface ActionDef {
  handler: (req: any, res: Response) => Promise<unknown>;
  auth?: boolean;
  csrf?: boolean;
  rate?: [number, number];
  upload?: boolean;
  // sets req.verifiedPhone for handlers that need it
  needsVerifiedPhone?: boolean;
}

// Compat-first dispatch table: mirrors the PHP $_POST flag-field contract.
export const actions: Record<string, ActionDef> = {
  // Donors
  ajax_submit: { handler: donorsRoutes.ajaxSubmit, auth: true, csrf: true, rate: [5, 300], needsVerifiedPhone: true },
  ajax_filter: { handler: donorsRoutes.ajaxFilter, csrf: true, rate: [60, 60] },
  load_my_donor: { handler: donorsRoutes.loadMyDonor, auth: true, csrf: true, rate: [30, 60] },
  set_willing: { handler: donorsRoutes.setWilling, auth: true, csrf: true, rate: [20, 60] },
  update_privacy: { handler: donorsRoutes.updatePrivacy, auth: true, csrf: true, rate: [20, 60] },
  delete_donor: { handler: donorsRoutes.deleteDonor, auth: true, csrf: true, rate: [2, 300] },
  get_nearby_donors: { handler: donorsRoutes.getNearbyDonors, csrf: true, rate: [20, 60] },

  // Requests
  submit_blood_request: { handler: requestsRoutes.submitBloodRequest, auth: true, csrf: true, rate: [3, 300], upload: true },
  get_blood_requests: { handler: requestsRead.getBloodRequests, csrf: true, rate: [60, 60] },
  get_nearby_requests: { handler: requestsRead.getNearbyRequests, csrf: true, rate: [30, 60] },
  get_map_data: { handler: requestsRead.getMapData, csrf: true, rate: [30, 60] },
  get_my_requests: { handler: requestsRead.getMyRequests, auth: true, csrf: true, rate: [30, 60] },
  delete_my_request: { handler: requestsRead.deleteMyRequest, auth: true, csrf: true, rate: [10, 60] },
  redeem_donation_code: { handler: redemption.redeemDonationCode, auth: true, csrf: true, rate: [10, 60] },
  add_offplatform_donation: { handler: redemption.addOffplatformDonation, auth: true, csrf: true, rate: [5, 3600] },

  // Calls / contact / reports
  get_phone: { handler: callsRoutes.getPhone, auth: true, csrf: true, rate: [10, 60] },
  log_call: { handler: callsRoutes.logCall, auth: true, csrf: true, rate: [20, 60] },
  send_contact_request: { handler: callsRoutes.sendContactRequest, auth: true, csrf: true, rate: [10, 300] },
  get_my_contact_requests: { handler: callsRoutes.getMyContactRequests, auth: true, csrf: true, rate: [30, 60] },
  act_contact_request: { handler: callsRoutes.actContactRequest, auth: true, csrf: true, rate: [20, 60] },
  submit_report: { handler: callsRoutes.submitReport, rate: [5, 300] },

  // Auth
  firebase_auth: { handler: authRoutes.firebaseAuth, csrf: false, rate: [10, 60] },
  firebase_logout: { handler: accountRoutes.firebaseLogout, csrf: true, rate: [10, 60] },

  // Verification (SMS OTP + Telegram contact-share)
  sms_send_otp: { handler: verifyRoutes.smsSendOtp, auth: true, csrf: true, rate: [5, 600] },
  sms_verify_otp: { handler: verifyRoutes.smsVerifyOtp, auth: true, csrf: true, rate: [10, 600] },
  tg_send_otp: { handler: verifyRoutes.tgSendOtp, auth: true, csrf: true, rate: [5, 600] },
  tg_check_verify: { handler: verifyRoutes.tgCheckVerify, auth: true, csrf: false, rate: [150, 300] },
  tg_verify_callback: { handler: verifyRoutes.tgVerifyCallback, csrf: false },
  cn_send_otp: { handler: verifyRoutes.cnSendOtp, auth: true, csrf: true, rate: [5, 600] },
  cn_apply_verify: { handler: verifyRoutes.cnApplyVerify, auth: true, csrf: true, rate: [10, 600] },

  // Account
  account_info: { handler: accountRoutes.accountInfo, auth: true, csrf: true, rate: [30, 60] },
  get_my_donations: { handler: accountRoutes.getMyDonations, auth: true, csrf: true, rate: [30, 60] },
  submit_admin_message: { handler: accountRoutes.submitAdminMessage, csrf: true, rate: [3, 300] },
  get_admin_messages: { handler: accountRoutes.getAdminMessages, rate: [60, 60] },
  mark_admin_msg_read: { handler: accountRoutes.markAdminMsgRead, rate: [60, 60] },

  // Misc
  get_analytics: { handler: miscRoutes.getAnalytics, csrf: true, rate: [10, 60] },
  ping_online: { handler: miscRoutes.pingOnline, rate: [120, 60] },
  save_device_id: { handler: miscRoutes.saveDeviceId, rate: [30, 60] },
  get_service_notifs: { handler: miscRoutes.getServiceNotifs, rate: [60, 60] },
  mark_service_notif_read: { handler: miscRoutes.markServiceNotifRead, rate: [60, 60] },
  delete_service_notif: { handler: miscRoutes.deleteServiceNotif, rate: [30, 60] },

  // Community (read endpoints open like PHP; writes rate-limited internally)
  get_community_posts: { handler: communityRoutes.getCommunityPosts, rate: [60, 60] },
  create_community_post: { handler: communityRoutes.createCommunityPost, auth: true, csrf: true, rate: [10, 60] },
  create_community_reply: { handler: communityRoutes.createCommunityReply, auth: true, csrf: true, rate: [30, 60] },
  get_community_unread: { handler: communityRoutes.getCommunityUnread, rate: [60, 60] },
};

async function resolveVerifiedPhone(req: Request): Promise<string | null> {
  // Verified phone = Firebase phone-provider session phone or the DB
  // verified verify_phone (SMS/Telegram bound) - matches _auth_is_verified().
  if (req.session?.auth_provider === "phone" && req.session?.auth_phone)
    return req.session.auth_phone;
  const uid = req.session?.auth_uid;
  if (!uid) return null;
  const au = await db.authUser.findFirst({
    where: { firebaseUid: uid, verified: true },
    select: { verifyPhone: true },
  });
  return au?.verifyPhone ?? null;
}

export function createApp(): express.Application {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  // Frontend posts everything as FormData (multipart) — parse it globally.
  const anyUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 2 },
  }).any();
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST") return next();
    anyUpload(req, res, (err: unknown) => {
      if (err) {
        console.error("multipart parse error", err);
        res.status(400).type("application/json").json({ status: "error", msg: "Request parse failed." });
        return;
      }
      next();
    });
  });
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(attachSession(config.jwtSecret()));

  // Security headers (parity with PHP/.htaccess baseline)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(self)");
    next();
  });

  // ---- GET micro-endpoints (exact query-string parity) ----

  // ?csrf=1 - fresh CSRF token (frontend self-heal depends on this)
  app.get("/", (req: Request, res: Response, next: NextFunction) => {
    if (req.query.csrf === undefined) return next();
    ensureSession(req as any, res);
    return res.type("application/json").json({ csrf_token: (req as any).session.csrf_token });
  });

  // ?manifest=1 - PWA manifest
  app.get("/", (req: Request, res: Response, next: NextFunction) => {
    if (req.query.manifest === undefined) return next();
    const icon = (n: number) => ({
      src: `/icon-${n}.png`,
      sizes: `${n}x${n}`,
      type: "image/png",
      purpose: "any maskable",
    });
    res.type("application/json").json({
      name: "Blood Arena",
      short_name: "Blood Arena",
      lang: "bn",
      display: "standalone",
      orientation: "portrait",
      background_color: config.colors.bgMain,
      theme_color: config.colors.primary,
      start_url: "/",
      icons: [icon(192), icon(512)],
      shortcuts: [
        { name: "রক্তদাতা খুঁজুন", url: "/?tab=donors" },
        { name: "জরুরি রক্তের অনুরোধ", url: "/?tab=emergency" },
      ],
    });
  });

  // ?badge_icon=1 - monochrome SVG badge
  app.get("/", (req: Request, res: Response, next: NextFunction) => {
    if (req.query.badge_icon === undefined) return next();
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#e53935" d="M12 2C12 2 5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-7-13-7-13z"/></svg>`
    );
  });

  // ?req_doc=<token> - token-guarded document images, same-origin only
  app.get("/", async (req: Request, res: Response, next: NextFunction) => {
    const token = String(req.query.req_doc ?? "");
    if (!token) return next();
    // Same-origin check: Sec-Fetch-Site or Referer host match (PHP parity)
    const fetchSite = String(req.headers["sec-fetch-site"] ?? "");
    const referer = String(req.headers.referer ?? "");
    const host = req.headers.host ?? "";
    const sameOrigin =
      fetchSite === "" || fetchSite === "same-origin" ||
      (referer !== "" && new URL(referer).host === host);
    if (!sameOrigin) return res.status(403).end();
    const doc = await readRequestDocument(token.slice(0, 64));
    if (!doc) return res.status(404).end();
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(doc.buffer);
  });

  // Static frontend assets (converted from assets/*.php)
  app.use(
    "/static",
    express.static(path.resolve(__dirname, "..", "public", "static"), {
      maxAge: "1h",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".css") || filePath.endsWith(".js"))
          res.setHeader("X-Content-Type-Options", "nosniff");
      },
    })
  );

  // Main page + AJAX endpoint (everything POSTs to "/")
  app.all("/", (req: Request, res: Response) => {
    void handleRoot(req, res);
  });

  // Vercel Cron: daily cleanup (PHP cleanup_requests.php replacement)
  app.get("/api/cron/cleanup", async (_req: Request, res: Response) => {
    try {
      await requestsRoutes.expireStaleRequests();
      // Hard-delete expired requests older than AUTO_DELETE_DAYS + docs
      const cutoff = new Date(
        Date.now() - config.autoDeleteDays * 86_400_000
      );
      const stale = await db.bloodRequest.findMany({
        where: { createdAt: { lt: cutoff }, status: { not: "Active" } },
        include: { documents: true },
        take: 500,
      });
      let deleted = 0;
      for (const r of stale) {
        try {
          const { removeDocument } = await import("./services/storage");
          for (const doc of r.documents) await removeDocument(doc.filePath);
          await db.requestDocument.deleteMany({ where: { requestId: r.id } });
          await db.codeRedemption.deleteMany({ where: { requestId: r.id } });
          await db.bloodRequest.delete({ where: { id: r.id } });
          deleted++;
        } catch (e) {
          console.error("cleanup item failed", r.id, e);
        }
      }
      // Online visitors + rate limit windows housekeeping
      await db.onlineVisitor.deleteMany({
        where: { lastSeen: { lt: new Date(Date.now() - 3600_000) } },
      });
      await purgeRateLimits();
      res.json({ ok: true, deleted });
    } catch (err) {
      console.error("cron cleanup error", err);
      res.status(500).json({ ok: false });
    }
  });

  async function handleRoot(req: Request, res: Response): Promise<void> {
    // Dispatch on flag fields (compat contract)
    const body = req.body as Record<string, unknown>;
    let actionKey: string | null = null;
    for (const key of Object.keys(actions)) {
      if (body[key] !== undefined && body[key] !== "" && body[key] !== "0") {
        actionKey = key;
        break;
      }
    }

    if (!actionKey || req.method !== "POST") {
      // No action: render the SPA shell (partials/head+body equivalent)
      ensureSession(req as any, res);
      const uid = (req as any).session?.auth_uid || "";
      let auth: Record<string, unknown> = {};
      if (uid) {
        const au = await db.authUser.findFirst({ where: { firebaseUid: uid } });
        if (au) {
          const donorRow = await db.donor.findFirst({
            where: { OR: [{ authUid: uid }, ...(au.phone ? [{ phone: au.phone }] : [])] },
            select: { id: true },
          });
          auth = {
            provider: au.provider,
            email: au.email,
            phone: au.phone,
            name: au.name,
            photo: (req as any).session?.auth_photo ?? null,
            verified: au.verified,
            verify_channel: au.verifyChannel,
            verify_phone: au.verifyPhone,
            has_donor: !!donorRow,
          };
        }
      }
      try {
        const html = await renderShell({
          csrfToken: (req as any).session!.csrf_token,
          signedIn: !!uid,
          auth,
        });
        res.setHeader("Cache-Control", "no-store");
        res.status(200).type("html").send(html);
      } catch (err) {
        console.error("shell render error", err);
        res.status(500).type("text").send("Server error");
      }
      return;
    }

    const def = actions[actionKey];

    // CSRF gate (bot callbacks use shared-secret instead — added in M5)
    if (def.csrf !== false) {
      await new Promise<void>((resolve) => {
        checkCSRF(req, res, () => resolve());
        if (res.writableEnded) resolve();
      });
      if (res.writableEnded) return;
    }

    // Auth gate
    if (def.auth) {
      const unauthorized = await new Promise<boolean>((resolve) => {
        requireAuth(req, res, () => resolve(false));
        if (res.writableEnded) resolve(true);
      });
      if (unauthorized) return;
    }

    if (def.needsVerifiedPhone) {
      (req as any).verifiedPhone = await resolveVerifiedPhone(req);
    }

    // Files were already parsed by the global multipart middleware (req.files)

    // Rate limit then dispatch
    const limited = await new Promise<boolean>((resolve) => {
      const mw = def.rate ? rateLimit(actionKey, def.rate[0], def.rate[1]) : (_q: Request, _r: Response, n: NextFunction) => n();
      mw(req as any, res, () => resolve(false));
      setTimeout(() => resolve(res.writableEnded), 1000);
    });
    if (limited) return;

    try {
      await def.handler(req as any, res);
    } catch (e) {
      console.error(`action ${actionKey} error`, e);
      if (!res.writableEnded)
        res.status(500).json({ status: "error", msg: "সার্ভার সমস্যা।" });
    }
  }

  /** Create a session (with CSRF token) when none exists. */
  function ensureSession(req: any, res: Response) {
    if (req.session) return;
    const csrf = newCsrfToken();
    const token = signSession(
      { auth_uid: "", auth_provider: "google", csrf_token: csrf },
      config.jwtSecret(),
      config.sessionTtlDays
    );
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: config.sessionTtlDays * 86_400_000,
    });
    req.session = {
      auth_uid: "",
      auth_provider: "google",
      csrf_token: csrf,
      iat: 0,
      exp: 0,
    };
  }

  return app;
}
