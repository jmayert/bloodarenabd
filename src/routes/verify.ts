import crypto from "crypto";
import { Response } from "express";
import { db } from "../db";
import { config } from "../config";
import { getBadgeInfo, daysSinceDonation } from "../services/donorAvailability";
import { sendSms, generateOtp, smsConfigured } from "../services/sms";
import { json } from "./requests";

// Ported from includes/backend.php verification + account endpoints.

const PHONE_RE = /^\+8801\d{9}$/;
const TOKEN_RE = /^[a-f0-9]{64}$/;
const VERIFY_TTL_SECONDS = 300;

function normalizeBdPhone(raw: string): string | null {
  let phone = String(raw ?? "").trim();
  if (/^01\d{9}$/.test(phone)) phone = `+88${phone}`;
  return PHONE_RE.test(phone) ? phone : null;
}

async function botPost(endpoint: string, payload: Record<string, unknown>): Promise<number> {
  const { telegramSend } = require("../services/telegram") as typeof import("../services/telegram");
  return telegramSend(endpoint, payload);
}

/** One number can verify only one account (duplicate prevention). */
async function phoneTakenByOther(phone: string, uid: string): Promise<boolean> {
  const row = await db.authUser.findFirst({
    where: { verifyPhone: phone, verified: true, NOT: { firebaseUid: uid } },
    select: { firebaseUid: true },
  });
  return !!row;
}

/**
 * DB rate gate for OTP sends (port of otp_rate_gate): 5-min cooldown +
 * 5/hour cap, per account OR phone. Returns wait seconds when blocked.
 */
