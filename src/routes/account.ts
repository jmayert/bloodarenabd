import { Response } from "express";
import { db } from "../db";
import { getBadgeInfo } from "../services/donorAvailability";
import { json } from "./requests";

// Ported from includes/backend.php account dashboard + admin-message endpoints.

function displayDate(d: Date | null): string | null {
  if (!d || isNaN(d.getTime()) || d.getUTCFullYear() < 1971) return null;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** POST firebase_logout=1 */
export async function firebaseLogout(_req: any, res: Response) {
  res.clearCookie("ba_session");
  return json(res, { status: "ok" });
}

/** POST account_info=1 - profile + linked donor record (legacy phone fallback). */
export async function accountInfo(req: any, res: Response) {
  const uid = req.session?.auth_uid;
  if (!uid) return json(res, { status: "error", msg: "logged out" });

  const au = await db.authUser.findFirst({ where: { firebaseUid: uid } });
  if (!au) return json(res, { status: "error", msg: "Account not found।" });

  let donorRow = await db.donor.findFirst({
    where: { authUid: uid },
    select: {
      id: true, name: true, bloodGroup: true, location: true,
      totalDonations: true, willingToDonate: true, lastDonation: true, createdAt: true,
    },
  });
  if (!donorRow && au.phone) {
    donorRow = await db.donor.findFirst({
      where: { phone: au.phone },
      select: {
        id: true, name: true, bloodGroup: true, location: true,
        totalDonations: true, willingToDonate: true, lastDonation: true, createdAt: true,
      },
    });
  }

  let donor = null;
  if (donorRow) {
    const badge = getBadgeInfo(donorRow.totalDonations);
    const last =
      !donorRow.lastDonation || donorRow.lastDonation === "no" || donorRow.lastDonation === "0000-00-00"
        ? "no"
        : (() => {
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(donorRow!.lastDonation!);
            return m ? `${m[3]}/${m[2]}/${m[1]}` : "no";
          })();
    donor = {
      id: donorRow.id,
      name: donorRow.name,
      blood_group: donorRow.bloodGroup,
      location: donorRow.location,
      total_donations: donorRow.totalDonations,
      willing: donorRow.willingToDonate,
      last_donation: last,
      badge_level: badge.level,
      badge_icon: badge.icon,
      badge_color: badge.color,
      badge_bg: badge.bg,
      badge_border: badge.border,
      member_since: displayDate(donorRow.createdAt),
    };
  }

  return json(res, {
    status: "success",
    auth: {
      provider: au.provider,
      email: au.email,
      phone: au.phone,
      name: au.name,
      photo: req.session?.auth_photo ?? null,
      member_since: displayDate(au.createdAt),
      verified: au.verified,
      verify_channel: au.verifyChannel,
      verify_phone: au.verifyPhone,
    },
    donor,
  });
}

/** POST get_my_donations=1 - donation history with totals. */
export async function getMyDonations(req: any, res: Response) {
  const uid = req.session?.auth_uid;
  if (!uid) return json(res, { status: "error", msg: "logged out" });
  const sessionPhone = req.session?.auth_phone ?? null;

  let donor = await db.donor.findFirst({
    where: { authUid: uid },
    select: { id: true, totalDonations: true, lastDonation: true },
  });
  if (!donor && sessionPhone) {
    donor = await db.donor.findFirst({
      where: { phone: sessionPhone },
      select: { id: true, totalDonations: true, lastDonation: true },
    });
  }

  const history = await db.donationHistory.findMany({
    where: {
      OR: [
        { authUid: uid },
        ...(donor ? [{ donorId: donor.id }] : []),
      ],
    },
    orderBy: [{ donationDate: "desc" }, { id: "desc" }],
    take: 50,
  });

  const last =
    !donor || !donor.lastDonation || donor.lastDonation === "no" || donor.lastDonation === "0000-00-00"
      ? "no"
      : (() => {
          const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(donor!.lastDonation!);
          return m ? `${m[3]}/${m[2]}/${m[1]}` : "no";
        })();

  return json(res, {
    status: "success",
    total_donations: donor?.totalDonations ?? 0,
    last_donation: last,
    history: history.map((h) => ({
      ts: Math.floor(h.donationDate.getTime() / 1000),
      source: h.source,
      note: h.note,
    })),
  });
}

/** POST submit_admin_message=1 - contact-admin form (device-scoped). */
export async function submitAdminMessage(req: any, res: Response) {
  const senderName = String(req.body.sender_name ?? "").trim().slice(0, 100);
  const senderPhone = String(req.body.sender_phone ?? "").trim().slice(0, 20);
  const message = String(req.body.message ?? "").trim().slice(0, 2000);
  const deviceId = String(req.body.device_id ?? "").slice(0, 100);
  if (!senderName || !message)
    return json(res, { status: "error", msg: "নাম ও মেসেজ দিন।" });
  await db.adminMessage.create({
    data: {
      senderName,
      senderPhone: senderPhone || null,
      message,
      deviceId: deviceId || (req.session?.auth_uid ?? "anon").slice(0, 100),
    },
  });
  return json(res, { status: "success", msg: "মেসেজ পাঠানো হয়েছে।" });
}

/** POST get_admin_messages=1 - only replied messages shown to user (PHP parity). */
export async function getAdminMessages(req: any, res: Response) {
  const deviceId = String(req.body.device_id ?? req.session?.auth_uid ?? "").slice(0, 100);
  if (!deviceId) return json(res, { status: "success", messages: [] });
  const rows = await db.adminMessage.findMany({
    where: { deviceId, NOT: { adminReply: null } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return json(res, {
    status: "success",
    messages: rows.map((m) => ({
      id: m.id,
      message: m.message,
      reply: m.adminReply,
      replied_at: m.repliedAt?.toISOString() ?? null,
      created_at: m.createdAt.toISOString(),
      is_read: m.isRead ? 1 : 0,
    })),
  });
}

/** POST mark_admin_msg_read=1 */
export async function markAdminMsgRead(req: any, res: Response) {
  const deviceId = String(req.body.device_id ?? req.session?.auth_uid ?? "").slice(0, 100);
  const id = parseInt(String(req.body.msg_id ?? ""), 10);
  if (Number.isInteger(id))
    await db.adminMessage.updateMany({ where: { id, deviceId }, data: { isRead: true } });
  return json(res, { status: "success" });
}
