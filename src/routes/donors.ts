import { Response } from "express";
import { db } from "../db";
import { config } from "../config";
import { getLiveStatus } from "../services/donorAvailability";
import { applyLocationJitter, haversineKm, parseRegGeo } from "../services/geo";
import { renderDonorList, DonorRow } from "./donorCards";

// Ported from includes/backend.php donor endpoints. Response shapes are
// preserved exactly for frontend compatibility.

const BLOOD_GROUPS = config.rules.bloodGroups as readonly string[];

export function json(res: Response, data: unknown) {
  res.type("application/json; charset=utf-8").json(data);
}

const NAME_RE = /^[\p{L}\s.]{1,100}$/u;
const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

/** Validate last_donation input: 'no' or dd/mm/yyyy (not future, >= 1940). */
export function validateLastDonation(v: string): { ok: true; value: string } | { ok: false; msg: string } {
  if (v === "no" || v === "") return { ok: true, value: "no" };
  if (!DATE_RE.test(v)) return { ok: false, msg: "তারিখ ফরম্যাট ভুল। DD/MM/YYYY ব্যবহার করুন।" };
  const [dd, mm, yyyy] = v.split("/").map(Number);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  const today = new Date();
  if (
    d.getUTCDate() !== dd || d.getUTCMonth() !== mm - 1 ||
    yyyy < 1940 || d.getTime() > today.getTime()
  ) {
    return { ok: false, msg: "অবৈধ তারিখ।" };
  }
  return { ok: true, value: `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}` };
}

function badgeFor(total: number): string {
  return total >= 10 ? "Legend" : total >= 5 ? "Hero" : total >= 2 ? "Active" : "New";
}

/**
 * POST ajax_submit=1 — donor registration.
 * Preserves: phone must equal session-verified phone, gender-based privacy
 * defaults (Female -> hidden + no-call), legacy-row claiming by phone,
 * badge computation, device set-once semantics.
 */
export async function ajaxSubmit(req: RequestWithBody, res: Response) {
  const uid = req.session!.auth_uid;
  const b = req.body;
  const name = String(b.name ?? "").trim();
  const location = String(b.location ?? "").trim();
  const group = String(b.blood_group ?? "").trim();
  const gender = String(b.gender ?? "").trim();

  if (!NAME_RE.test(name)) return json(res, { status: "error", msg: "নাম অবৈধ (সর্বোচ্চ ১০০ অক্ষর)।" });
  if (!BLOOD_GROUPS.includes(group)) return json(res, { status: "error", msg: "অবৈধ রক্তের গ্রুপ।" });
  if (gender !== "Male" && gender !== "Female")
    return json(res, { status: "error", msg: "লিঙ্গ নির্বাচন করুন।" });

  // Phone must match the verified session phone (BD numbers only)
  const phone = String(b.phone ?? "").trim();
  const verifiedPhone = req.verifiedPhone;
  if (!verifiedPhone || phone !== verifiedPhone)
    return json(res, { status: "error", msg: "ফোন নম্বর যাচাইকৃত নম্বরের সাথে মেলে না।" });

  const lastRes = validateLastDonation(String(b.last_donation ?? "no"));
  if (!lastRes.ok) return json(res, { status: "error", msg: lastRes.msg });

  let totalDonations = parseInt(String(b.total_donations_reg ?? "0"), 10);
  if (Number.isNaN(totalDonations) || totalDonations < 0 || totalDonations > 999) totalDonations = 0;

  const regGeo = String(b.reg_geo_location ?? "Not captured").slice(0, 200) || "Not captured";
  const regDeviceId = String(b.device_id ?? "").slice(0, 100) || null;

  // Gender-based privacy defaults (exact port)
  const isFemale = gender === "Female";
  const hideMe = isFemale ? true : false;
  const allowCall = isFemale ? false : true;

  try {
    const existing = await db.donor.findFirst({ where: { authUid: uid } });
    const badgeLevel = badgeFor(totalDonations);

    if (existing) {
      await db.donor.update({
        where: { id: existing.id },
        data: {
          name, location, bloodGroup: group, lastDonation: lastRes.value,
          regGeo, totalDonations, badgeLevel,
          deviceId: existing.deviceId ?? regDeviceId,
          authEmail: req.session!.auth_email ?? existing.authEmail,
          gender, hideMe, allowCall,
        },
      });
    } else {
      // Legacy-row claim: same phone registered before auth existed
      const legacy = await db.donor.findFirst({
        where: { phone, OR: [{ authUid: null }, { authUid: "" }] },
      });
      if (legacy) {
        await db.donor.update({
          where: { id: legacy.id },
          data: {
            name, location, bloodGroup: group, lastDonation: lastRes.value,
            regGeo, totalDonations, badgeLevel,
            deviceId: regDeviceId, authUid: uid,
            authEmail: req.session!.auth_email ?? null,
            gender, hideMe, allowCall,
          },
        });
      } else {
        await db.donor.create({
          data: {
            name, phone, location, bloodGroup: group,
            lastDonation: lastRes.value,
            regIp: req.ip?.slice(0, 45), regDevice: regDeviceId, regGeo,
            totalDonations, badgeLevel, deviceId: regDeviceId,
            authUid: uid, authEmail: req.session!.auth_email ?? null,
            gender, hideMe, allowCall,
          },
        });
        await db.analyticsCounter.upsert({
          where: { counterName: "total_donations_ever" },
          create: { counterName: "total_donations_ever", counterValue: 1n },
          update: { counterValue: { increment: 1n } },
        }).catch(() => undefined);
      }
    }
    return json(res, { status: "success", msg: "রেজিস্ট্রেশন সফল!" });
  } catch (err) {
    console.error("ajax_submit error", err);
    return json(res, { status: "error", msg: "সার্ভার সমস্যা। পরে আবার চেষ্টা করুন।" });
  }
}

