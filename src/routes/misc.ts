import { Response } from "express";
import { db } from "../db";
import { config } from "../config";
import { getLiveStatus, getBadgeInfo, daysSinceDonation } from "../services/donorAvailability";
import { json, expireStaleRequests } from "./requests";

/**
 * POST get_analytics=1 - public analytics.
 * Shape preserved: totals, availability breakdowns, active requests,
 * monthly donations, top locations.
 */
export async function getAnalytics(_req: any, res: Response) {
  try {
    await expireStaleRequests();

    const [totalDonors, willingCount, activeRequests, counters, groupRows, monthRows, topLoc] =
      await Promise.all([
        db.donor.count(),
        db.donor.count({ where: { NOT: { willingToDonate: "no" } } }),
        db.bloodRequest.count({ where: { status: "Active" } }),
        db.analyticsCounter.findMany(),
        db.donor.groupBy({
          by: ["bloodGroup"],
          _count: { _all: true },
        }),
        // Last 6 months of verified donations
        db.donationHistory.findMany({
          where: {
            donationDate: {
              gte: new Date(new Date().setMonth(new Date().getMonth() - 6)),
            },
          },
          select: { donationDate: true },
        }),
        db.donor.groupBy({
          by: ["location"],
          _count: { _all: true },
          orderBy: { _count: { location: "desc" } },
          take: 5,
        }),
      ]);

    const counterMap: Record<string, number> = {};
    for (const c of counters) counterMap[c.counterName] = Number(c.counterValue);

    const availableByGroup: Record<string, number> = {};
    for (const g of config.rules.bloodGroups) availableByGroup[g] = 0;
    for (const row of groupRows) {
      if (row.bloodGroup in availableByGroup) availableByGroup[row.bloodGroup] = row._count._all;
    }

    // Monthly buckets (YYYY-MM)
    const months: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months[d.toISOString().slice(0, 7)] = 0;
    }
    for (const h of monthRows) {
      const key = h.donationDate.toISOString().slice(0, 7);
      if (key in months) months[key]++;
    }

    return json(res, {
      status: "success",
      total_donors: totalDonors,
      willing_donors: willingCount,
      active_requests: activeRequests,
      total_calls_ever: counterMap["total_calls_ever"] ?? 0,
      total_donations_ever: counterMap["total_donations_ever"] ?? 0,
      total_visitors_ever: counterMap["total_visitors_ever"] ?? 0,
      group_counts: availableByGroup,
      monthly_donations: months,
      top_locations: topLoc.map((l) => ({ location: l.location, count: l._count._all })),
    });
  } catch (err) {
    console.error("get_analytics error", err);
    return json(res, { status: "error", msg: "সার্ভার সমস্যা।" });
  }
}

/** POST ping_online=1 - presence heartbeat (no CSRF, like PHP). */
export async function pingOnline(req: any, res: Response) {
  try {
    const token = String(req.body.visitor_token ?? req.body.session_id ?? "")
      .trim()
      .slice(0, 100);
    if (!token) return json(res, { online: 0 });
    await db.onlineVisitor.upsert({
      where: { visitorToken: token },
      create: { visitorToken: token },
      update: { lastSeen: new Date() },
    });
    const cutoff = new Date(Date.now() - 2 * 60_000);
    const online = await db.onlineVisitor.count({ where: { lastSeen: { gte: cutoff } } });
    return json(res, { online });
  } catch (err) {
    console.error("ping_online error", err);
    return json(res, { online: 0 });
  }
}

/** POST save_device_id=1 */
export async function saveDeviceId(req: any, res: Response) {
  try {
    const deviceId = String(req.body.device_id ?? "").trim().slice(0, 100);
    if (!deviceId) return json(res, { status: "error" });
    const context = String(req.body.context ?? "").slice(0, 30) || null;
    await db.deviceToken.upsert({
      where: { deviceId },
      create: { deviceId, context, ip: req.ip?.slice(0, 45), ua: (req.headers["user-agent"] ?? "").slice(0, 300) },
      update: { context, updatedAt: new Date() },
    });
    // Bind to session user when logged in
    const uid = req.session?.auth_uid;
    if (uid) {
      await db.authUser.updateMany({ where: { firebaseUid: uid }, data: { deviceId } });
      await db.fcmToken.updateMany({ where: { deviceId }, data: { deviceId } });
    }
    return json(res, { status: "success" });
  } catch (err) {
    console.error("save_device_id error", err);
    return json(res, { status: "error" });
  }
}

/** POST get_service_notifs=1 - device-scoped notification inbox. */
export async function getServiceNotifs(req: any, res: Response) {
  try {
    const deviceId = String(req.body.device_id ?? req.session?.auth_uid ?? "").slice(0, 100);
    if (!deviceId) return json(res, { status: "success", notifications: [] });
    const rows = await db.serviceNotification.findMany({
      where: { deviceId },
      orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
      take: 30,
    });
    return json(res, {
      status: "success",
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        is_read: n.isRead ? 1 : 0,
        created_at: n.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("get_service_notifs error", err);
    return json(res, { status: "error", notifications: [] });
  }
}

/** POST mark_service_notif_read=1 (single or mark_all). */
export async function markServiceNotifRead(req: any, res: Response) {
  try {
    const deviceId = String(req.body.device_id ?? req.session?.auth_uid ?? "").slice(0, 100);
    if (req.body.mark_all) {
      await db.serviceNotification.updateMany({ where: { deviceId }, data: { isRead: true } });
    } else {
      const id = parseInt(String(req.body.notif_id ?? ""), 10);
      if (Number.isInteger(id))
        await db.serviceNotification.updateMany({
          where: { id, deviceId },
          data: { isRead: true },
        });
    }
    return json(res, { status: "success" });
  } catch (err) {
    console.error("mark_service_notif_read error", err);
    return json(res, { status: "error" });
  }
}

/** POST delete_service_notif=1 (single or del_all). */
export async function deleteServiceNotif(req: any, res: Response) {
  try {
    const deviceId = String(req.body.device_id ?? req.session?.auth_uid ?? "").slice(0, 100);
    if (req.body.del_all) {
      await db.serviceNotification.deleteMany({ where: { deviceId } });
    } else {
      const id = parseInt(String(req.body.notif_id ?? ""), 10);
      if (Number.isInteger(id))
        await db.serviceNotification.deleteMany({ where: { id, deviceId } });
    }
    return json(res, { status: "success" });
  } catch (err) {
    console.error("delete_service_notif error", err);
    return json(res, { status: "error" });
  }
}
