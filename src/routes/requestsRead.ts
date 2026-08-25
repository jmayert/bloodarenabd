import { Response } from "express";
import { db } from "../db";
import { config } from "../config";
import { haversineKm } from "../services/geo";
import { esc } from "./donorCards";
import { docUrls, expireStaleRequests, json } from "./requests";

function urgencyRank(u: string): number {
  return u === "Critical" ? 0 : u === "High" ? 1 : 2;
}

/**
 * POST get_blood_requests=1 - public active feed.
 * Bare JSON array, urgency-priority ordering (Critical>High>Medium then
 * newest first), LIMIT 20 - shape preserved from PHP.
 */
export async function getBloodRequests(_req: any, res: Response) {
  try {
    await expireStaleRequests();
    const rows = await db.bloodRequest.findMany({
      where: { status: "Active" },
      include: { documents: { select: { token: true } } },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    });
    rows.sort((a, b) => {
      const r = urgencyRank(a.urgency) - urgencyRank(b.urgency);
      if (r !== 0) return r;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const out = rows.slice(0, 20).map((r) => ({
      id: r.id,
      patient_name: esc(r.patientName),
      blood_group: r.bloodGroup,
      hospital: esc(r.hospital),
      contact: r.contact,
      urgency: r.urgency,
      bags_needed: r.bagsNeeded,
      note: esc(r.note),
      required_at: r.requiredAt?.toISOString(),
      created_at: r.createdAt.toISOString(),
      verified_location: r.verifiedLocation,
      docs: docUrls(r.documents),
    }));
    return json(res, out);
  } catch (err) {
    console.error("get_blood_requests error", err);
    return json(res, []);
  }
}

/**
 * POST get_nearby_requests=1 - Haversine over exact hospital coords
 * (hospitals are public places; donors are never plotted), radius clamp
 * 1-50km, fallback:true when no GPS or nothing nearby.
 */
export async function getNearbyRequests(req: any, res: Response) {
  await expireStaleRequests();
  const latRaw = req.body.lat;
  const lngRaw = req.body.lng;
  const hasGps =
    latRaw !== undefined && latRaw !== "" && lngRaw !== undefined && lngRaw !== "";
  let radius = parseFloat(String(req.body.radius ?? config.rules.nearbyDefaultRadiusKm));
  if (Number.isNaN(radius)) radius = config.rules.nearbyDefaultRadiusKm;
  radius = Math.min(config.rules.nearbyMaxRadiusKm, Math.max(1, radius));
  const fGroup = String(req.body.filter_group ?? "All");

  const rows = await db.bloodRequest.findMany({
    where: {
      status: "Active",
      ...(fGroup !== "All" ? { bloodGroup: fGroup } : {}),
      ...(hasGps ? { hospitalLat: { not: null }, hospitalLng: { not: null } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const lat = parseFloat(String(latRaw));
  const lng = parseFloat(String(lngRaw));
  type Near = { dist: number; item: Record<string, unknown> };
  const nearby: Near[] = [];
  for (const r of rows) {
    const item: Record<string, unknown> = {
      id: r.id,
      patient_name: esc(r.patientName),
      blood_group: r.bloodGroup,
      hospital: esc(r.hospital),
      urgency: r.urgency,
      bags_needed: r.bagsNeeded,
      note: esc(r.note),
      created_at: r.createdAt.toISOString(),
      verified_location: r.verifiedLocation,
      lat: r.hospitalLat !== null ? Number(r.hospitalLat) : null,
      lng: r.hospitalLng !== null ? Number(r.hospitalLng) : null,
    };
    if (hasGps && r.hospitalLat !== null && r.hospitalLng !== null) {
      const dist = haversineKm(lat, lng, Number(r.hospitalLat), Number(r.hospitalLng));
      item["dist"] = Math.round(dist * 10) / 10;
      if (dist <= radius) nearby.push({ dist, item });
    } else {
      nearby.push({ dist: Infinity, item });
    }
  }
  nearby.sort((a, b) => a.dist - b.dist);
  const items = nearby.map((n) => n.item).slice(0, config.rules.nearbyResultCap);
  const fallback = !hasGps || items.length === 0;
  return json(res, { status: "success", requests: items, fallback });
}

/** POST get_map_data=1 - geo-tagged active requests only. */
export async function getMapData(_req: any, res: Response) {
  await expireStaleRequests();
  const rows = await db.bloodRequest.findMany({
    where: { status: "Active", hospitalLat: { not: null }, hospitalLng: { not: null } },
    orderBy: { createdAt: "desc" },
    take: config.rules.mapDataCap,
  });
  return json(res, {
    status: "success",
    requests: rows.map((r) => ({
      id: r.id,
      blood_group: r.bloodGroup,
      hospital: esc(r.hospital),
      urgency: r.urgency,
      lat: Number(r.hospitalLat),
      lng: Number(r.hospitalLng),
    })),
  });
}

/** POST get_my_requests=1 - owner view incl. secret code + usage count. */
export async function getMyRequests(req: any, res: Response) {
  await expireStaleRequests();
  const uid = req.session!.auth_uid;
  const rows = await db.bloodRequest.findMany({
    where: { authUid: uid, status: "Active" },
    include: { documents: { select: { token: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return json(res, {
    status: "success",
    requests: rows.map((r) => ({
      id: r.id,
      patient_name: esc(r.patientName),
      blood_group: r.bloodGroup,
      hospital: esc(r.hospital),
      urgency: r.urgency,
      bags_needed: r.bagsNeeded,
      note: esc(r.note),
      required_at: r.requiredAt?.toISOString(),
      created_at: r.createdAt.toISOString(),
      donation_code: r.donationCode,
      code_uses: r.codeUses,
      docs: docUrls(r.documents),
    })),
  });
}

/** POST delete_my_request=1 - ownership-checked soft delete. */
export async function deleteMyRequest(req: any, res: Response) {
  const id = parseInt(String(req.body.request_id ?? ""), 10);
  if (!Number.isInteger(id)) return json(res, { status: "error", msg: "অবৈধ অনুরোধ।" });
  const uid = req.session!.auth_uid;
  const row = await db.bloodRequest.findFirst({ where: { id, authUid: uid } });
  if (!row) return json(res, { status: "error", msg: "অনুরোধ পাওয়া যায়নি।" });
  await db.bloodRequest.update({ where: { id }, data: { status: "Deleted" } });
  return json(res, { status: "success", msg: "অনুরোধ মুছে ফেলা হয়েছে।" });
}