/** POST ajax_filter=1 — donor list with pagination (HTML compat response). */
export async function ajaxFilter(req: RequestWithBody, res: Response) {
  const b = req.body;
  let fGroup = String(b.filter_group ?? "All").trim();
  if (![...BLOOD_GROUPS, "All"].includes(fGroup)) fGroup = "All";
  let fStatus = String(b.filter_status ?? "All");
  if (!["All", "Available", "Unavailable", "Not Available"].includes(fStatus)) fStatus = "All";
  let fBadge = String(b.filter_badge ?? "All").trim();
  if (!["All", "New", "Active", "Hero", "Legend"].includes(fBadge)) fBadge = "All";
  const fSearch = String(b.search_query ?? "").trim().slice(0, 100);
  const fLocation = String(b.filter_location ?? "All").trim().slice(0, 200);
  const page = Math.max(1, parseInt(String(b.page ?? "1"), 10) || 1);
  const perPage = parseInt(String(b.per_page ?? "0"), 10);
  const limit = ([20, 50, 100] as number[]).includes(perPage) ? perPage : 20;
  const fDonated = String(b.filter_donated ?? "0") === "1";
  const start = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (fGroup !== "All" && fGroup !== "") where.bloodGroup = fGroup;
  if (fLocation !== "All" && fLocation !== "") where.location = { startsWith: fLocation };
  if (fSearch !== "") where.OR = [
    { name: { contains: fSearch } },
    { location: { contains: fSearch } },
  ];
  // Live-status filters — exact SQL semantics ported to Prisma
  const cooldownPassed = {
    OR: [
      { lastDonation: null }, { lastDonation: "no" }, { lastDonation: "" },
      { lastDonation: "0000-00-00" },
      ...realDatesOlderThan120Days(),
    ],
  };
  const inCooldown = {
    AND: [
      { NOT: { OR: [{ lastDonation: null }, { lastDonation: "no" }, { lastDonation: "" }, { lastDonation: "0000-00-00" }] } },
      ...realDatesWithin120Days(),
    ],
  };
  if (fStatus === "Available") {
    where.AND = [
      ...(where.AND as unknown[] ?? []),
      { NOT: { willingToDonate: "no" } },
      cooldownPassed,
    ];
  } else if (fStatus === "Unavailable") {
    where.AND = [...(where.AND as unknown[] ?? []), { willingToDonate: "no" }, cooldownPassed];
  } else if (fStatus === "Not Available") {
    where.AND = [...(where.AND as unknown[] ?? []), inCooldown];
  }
  if (fBadge !== "All" && fBadge !== "") where.badgeLevel = fBadge;
  if (fDonated) {
    where.AND = [
      ...(where.AND as unknown[] ?? []),
      { lastDonation: { not: null } },
      { NOT: { lastDonation: { in: ["no", "", "0000-00-00"] } } },
    ];
  }

  const orderBy = fDonated
    ? [{ lastDonation: "desc" as const }, { id: "desc" as const }]
    : [{ id: "desc" as const }];

  // DATEDIFF on DATE-typed strings can't be done in Prisma directly; the
  // donors.last_donation column stores VARCHAR dates, so compute the cutoff
  // date string and compare lexicographically (works because format is
  // YYYY-MM-DD).
  function realDateCutoff(): string {
    return isoDayOffset(-config.rules.availabilityDays);
  }
  function realDatesOlderThan120Days(): unknown[] {
    // donated <= cutoff date => cooldown passed
    return [{
      lastDonation: { lte: realDateCutoff(), gte: "1940-01-01" },
      // exclude non-date sentinels by prefix match on YYYY-
    }];
  }
  function realDatesWithin120Days(): unknown[] {
    return [{
      lastDonation: { gt: realDateCutoff() },
    }];
  }

  try {
    const [totalRecords, rows] = await Promise.all([
      db.donor.count({ where }),
      db.donor.findMany({ where, orderBy, skip: start, take: limit }),
    ]);

    const mapped: DonorRow[] = rows.map((r) => ({
      id: r.id, name: r.name, blood_group: r.bloodGroup,
      location: r.location, last_donation: r.lastDonation,
      willing_to_donate: r.willingToDonate, total_donations: r.totalDonations,
      badge_level: r.badgeLevel, created_at: r.createdAt,
      hide_me: r.hideMe ? 1 : 0, allow_call: r.allowCall ? 1 : 0,
    }));

    const rendered = renderDonorList(mapped, { start, page, limit, totalRecords });

    // Fresh global available counts per group (exact port)
    const cutoff = realDateCutoff();
    const grouped = await db.donor.groupBy({
      by: ["bloodGroup"],
      where: {
        NOT: { willingToDonate: "no" },
        OR: [
          { lastDonation: null }, { lastDonation: "no" }, { lastDonation: "" },
          { lastDonation: "0000-00-00" },
          { lastDonation: { lte: cutoff, gte: "1940-01-01" } },
        ],
      },
      _count: { _all: true },
    });
    const counts: Record<string, number> = { "A+": 0, "A-": 0, "B+": 0, "B-": 0, "AB+": 0, "AB-": 0, "O+": 0, "O-": 0 };
    for (const g of grouped) if (g.bloodGroup in counts) counts[g.bloodGroup] = g._count._all;
    const freshTotalAvail = Object.values(counts).reduce((a, x) => a + x, 0);

    return json(res, {
      table: rendered.table,
      cards: rendered.cards,
      counts,
      total_available: freshTotalAvail,
      pagination: rendered.pagination,
      total: totalRecords,
    });
  } catch (err) {
    console.error("ajax_filter error", err);
    return json(res, { status: "error", msg: "সার্ভার সমস্যা।" });
  }
}