async function otpRateGate(
  channelPrefix: string,
  uid: string,
  phone: string | null
): Promise<{ ok: boolean; wait: number; remaining: number; reason?: "cooldown" | "hourly" }> {
  const hourAgo = new Date(Date.now() - 3600_000);
  const cooldownAgo = new Date(Date.now() - 300_000);
  const rows = await db.smsOtp.findMany({
    where: {
      createdAt: { gte: hourAgo },
      OR: [{ authUid: uid }, ...(phone ? [{ phone }] : [])],
    },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length >= 5) {
    const oldest = rows[rows.length - 1].createdAt;
    return {
      ok: false,
      wait: Math.ceil((oldest.getTime() + 3600_000 - Date.now()) / 60000),
      remaining: 0,
      reason: "hourly",
    };
  }
  const last = rows.find((r) => r.createdAt > cooldownAgo);
  if (last && last.authUid === uid) {
    return {
      ok: false,
      wait: Math.ceil((last.createdAt.getTime() + 300_000 - Date.now()) / 60000),
      remaining: 5 - rows.length,
      reason: "cooldown",
    };
  }
  return { ok: true, wait: 0, remaining: 5 - rows.length };
}

/** Mark account verified in DB (session refresh happens via cookie re-issue). */
async function markAccountVerified(
  uid: string,
  channel: string,
  phone: string,
  tgChatId: string | null
): Promise<void> {
  await db.authUser.updateMany({
    where: { firebaseUid: uid },
    data: {
      verified: true,
      verifyChannel: channel,
      verifyPhone: phone,
      telegramChatId: tgChatId,
      verifiedAt: new Date(),
    },
  });
}

/** POST sms_send_otp=1 */
export async function smsSendOtp(req: any, res: Response) {
  const uid = req.session!.auth_uid;
  const phone = normalizeBdPhone(req.body.phone);
  if (!phone)
    return json(res, { status: "error", msg: "সঠিক বাংলাদেশি নম্বর দিন (+8801XXXXXXXXX)।" });
  if (!smsConfigured())
    return json(res, { status: "error", msg: "SMS যাচাই এখনো চালু হয়নি।" });

  const gate = await otpRateGate("sms_otp", uid, phone);
  if (!gate.ok) {
    const m = gate.wait;
    const msg =
      gate.reason === "hourly"
        ? `১ ঘণ্টায় সর্বোচ্চ ৫ বার OTP নেওয়া যায়। প্রায় ${m} মিনিট পর আবার চেষ্টা করুন। (Telegram দিয়ে verify করলে এই সীমা নেই)`
        : `৫ মিনিটের মধ্যে একবারই OTP পাঠানো যায়। প্রায় ${m} মিনিট পর আবার চেষ্টা করুন।`;
    return json(res, { status: "error", msg, wait: gate.wait * 60, remaining: 0 });
  }

  const code = generateOtp();
  const result = await sendSms(phone, `Your Blood Arena OTP is ${code}`);
  if (!result.success)
    return json(res, { status: "error", msg: `SMS পাঠানো যায়নি। ${result.error ?? ""}` });

  // Improved security: store hash instead of plaintext OTP (PHP stored plaintext)
  const otpHash = crypto.createHash("sha256").update(code).digest("hex");
  await db.smsOtp.create({
    data: {
      phone,
      otpHash,
      purpose: "register",
      authUid: uid,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    },
  });
  return json(res, {
    status: "success",
    msg: `📲 SMS-এ OTP পাঠানো হয়েছে ${phone} নম্বরে।`,
    wait: 300,
    remaining: gate.remaining,
  });
}

/** POST sms_verify_otp=1 */
export async function smsVerifyOtp(req: any, res: Response) {
  const uid = req.session!.auth_uid;
  const code = String(req.body.code ?? "").trim();
  if (!/^\d{6}$/.test(code))
    return json(res, { status: "error", msg: "৬-সংখ্যার কোড দিন।" });

  const otpHash = crypto.createHash("sha256").update(code).digest("hex");
  const row = await db.smsOtp.findFirst({
    where: { otpHash, isUsed: false, expiresAt: { gt: new Date() } },
    orderBy: { id: "desc" },
  });
  if (!row)
    return json(res, { status: "error", msg: "কোডের মেয়াদ শেষ বা ভুল কোড। আবার পাঠান।" });
  if (await phoneTakenByOther(row.phone, uid))
    return json(res, {
      status: "error",
      msg: "এই নম্বরটি দিয়ে আগে অন্য একটি অ্যাকাউন্ট verify করা হয়েছে। একটি নম্বর দিয়ে শুধু একটি অ্যাকাউন্ট verify করা যায়।",
    });

  await db.$transaction([
    db.smsOtp.update({ where: { id: row.id }, data: { isUsed: true } }),
    db.authUser.updateMany({
      where: { firebaseUid: uid },
      data: {
        verified: true,
        verifyChannel: "phone",
        verifyPhone: row.phone,
        verifiedAt: new Date(),
      },
    }),
  ]);
  return json(res, {
    status: "success",
    msg: "✅ SMS যাচাই সম্পন্ন!",
    channel: "phone",
    phone: row.phone,
  });
}

/** POST tg_send_otp=1 - create token, ask bot to /prepare, return deep link. */
export async function tgSendOtp(req: any, res: Response) {
  const uid = req.session!.auth_uid;
  if (!config.telegram.botUrl || !config.telegram.botSecret)
    return json(res, { status: "error", msg: "Telegram যাচাই এখনো চালু হয়নি।" });

  const token = crypto.randomBytes(32).toString("hex");
  await db.otpVerification.deleteMany({
    where: { authUid: uid, channel: "telegram_share", status: "pending" },
  });
  await db.otpVerification.create({
    data: {
      authUid: uid,
      channel: "telegram_share",
      token,
      status: "pending",
      expiresAt: new Date(Date.now() + VERIFY_TTL_SECONDS * 1000),
    },
  });

  const http = await botPost("prepare", { token });
  if (http !== 200) console.error(`tg_send_otp: bot /prepare failed http=${http}`);

  const link = config.telegram.botUsername
    ? `https://t.me/${config.telegram.botUsername}?start=${token}`
    : null;
  return json(res, {
    status: "open_bot",
    token,
    link,
    msg: "Telegram খুলুন — 'Share My Number' বাটনে চাপ দিন।",
  });
}

/** POST tg_check_verify=1 - poll status. */
export async function tgCheckVerify(req: any, res: Response) {
  const uid = req.session!.auth_uid;
  const token = String(req.body.token ?? "").trim();
  if (!TOKEN_RE.test(token)) return json(res, { status: "error", msg: "Invalid token." });

  const row = await db.otpVerification.findFirst({
    where: {
      token,
      authUid: uid,
      channel: { in: ["telegram_share", "tg_cn_share"] },
    },
  });
  if (!row || (row.expiresAt.getTime() < Date.now() && row.status !== "verified"))
    return json(res, { status: "expired", msg: "সময় শেষ। আবার চেষ্টা করুন।" });
  if (row.status === "verified")
    return json(res, { status: "verified", phone: row.phone, chat_id: row.tgChatId });
  return json(res, { status: "pending" });
}

/**
 * POST tg_verify_callback=1 - bot -> server callback.
 * Authenticated by shared secret instead of CSRF (PHP parity).
 * No rate limit entry needed; secret-guarded.
 */
export async function tgVerifyCallback(req: any, res: Response) {
  const secret = String(req.body.secret ?? "");
  const token = String(req.body.token ?? "").trim();
  const chatId = String(req.body.chat_id ?? "").trim();
  let phoneRaw = String(req.body.phone ?? "").trim();

  if (!config.telegram.botSecret || secret !== config.telegram.botSecret) {
    return res.status(403).type("application/json").json({ status: "error", msg: "Invalid secret." });
  }
  if (!TOKEN_RE.test(token) || !/^\+?\d{7,15}$/.test(phoneRaw) || chatId === "") {
    return res.status(400).type("application/json").json({ status: "error", msg: "Invalid params." });
  }
  if (!phoneRaw.startsWith("+")) phoneRaw = `+88${phoneRaw}`;
  if (!PHONE_RE.test(phoneRaw))
    return json(res, { status: "error", msg: "Invalid Bangladesh phone." });

  const row = await db.otpVerification.findFirst({
    where: { token, channel: { in: ["telegram_share", "tg_cn_share"] } },
  });
  if (!row)
    return json(res, { status: "not_found" });
  if (row.status === "verified")
    return json(res, { status: "already_verified" });
  if (row.expiresAt.getTime() < Date.now())
    return json(res, { status: "expired" });

  const uid = row.authUid;
  if (await phoneTakenByOther(phoneRaw, uid))
    return json(res, { status: "error", msg: "এই নম্বরটি অন্য অ্যাকাউন্টে ব্যবহার করা হয়েছে।" });

  // Change-number flow: shared number must match the requested new number
  if (row.channel === "tg_cn_share") {
    if (phoneRaw !== row.phone)
      return json(res, {
        status: "error",
        msg: "Telegram-এর নম্বরটি নতুন দেওয়া নম্বরের সাথে মেলেনি।",
      });
    await db.otpVerification.update({
      where: { id: row.id },
      data: { status: "verified", tgChatId: chatId },
    });
    return json(res, { status: "success", phone: phoneRaw });
  }

  // Supersede older verified binds with the same number
  await db.otpVerification.updateMany({
    where: { authUid: uid, status: "verified", phone: phoneRaw },
    data: { status: "superseded" },
  });
  await db.otpVerification.update({
    where: { id: row.id },
    data: { status: "verified", phone: phoneRaw, tgChatId: chatId },
  });
  await markAccountVerified(uid, "telegram", phoneRaw, chatId);
  return json(res, { status: "success", phone: phoneRaw });
}

async function donorOnOtherRow(phone: string, uid: string): Promise<boolean> {
  const row = await db.donor.findFirst({
    where: { phone, OR: [{ authUid: null }, { authUid: "" }, ...[{ NOT: { authUid: uid } }]] },
    select: { id: true },
  });
  return !!row;
}

/** POST cn_send_otp=1 - change number step 1 (Telegram). */
export async function cnSendOtp(req: any, res: Response) {
  const uid = req.session!.auth_uid;
  const donor = await db.donor.findFirst({ where: { authUid: uid }, select: { id: true } });
  if (!donor)
    return json(res, { status: "error", msg: "আপনার donor profile পাওয়া যায়নি। প্রথমে তথ্য লোড করুন।" });

  const phone = normalizeBdPhone(req.body.phone);
  if (!phone)
    return json(res, { status: "error", msg: "সঠিক বাংলাদেশি নম্বর দিন (+8801XXXXXXXXX)।" });

  const au = await db.authUser.findFirst({ where: { firebaseUid: uid }, select: { verifyPhone: true } });
  if (au?.verifyPhone && phone === au.verifyPhone)
    return json(res, { status: "error", msg: "এটি আপনার বর্তমান নম্বরই। নতুন নম্বর দিন।" });
  if (await phoneTakenByOther(phone, uid))
    return json(res, { status: "error", msg: "এই নম্বরটি দিয়ে আগে অন্য একটি অ্যাকাউন্ট verify করা হয়েছে।" });
  if (await donorOnOtherRow(phone, uid))
    return json(res, { status: "error", msg: "এই নম্বরটি দিয়ে ইতিমধ্যে একজন রক্তদাতা register করা আছে।" });
  if (!config.telegram.botUrl || !config.telegram.botSecret)
    return json(res, { status: "error", msg: "Telegram যাচাই এখনো চালু হয়নি।" });

  await db.otpVerification.updateMany({
    where: { authUid: uid, channel: "tg_cn_share", status: "pending" },
    data: { status: "superseded" },
  });
  const token = crypto.randomBytes(32).toString("hex");
  await db.otpVerification.create({
    data: {
      authUid: uid,
      channel: "tg_cn_share",
      phone,
      token,
      status: "pending",
      expiresAt: new Date(Date.now() + 300_000),
    },
  });
  const link = config.telegram.botUsername
    ? `https://t.me/${config.telegram.botUsername}?start=${token}`
    : "";
  return json(res, { status: "open_bot", link, token });
}

/** POST cn_apply_verify=1 - change number step 2 (atomic apply). */
export async function cnApplyVerify(req: any, res: Response) {
  const uid = req.session!.auth_uid;
  const token = String(req.body.token ?? "").trim();
  if (!TOKEN_RE.test(token)) return json(res, { status: "error", msg: "Invalid token." });

  const row = await db.otpVerification.findFirst({
    where: { token, authUid: uid, channel: "tg_cn_share" },
  });
  if (!row || row.status !== "verified")
    return json(res, { status: "error", msg: "নম্বর এখনো verify হয়নি। আবার চেষ্টা করুন।" });
  const newPhone = row.phone!;
  if (await phoneTakenByOther(newPhone, uid))
    return json(res, { status: "error", msg: "এই নম্বরটি দিয়ে আগে অন্য একটি অ্যাকাউন্ট verify করা হয়েছে।" });
  if (await donorOnOtherRow(newPhone, uid))
    return json(res, { status: "error", msg: "এই নম্বরটি দিয়ে ইতিমধ্যে একজন রক্তদাতা register আছে।" });

  const donor = await db.donor.findFirst({ where: { authUid: uid }, select: { id: true } });
  if (!donor)
    return json(res, { status: "error", msg: "আপনার donor profile পাওয়া যায়নি।" });

  await db.$transaction([
    db.donor.update({ where: { id: donor.id }, data: { phone: newPhone } }),
    db.authUser.updateMany({
      where: { firebaseUid: uid },
      data: {
        verified: true,
        verifyChannel: "telegram",
        verifyPhone: newPhone,
        telegramChatId: row.tgChatId,
        verifiedAt: new Date(),
      },
    }),
  ]);
  return json(res, {
    status: "success",
    msg: "✅ আপনার নম্বর সফলভাবে পরিবর্তন হয়েছে!",
    phone: newPhone,
  });
}
