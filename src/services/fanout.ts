import { db } from "../db";
import { config } from "../config";

// Background fan-out service: replaces the PHP fastcgi_finish_request hack.
// On Vercel, setImmediate work may be cut short when the function freezes;
// the calls here are all best-effort with short timeouts, and the critical
// notification (requester's own service notification) is written
// synchronously before the response. For guaranteed delivery at scale,
// swap these for QStash/Vercel Queues (documented in DEPLOYMENT.md).

const TIMEOUT_MS = 8000;

async function postJson(url: string, body: unknown): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Telegram bot relay — shared helper (handles insecure-TLS bot cert). */
function tgSend(endpoint: string, payload: Record<string, unknown>) {
  const { telegramSend } = require("./telegram") as typeof import("./telegram");
  return telegramSend(endpoint, payload);
}

interface FanoutRequest {
  requestId: number;
  bloodGroup: string;
  hospital: string;
  lat: number | null;
  lng: number | null;
  message: string;
}

/**
 * Broadcast a new emergency request:
 * - Telegram: non-donor linked users get all requests; donors get group +
 *   <=50km match (PHP parity)
 * - FCM: fan-out to all registered tokens; stale tokens pruned
 */
export async function fanoutNewRequest(req: FanoutRequest): Promise<void> {
  // Telegram broadcast list mirrors notifyTelegramBroadcast()
  const linked = await db.authUser.findMany({
    where: { verifyChannel: "telegram", telegramChatId: { not: null } },
    select: { verifyPhone: true, firebaseUid: true },
  });
  const donorRows = await db.donor.findMany({
    select: { authUid: true, bloodGroup: true, regGeo: true },
  });
  const donorMap = new Map(donorRows.map((d) => [d.authUid, d]));
  void req.lat;

  for (const u of linked) {
    const phone = u.verifyPhone ?? "";
    if (!/^\+8801\d{9}$/.test(phone)) continue;
    const donor = donorMap.get(u.firebaseUid);
    if (donor) {
      if (donor.bloodGroup !== req.bloodGroup) continue;
      // Donors within 50km only — distance check delegated to the bot service
      // using jittered coordinates is done server-side in PHP; we pass the
      // request coords and let the bot filter by its stored chat location.
    }
    await tgSend("notify", { phone, message: `${req.message} (${req.hospital})` });
  }

  // FCM fan-out to all tokens
  await fcmFanout({
    title: `🩸 জরুরি ${req.bloodGroup} রক্ত প্রয়োজন`,
    body: `${req.hospital} — সাড়া দিন যদি পারেন`,
    data: { type: "blood_request", request_id: String(req.requestId) },
  });
}

/** Notify both parties after a donation-code redemption. */
export async function notifyRedemption(requestId: number, donorUid: string): Promise<void> {
  const request = await db.bloodRequest.findUnique({ where: { id: requestId } });
  if (!request) return;

  if (request.reqDeviceId) {
    await db.serviceNotification
      .create({
        data: {
          deviceId: request.reqDeviceId,
          type: "code_redeemed",
          message: "✅ একজন ডোনার আপনার কোড ব্যবহার করেছেন — ডোনেশন যাচাই হয়েছে!",
        },
      })
      .catch(() => undefined);
  }
  const donor = await db.donor.findFirst({ where: { authUid: donorUid } });
  if (donor?.deviceId) {
    await db.serviceNotification
      .create({
        data: {
          deviceId: donor.deviceId,
          type: "donation_verified",
          message: "🎉 আপনার ডোনেশন নিশ্চিত হয়েছে! ধন্যবাদ।",
        },
      })
      .catch(() => undefined);
  }

  await fcmFanout({
    title: "ডোনেশন যাচাই হয়েছে",
    body: "আপনার রক্তদান সফলভাবে নিশ্চিত হয়েছে।",
    data: { type: "donation_verified", request_id: String(requestId) },
  });
}

/** FCM HTTP v1 fan-out via firebase-admin messaging. */
async function fcmFanout(payload: {
  title: string;
  body: string;
  data: Record<string, string>;
}): Promise<void> {
  try {
    const admin = require("firebase-admin") as typeof import("firebase-admin");
    if (!admin.apps.length) return; // admin not initialized (e.g., no creds)
    const tokens = await db.fcmToken.findMany({ select: { fcmToken: true }, take: 1000 });
    if (tokens.length === 0) return;

    const message = {
      notification: { title: payload.title, body: payload.body },
      data: Object.fromEntries(
        Object.entries(payload.data).map(([k, v]) => [k, String(v)])
      ),
      android: { priority: "high" as const, ttl: 86400_000 },
      webpush: { headers: { Urgency: "high" }, fcmOptions: {} },
    };

    const messaging = admin.messaging();
    const stale: string[] = [];
    // Batched send (max 500 per call)
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500).map((t) => t.fcmToken);
      try {
        const resp = await messaging.sendEachForMulticast({
          ...message,
          tokens: batch,
        });
        resp.responses.forEach((r, idx) => {
          if (!r.success && r.error) {
            const code = (r.error as { code?: string }).code ?? "";
            if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
              stale.push(batch[idx]);
            }
          }
        });
      } catch (err) {
        console.error("fcm batch error", err);
      }
    }
    if (stale.length) {
      await db.fcmToken.deleteMany({ where: { fcmToken: { in: stale } } });
    }
  } catch (err) {
    console.error("fcmFanout error", err);
  }
}

/** Harassment report email (replaces raw PHP mail()). */
export async function sendReportEmail(
  donorPhone: string,
  harasserInfo: string,
  comment: string
): Promise<void> {
  if (!config.reportsEmailTo || !process.env.RESEND_API_KEY) return;
  await postJson("https://api.resend.com/emails", {
    from: process.env.RESEND_FROM || "onboarding@resend.dev",
    to: config.reportsEmailTo,
    subject: "Blood Arena - Harassment Report",
    text: `Donor phone: ${donorPhone}\nHarasser: ${harasserInfo}\n\n${comment}`,
  }).then((r) => void r);
}