export function isoDayOffset(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000 + 6 * 3600_000); // Asia/Dhaka
  return d.toISOString().slice(0, 10);
}

/** POST load_my_donor=1 */
export async function loadMyDonor(req: RequestWithBody, res: Response) {
  const donor = await db.donor.findFirst({ where: { authUid: req.session!.auth_uid } });
  if (!donor) return json(res, { status: "error", msg: "not_found" });
  return json(res, {
    status: "success",
    donor: {
      id: donor.id, name: donor.name, location: donor.location,
      blood_group: donor.bloodGroup, last_donation: donor.lastDonation,
      total_donations: donor.totalDonations, badge_level: donor.badgeLevel,
      reg_geo: donor.regGeo, gender: donor.gender,
      hide_me: donor.hideMe ? 1 : 0, allow_call: donor.allowCall ? 1 : 0,
    },
  });
}

/** POST set_willing=1 */
export async function setWilling(req: RequestWithBody, res: Response) {
  const willing = req.body.willing === "no" ? "no" : "yes";
  const donor = await db.donor.findFirst({ where: { authUid: req.session!.auth_uid } });
  if (!donor) return json(res, { status: "error", msg: "ডোনার প্রোফাইল পাওয়া যায়নি।" });
  await db.donor.update({ where: { id: donor.id }, data: { willingToDonate: willing } });
  return json(res, { status: "success" });
}

/** POST update_privacy=1 */
export async function updatePrivacy(req: RequestWithBody, res: Response) {
  const donor = await db.donor.findFirst({ where: { authUid: req.session!.auth_uid } });
  if (!donor) return json(res, { status: "error", msg: "ডোনার প্রোফাইল পাওয়া যায়নি।" });
  const data: { hideMe?: boolean; allowCall?: boolean } = {};
  if (req.body.hide_me !== undefined) data.hideMe = req.body.hide_me === "1" || req.body.hide_me === 1 || req.body.hide_me === true;
  if (req.body.allow_call !== undefined) data.allowCall = req.body.allow_call === "1" || req.body.allow_call === 1 || req.body.allow_call === true;
  await db.donor.update({ where: { id: donor.id }, data });
  return json(res, { status: "success", msg: "প্রাইভেসি আপডেট হয়েছে।" });
}

