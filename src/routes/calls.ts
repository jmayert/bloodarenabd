import crypto from "crypto";
import { Response } from "express";
import { db } from "../db";
import { hasActiveBloodRequest } from "../middleware/auth";
import { json } from "./requests";

/**
 * POST get_phone=1 - reveal donor phone.
 * Gates preserved: auth + verified + caller must have an Active blood
 * request; allow_call=0 donors return request_only flow instead.
 */
export async function getPhone(req: any, res: Response) {
  const donorId = parseInt(String(req.body.donor_id ?? ""), 10);
  if (!Number.isInteger(donorId))
    return json(res, { status: "error", msg: "অবৈধ ডোনার।" });
  const donor = await db.donor.findUnique({ where: { id: donorId } });
  if (!donor) return json(res, { status: "error", msg: "ডোনার পাওয়া যায়নি।" });

  if (!donor.allowCall)
    return json(res, {
      status: "success",
      mode: "request_only",
      msg: "এই ডোনার সরাসরি কল গ্রহণ করছেন না — যোগাযোগের অনুরোধ পাঠান।",
    });

  const ok = await hasActiveBloodRequest(req.session!.auth_uid);
  if (!ok)
    return json(res, {
      status: "error",
      request_only: true,
      msg: "নিজের একটি সক্রিয় রক্তের অনুরোধ ছাড়া নম্বর পাওয়া যাবে না।",
    });

  return json(res, { status: "success", phone: donor.phone });
}

/** POST log_call=1 - legal-safety call log (gates same as get_phone). */
export async function logCall(req: any, res: Response) {
  const donorId = parseInt(String(req.body.donor_id ?? ""), 10);
  const callerName = String(req.body.caller_name ?? "").trim().slice(0, 120);
  const locationData = String(req.body.location_data ?? "").slice(0, 255);
  if (!Number.isInteger(donorId) || !callerName)
    return json(res, { status: "error", msg: "অবৈধ তথ্য।" });

  const donor = await db.donor.findUnique({ where: { id: donorId } });
  if (!donor) return json(res, { status: "error", msg: "ডোনার পাওয়া যায়নি।" });
  if (!(await hasActiveBloodRequest(req.session!.auth_uid)))
    return json(res, { status: "error", request_only: true, msg: "আগে রক্তের অনুরোধ করুন।" });

  await db.callLog.create({
    data: {
      donorId,
      callerName,
      callerPhone: req.session!.auth_phone?.slice(0, 20) ?? null,
      callerIp: req.ip?.slice(0, 45),
      callerLocation: locationData || null,
      deviceInfo: (req.headers["user-agent"] ?? "").slice(0, 255),
    },
  });
  await db.analyticsCounter.upsert({
    where: { counterName: "total_calls_ever" },
    create: { counterName: "total_calls_ever", counterValue: 1n },
    update: { counterValue: { increment: 1n } },
  });
  // Notify donor: service notification (device-scoped) + FCM push
  if (donor.deviceId) {
    await db.serviceNotification
      .create({
        data: {
          deviceId: donor.deviceId,
          type: "donor_called",
          message: `📞 ${callerName} আপনাকে রক্তের জন্য কল করেছেন।`,
        },
      })
      .catch(() => undefined);
  }
  return json(res, { status: "success" });
}

