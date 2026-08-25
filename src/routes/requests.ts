import { Response } from "express";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { config } from "../config";

const BLOOD_GROUPS = config.rules.bloodGroups as readonly string[];
const URGENCIES = config.rules.urgencies as readonly string[];

export function json(res: Response, data: unknown) {
  res.type("application/json; charset=utf-8").json(data);
}

export function docUrls(docs: { token: string }[]): string[] {
  return docs.map((d) => `?req_doc=${encodeURIComponent(d.token)}`);
}

/** Lazy expiry - Active requests older than 72h become Expired (PHP port). */
export async function expireStaleRequests(): Promise<void> {
  const cutoff = new Date(Date.now() - config.rules.requestExpiryHours * 3600_000);
  await db.bloodRequest.updateMany({
    where: { status: "Active", createdAt: { lt: cutoff } },
    data: { status: "Expired" },
  });
}

function urgencyRank(u: string): number {
  return u === "Critical" ? 0 : u === "High" ? 1 : 2;
}

async function generateDonationCode(
  tx: Prisma.TransactionClient
): Promise<string | null> {
  for (let i = 0; i < 6; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const clash = await tx.bloodRequest.findFirst({
      where: { donationCode: code, status: "Active" },
      select: { id: true },
    });
    if (!clash) return code;
  }
  return null;
}

/**
 * POST submit_blood_request=1
 * Mandatory doc upload(s), bags 1-10, verified_location only with coords,
 * unique donation code, service notification, queued background fan-out.
 */
export async function submitBloodRequest(req: any, res: Response) {
  const uid = req.session!.auth_uid;
  const b = req.body;

  const patientName = String(b.patient_name ?? "").trim().slice(0, 100);
  const group = String(b.req_blood_group ?? "").trim();
  const hospital = String(b.hospital ?? "").trim().slice(0, 200);
  const contact = String(b.req_contact ?? "").trim().slice(0, 20);
  let urgency = String(b.urgency ?? "High").trim();
  if (!URGENCIES.includes(urgency)) urgency = "High";
  const bagsNeeded = parseInt(String(b.bags_needed ?? "0"), 10);
  const note = String(b.req_note ?? "").trim().slice(0, 500);
  const requiredAtRaw = String(b.required_at ?? "").trim();
  const deviceId = String(b.device_id ?? "").slice(0, 100) || null;

  if (!patientName) return json(res, { status: "error", msg: "রোগীর নাম দিন।" });
  if (!BLOOD_GROUPS.includes(group))
    return json(res, { status: "error", msg: "অবৈধ রক্তের গ্রুপ।" });
  if (!hospital) return json(res, { status: "error", msg: "হাসপাতালের নাম দিন।" });
  if (!contact) return json(res, { status: "error", msg: "যোগাযোগ নম্বর দিন।" });
  if (!Number.isInteger(bagsNeeded) || bagsNeeded < 1 || bagsNeeded > config.rules.maxBags)
    return json(res, { status: "error", msg: "ব্যাগ সংখ্যা ১ থেকে ১০ এর মধ্যে হতে হবে।" });
  if (!requiredAtRaw || isNaN(Date.parse(requiredAtRaw)))
    return json(res, { status: "error", msg: "প্রয়োজনের তারিখ/সময় দিন।" });

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length < 1)
    return json(res, {
      status: "error",
      msg: "কমপক্ষে একটি ডকুমেন্ট ছবি আপলোড করা আবশ্যক।",
    });

  const lat = b.hospital_lat !== undefined && b.hospital_lat !== "" ? parseFloat(String(b.hospital_lat)) : null;
  const lng = b.hospital_lng !== undefined && b.hospital_lng !== "" ? parseFloat(String(b.hospital_lng)) : null;
  const hasCoords =
    lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng);

  try {
    await expireStaleRequests();

    const created = await db.$transaction(async (tx) => {
      const donationCode = await generateDonationCode(tx);
      if (!donationCode) throw new Error("code_generation_failed");
      const row = await tx.bloodRequest.create({
        data: {
          patientName,
          bloodGroup: group,
          hospital,
          contact,
          urgency,
          bagsNeeded,
          note,
          status: "Active",
          reqIp: req.ip?.slice(0, 45),
          authUid: uid,
          requiredAt: new Date(requiredAtRaw),
          hospitalLat: hasCoords ? new Prisma.Decimal(lat!) : null,
          hospitalLng: hasCoords ? new Prisma.Decimal(lng!) : null,
          verifiedLocation: hasCoords,
          donationCode,
          reqDeviceId: deviceId,
        },
      });
      const { saveRequestDocuments } = require("../services/storage") as typeof import("../services/storage");
      await saveRequestDocuments(tx, row.id, files.slice(0, 2));
      return row;
    });

    if (deviceId) {
      await db.serviceNotification
        .create({
          data: {
            deviceId,
            type: "secret_code_ready",
            message: `রক্তের অনুরোধ পোস্ট হয়েছে। সিক্রেট কোড: ${created.donationCode}`,
          },
        })
        .catch(() => undefined);
    }

    const { fanoutNewRequest } = require("../services/fanout") as typeof import("../services/fanout");
    setImmediate(() => {
      void fanoutNewRequest({
        requestId: created.id,
        bloodGroup: group,
        hospital,
        lat: hasCoords ? lat : null,
        lng: hasCoords ? lng : null,
        message: `🩸 জরুরি ${group} রক্ত প্রয়োজন — ${hospital}`,
      }).catch((e: unknown) => console.error("fanout error", e));
    });

    return json(res, { status: "success", request_id: created.id });
  } catch (err) {
    console.error("submit_blood_request error", err);
    const msg =
      err instanceof Error && err.message === "code_generation_failed"
        ? "কোড তৈরি করা যায়নি, আবার চেষ্টা করুন।"
        : "সার্ভার সমস্যা। পরে আবার চেষ্টা করুন।";
    return json(res, { status: "error", msg });
  }
}