/** POST get_nearby_donors=1 — jittered coords only, top-30 by distance. */
export async function getNearbyDonors(req: RequestWithBody, res: Response) {
  const lat = parseFloat(String(req.body.lat ?? ""));
  const lng = parseFloat(String(req.body.lng ?? ""));
  if (Number.isNaN(lat) || Number.isNaN(lng))
    return json(res, { status: "error", msg: "অবৈধ অবস্থান।" });
  let radius = parseFloat(String(req.body.radius ?? config.rules.nearbyDefaultRadiusKm));
  if (Number.isNaN(radius)) radius = config.rules.nearbyDefaultRadiusKm;
  radius = Math.min(config.rules.nearbyMaxRadiusKm, Math.max(1, radius));
  const fGroup = String(req.body.filter_group ?? "All");
  const fStatus = String(req.body.filter_status ?? "All");

  const donors = await db.donor.findMany({
    where: { regGeo: { startsWith: "Lat:" } },
    select: {
      id: true, name: true, bloodGroup: true, location: true,
      lastDonation: true, willingToDonate: true, totalDonations: true,
      regGeo: true, hideMe: true, allowCall: true, badgeLevel: true,
    },
  });

  type Near = { dist: number; item: Record<string, unknown> };
  const nearby: Near[] = [];
  for (const row of donors) {
    const coords = parseRegGeo(row.regGeo);
    if (!coords) continue;
    const seed = String(row.id);
    const [jlat, jlng] = row.hideMe
      ? applyLocationJitter(coords.lat, coords.lng, 500, 1000, seed)
      : applyLocationJitter(coords.lat, coords.lng, 100, 500, seed);
    const dist = haversineKm(lat, lng, jlat, jlng);
    if (dist > radius) continue;
    if (fGroup !== "All" && row.bloodGroup !== fGroup) continue;
    const status = getLiveStatus(row.lastDonation, row.willingToDonate ?? "yes");
    if (fStatus !== "All" && status !== fStatus) continue;

    // hide_me: show only broad area (last comma segment)
    let locShow: string;
    if (row.hideMe) {
      const parts = row.location.split(",").map((p) => p.trim()).filter(Boolean);
      locShow = parts.length >= 2 ? parts[parts.length - 1] : "";
    } else {
      locShow = row.location;
    }

    nearby.push({
      dist,
      item: {
        id: row.id, name: esc(row.name), group: esc(row.bloodGroup),
        loc: esc(locShow), status,
        badge_level: row.badgeLevel ?? "New",
        total_donations: row.totalDonations ?? 0,
        allow_call: row.allowCall ? 1 : 0,
        hide_me: row.hideMe ? 1 : 0,
        dist: Math.round(dist * 10) / 10,
      },
    });
  }
  nearby.sort((a, b) => a.dist - b.dist);
  return json(res, { status: "success", donors: nearby.slice(0, config.rules.nearbyResultCap).map((n) => n.item) });
}

import { esc } from "./donorCards";
import { Request as ExpressRequest } from "express";
export interface RequestWithBody extends ExpressRequest {
  body: Record<string, any>;
  verifiedPhone?: string | null;
}

/**
 * POST delete_donor=1 — full account deletion across all related tables
 * plus Firebase Auth user removal. Requires typed confirmation.
 */
export async function deleteDonor(req: RequestWithBody, res: Response) {
  const confirm = String(req.body.confirm ?? "");
  if (confirm !== "DELETE" && confirm !== "মুছে ফেলুন")
    return json(res, { status: "error", msg: "নিশ্চিত করতে DELETE লিখুন।" });
  const uid = req.session!.auth_uid;
  const donor = await db.donor.findFirst({ where: { authUid: uid } });
  try {
    await db.$transaction(async (tx) => {
      if (donor) {
        await tx.codeRedemption.deleteMany({ where: { donorId: donor.id } });
        await tx.callLog.deleteMany({ where: { donorId: donor.id } });
        await tx.donationHistory.deleteMany({
          where: { OR: [{ authUid: uid }, { donorId: donor.id }] },
        });
        await tx.contactRequest.deleteMany({
          where: { OR: [{ donorId: donor.id }, { requesterAuthUid: uid }] },
        });
        await tx.donor.delete({ where: { id: donor.id } });
      }
      await tx.serviceNotification.deleteMany({ where: { deviceId: uid } });
      await tx.adminMessage.deleteMany({ where: { deviceId: uid } });
      await tx.fcmToken.deleteMany({ where: { deviceId: uid } });
      await tx.deviceToken.deleteMany({ where: { deviceId: uid } });
      await tx.onlineVisitor.deleteMany({ where: { visitorToken: uid } });
      await tx.communityPost.deleteMany({ where: { authUid: uid } });
      await tx.communityReply.deleteMany({ where: { authUid: uid } });
      await tx.authUser.deleteMany({ where: { firebaseUid: uid } });
    });
    // Firebase Auth user deletion is performed async (best effort)
    const { deleteFirebaseUser } = require("../services/firebaseAdmin");
    void deleteFirebaseUser(uid).catch(() => undefined);
    res.clearCookie("ba_session");
    return json(res, { status: "success", msg: "আপনার সব তথ্য মুছে ফেলা হয়েছে।" });
  } catch (err) {
    console.error("delete_donor error", err);
    return json(res, { status: "error", msg: "সার্ভার সমস্যা।" });
  }
}
