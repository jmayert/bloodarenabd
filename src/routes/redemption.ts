import { Response } from "express";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { json, expireStaleRequests } from "./requests";

function badgeFor(total: number): string {
  return total >= 10 ? "Legend" : total >= 5 ? "Hero" : total >= 2 ? "Active" : "New";
}

function todayDhaka(): string {
  return new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
}

const ERR_MSG: Record<string, string> = {
  no_donor: "আগে রক্তদাতা হিসেবে রেজিস্ট্রেশন করুন।",
  invalid_code: "কোড সঠিক নয় বা অনুরোধটি আর সক্রিয় নেই।",
  self_redemption: "নিজের অনুরোধের কোড ব্যবহার করা যাবে না।",
  already_redeemed: "এই অনুরোধে আপনি already ভেরিফাই করেছেন।",
  slots_exhausted: "এই অনুরোধের সব ব্যাগ already ভেরিফাই হয়ে গেছে।",
};

/**
 * POST redeem_donation_code=1 - race-safe slot claim.
 * Preserves: 6-digit format check, self-redemption block, exhausted-slot
 * reject, UNIQUE(request,donor) dedupe, count+1 + badge recompute +
 * last_donation=today + willing='no', history insert, counter increment.
 */
export async function redeemDonationCode(req: any, res: Response) {
  const code = String(req.body.code ?? "").trim();
  if (!/^\d{6}$/.test(code))
    return json(res, { status: "error", msg: "৬ সংখ্যার কোড দিন।" });
  const uid = req.session!.auth_uid;

  try {
    await expireStaleRequests();
    const result = await db.$transaction(async (tx) => {
      const donor = await tx.donor.findFirst({ where: { authUid: uid } });
      if (!donor) throw new Error("no_donor");

      const request = await tx.bloodRequest.findFirst({
        where: { donationCode: code, status: "Active" },
      });
      if (!request) throw new Error("invalid_code");
      if (request.authUid === uid) throw new Error("self_redemption");

      const dup = await tx.codeRedemption.findUnique({
        where: {
          requestId_donorId: { requestId: request.id, donorId: donor.id },
        },
      });
      if (dup) throw new Error("already_redeemed");

      // Race-safe slot claim
      const updated = await tx.bloodRequest.updateMany({
        where: { id: request.id, codeUses: { lt: request.bagsNeeded } },
        data: { codeUses: { increment: 1 } },
      });
      if (updated.count === 0) throw new Error("slots_exhausted");

      await tx.codeRedemption.create({
        data: {
          requestId: request.id,
          donorId: donor.id,
          donorAuthUid: uid,
          donationCode: code,
        },
      });

      const today = todayDhaka();
      const newTotal = donor.totalDonations + 1;
      await tx.donor.update({
        where: { id: donor.id },
        data: {
          totalDonations: newTotal,
          badgeLevel: badgeFor(newTotal),
          lastDonation: today,
          willingToDonate: "no",
        },
      });

      await tx.donationHistory.create({
        data: {
          authUid: uid,
          donorId: donor.id,
          donationDate: new Date(`${today}T00:00:00Z`),
          source: "code",
        },
      });

      await tx.analyticsCounter.upsert({
        where: { counterName: "total_donations_ever" },
        create: { counterName: "total_donations_ever", counterValue: 1n },
        update: { counterValue: { increment: 1n } },
      });

      return { requestId: request.id, requesterDevice: request.reqDeviceId };
    });

    const { notifyRedemption } = require("../services/fanout") as typeof import("../services/fanout");
    setImmediate(() =>
      void notifyRedemption(result.requestId, uid).catch(() => undefined)
    );

    return json(res, { status: "success", msg: "ডোনেশন যাচাই হয়েছে! 🎉" });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
      return json(res, { status: "error", msg: ERR_MSG.already_redeemed });
    if (err instanceof Error && ERR_MSG[err.message])
      return json(res, { status: "error", msg: ERR_MSG[err.message] });
    console.error("redeem_donation_code error", err);
    return json(res, { status: "error", msg: "সার্ভার সমস্যা।" });
  }
}

/**
 * POST add_offplatform_donation=1 - self-reported donation.
 * Gates preserved: date not future, within last 120 days window allowed for
 * reporting, and >=120 days after the last recorded donation.
 */
export async function addOffplatformDonation(req: any, res: Response) {
  const dateStr = String(req.body.donation_date ?? "").trim();
  const place = String(req.body.place ?? "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 140);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
    return json(res, { status: "error", msg: "অবৈধ তারিখ।" });

  const uid = req.session!.auth_uid;
  try {
    const donor = await db.donor.findFirst({ where: { authUid: uid } });
    if (!donor)
      return json(res, { status: "error", msg: "আগে রক্তদাতা হিসেবে রেজিস্ট্রেশন করুন।" });

    const date = new Date(`${dateStr}T00:00:00Z`);
    const now = new Date();
    if (date.getTime() > now.getTime())
      return json(res, { status: "error", msg: "ভবিষ্যতের তারিখ দেওয়া যাবে না।" });
    const daysAgo = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
    if (daysAgo > 120)
      return json(res, { status: "error", msg: "১২০ দিনের পুরোনো ডোনেশন লগ করা যাবে না।" });

    // Must be >=120 days after the last recorded donation
    const last = donor.lastDonation;
    if (last && last !== "no" && last !== "" && last !== "0000-00-00") {
      const lastDate = new Date(`${last}T00:00:00Z`);
      const gapDays = Math.floor((date.getTime() - lastDate.getTime()) / 86_400_000);
      if (gapDays < 120)
        return json(res, {
          status: "error",
          msg: "পরপর দুটি ডোনেশনের মধ্যে কমপক্ষে ১২০ দিন থাকতে হবে।",
        });
    }

    const newTotal = donor.totalDonations + 1;
    await db.$transaction([
      db.donationHistory.create({
        data: {
          authUid: uid,
          donorId: donor.id,
          donationDate: date,
          source: "self",
          note: place || null,
          reportedIp: req.ip?.slice(0, 45),
        },
      }),
      db.donor.update({
        where: { id: donor.id },
        data: {
          totalDonations: newTotal,
          badgeLevel: badgeFor(newTotal),
          lastDonation: dateStr,
          willingToDonate: "no",
        },
      }),
    ]);

    return json(res, { status: "success", msg: "ডোনেশন লগ হয়েছে!" });
  } catch (err) {
    console.error("add_offplatform_donation error", err);
    return json(res, { status: "error", msg: "সার্ভার সমস্যা।" });
  }
}
