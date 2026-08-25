import { describe, it, expect } from "vitest";
import {
  getLiveStatus,
  getBadgeInfo,
  daysSinceDonation,
} from "../src/services/donorAvailability";
import {
  crc32,
  applyLocationJitter,
  haversineKm,
  parseRegGeo,
} from "../src/services/geo";

describe("donor availability (120-day rule)", () => {
  it("returns Not Available when donated within 120 days", () => {
    const recent = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    expect(getLiveStatus(recent, "yes")).toBe("Not Available");
    // Cooldown overrides willingness
    expect(getLiveStatus(recent, "no")).toBe("Not Available");
  });

  it("returns Available after cooldown passes", () => {
    const old = new Date(Date.now() - 121 * 86400000).toISOString().slice(0, 10);
    expect(getLiveStatus(old, "yes")).toBe("Available");
  });

  it("cooldown boundary: status consistent with computed day-diff", () => {
    const edge = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
    const d = daysSinceDonation(edge)!;
    expect(getLiveStatus(edge, "yes")).toBe(d < 120 ? "Not Available" : "Available");
  });

  it("willingness decides once cooldown passed", () => {
    const old = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10);
    expect(getLiveStatus(old, "no")).toBe("Unavailable");
  });

  it("sentinels mean never donated -> willingness decides", () => {
    expect(getLiveStatus("no", "yes")).toBe("Available");
    expect(getLiveStatus("", "yes")).toBe("Available");
    expect(getLiveStatus(null, "no")).toBe("Unavailable");
    expect(getLiveStatus("0000-00-00", "yes")).toBe("Available");
  });
});

describe("badges (exact PHP thresholds)", () => {
  it("maps totals to levels", () => {
    expect(getBadgeInfo(0).level).toBe("New");
    expect(getBadgeInfo(1).level).toBe("New");
    expect(getBadgeInfo(2).level).toBe("Active");
    expect(getBadgeInfo(4).level).toBe("Active");
    expect(getBadgeInfo(5).level).toBe("Hero");
    expect(getBadgeInfo(9).level).toBe("Hero");
    expect(getBadgeInfo(10).level).toBe("Legend");
    expect(getBadgeInfo(50).level).toBe("Legend");
  });
});

describe("geo services", () => {
  it("crc32 matches known values (IEEE)", () => {
    expect(crc32("hello").toString(16)).toBe("3610a686");
    expect(crc32("").toString(16)).toBe("0");
  });

  it("jitter stays within bounds and deterministic in a bucket", () => {
    const [lat1, lng1] = applyLocationJitter(23.81, 90.41, 100, 500, "42");
    const [lat2, lng2] = applyLocationJitter(23.81, 90.41, 100, 500, "42");
    expect(lat1).toBeCloseTo(lat2, 9);
    expect(lng1).toBeCloseTo(lng2, 9);
    const dist = haversineKm(23.81, 90.41, lat1, lng1) * 1000;
    expect(dist).toBeGreaterThanOrEqual(90); // small tolerance vs exact 100m
    expect(dist).toBeLessThanOrEqual(520);
  });

  it("hidden donors jitter farther (500-1000m)", () => {
    const [lat, lng] = applyLocationJitter(23.81, 90.41, 500, 1000, "7");
    const dist = haversineKm(23.81, 90.41, lat, lng) * 1000;
    expect(dist).toBeGreaterThanOrEqual(480);
    expect(dist).toBeLessThanOrEqual(1020);
  });

  it("zero coordinates are never jittered", () => {
    expect(applyLocationJitter(0, 0, 100, 500, "1")).toEqual([0, 0]);
  });

  it("haversine matches known distances", () => {
    // Dhaka -> Narayanganj ~ 20km; Dhaka -> Chattogram ~ 264km
    const dhaka = haversineKm(23.81, 90.41, 23.6238, 90.5);
    expect(dhaka).toBeGreaterThan(15);
    expect(dhaka).toBeLessThan(25);
    const ctg = haversineKm(23.81, 90.41, 22.3569, 91.7832);
    expect(ctg).toBeGreaterThan(200);
    expect(ctg).toBeLessThan(230);
  });

  it("parses legacy reg_geo format and rejects junk", () => {
    expect(parseRegGeo("Lat: 23.8103, Lon: 90.4125")).toEqual({
      lat: 23.8103,
      lng: 90.4125,
    });
    expect(parseRegGeo("Lat:-23.5, Lon:88.1")).toEqual({ lat: -23.5, lng: 88.1 });
    expect(parseRegGeo("Not captured")).toBeNull();
    expect(parseRegGeo(null)).toBeNull();
  });
});