/** POST send_contact_request=1 - for allow_call=0 donors. */
export async function sendContactRequest(req: any, res: Response) {
  const donorId = parseInt(String(req.body.donor_id ?? ""), 10);
  const message = String(req.body.message ?? "").trim().slice(0, 500);
  const uid = req.session!.auth_uid;
  if (!Number.isInteger(donorId))
    return json(res, { status: "error", msg: "অবৈধ ডোনার।" });

  const donor = await db.donor.findUnique({ where: { id: donorId } });
  if (!donor) return json(res, { status: "error", msg: "ডোনার পাওয়া যায়নি।" });
  if (!(await hasActiveBloodRequest(uid)))
    return json(res, { status: "error", request_only: true, msg: "আগে রক্তের অনুরোধ করুন।" });

  // Dedupe pending within 1 hour (PHP port)
  const recent = await db.contactRequest.findFirst({
    where: {
      donorId,
      requesterAuthUid: uid,
      status: "pending",
      createdAt: { gte: new Date(Date.now() - 3600_000) },
    },
  });
  if (recent)
    return json(res, { status: "error", msg: "ইতিমধ্যে অনুরোধ পাঠানো হয়েছে। অপেক্ষা করুন।" });

  await db.contactRequest.create({
    data: {
      donorId,
      donorAuthUid: donor.authUid,
      requesterAuthUid: uid,
      requesterName: req.session!.auth_name?.slice(0, 120) ?? "Anonymous",
      requesterPhone: null,
      bloodGroup: donor.bloodGroup,
      message,
    },
  });
  if (donor.deviceId) {
    await db.serviceNotification
      .create({
        data: {
          deviceId: donor.deviceId,
          type: "contact_request",
          message: `✉️ ${req.session!.auth_name ?? "একজন রোগী"} আপনার যোগাযোগের অনুরোধ পাঠিয়েছেন।`,
        },
      })
      .catch(() => undefined);
  }
  return json(res, { status: "success", msg: "যোগাযোগের অনুরোধ পাঠানো হয়েছে।" });
}

/** POST get_my_contact_requests=1 - incoming list; phone hidden until accepted. */
export async function getMyContactRequests(req: any, res: Response) {
  const donor = await db.donor.findFirst({ where: { authUid: req.session!.auth_uid } });
  if (!donor) return json(res, { status: "success", requests: [] });
  const rows = await db.contactRequest.findMany({
    where: { donorId: donor.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return json(res, {
    status: "success",
    requests: rows.map((r) => ({
      id: r.id,
      name: r.requesterName,
      phone: r.status === "accepted" ? r.requesterPhone : null,
      blood_group: r.bloodGroup,
      message: r.message,
      status: r.status,
      created_at: r.createdAt.toISOString(),
    })),
  });
}

/** POST act_contact_request=1 - accept/decline with ownership check. */
export async function actContactRequest(req: any, res: Response) {
  const id = parseInt(String(req.body.request_id ?? ""), 10);
  const action = String(req.body.action ?? "");
  if (!Number.isInteger(id) || !["accept", "decline"].includes(action))
    return json(res, { status: "error", msg: "অবৈধ অনুরোধ।" });

  const donor = await db.donor.findFirst({ where: { authUid: req.session!.auth_uid } });
  if (!donor) return json(res, { status: "error", msg: "ডোনার প্রোফাইল নেই।" });
  const row = await db.contactRequest.findFirst({ where: { id, donorId: donor.id } });
  if (!row) return json(res, { status: "error", msg: "অনুরোধ পাওয়া যায়নি।" });

  if (action === "accept") {
    // Accept reveals requester phone to both sides
    const requester = await db.authUser.findFirst({
      where: { firebaseUid: row.requesterAuthUid ?? "" },
    });
    await db.contactRequest.update({
      where: { id },
      data: { status: "accepted", requesterPhone: requester?.phone ?? null },
    });
  } else {
    await db.contactRequest.update({ where: { id }, data: { status: "declined" } });
  }
  return json(res, { status: "success" });
}

/** POST submit_report=1 - harassment report. */
export async function submitReport(req: any, res: Response) {
  const donorPhone = String(req.body.donor_phone ?? "").trim().slice(0, 20);
  const harasserInfo = String(req.body.harasser_info ?? "").trim().slice(0, 255);
  const comment = String(req.body.report_comment ?? "").trim().slice(0, 1000);
  if (!donorPhone || !harasserInfo)
    return json(res, { status: "error", msg: "প্রয়োজনীয় তথ্য দিন।" });

  await db.report.create({
    data: { donorPhone, harasserInfo: harasserInfo.slice(0, 255), reportComment: comment },
  });
  // PHP sent mail() here; email delivery is queued best-effort in Node
  const { sendReportEmail } = require("../services/fanout") as typeof import("../services/fanout");
  setImmediate(() => void sendReportEmail(donorPhone, harasserInfo, comment).catch(() => undefined));
  return json(res, { status: "success", msg: "রিপোর্ট জমা হয়েছে। ধন্যবাদ।" });
}
