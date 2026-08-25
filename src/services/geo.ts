// Ported verbatim from includes/backend.php:
//   applyLocationJitter(), _haversine_km(), and the reg_geo parsing pattern.
// Privacy invariant: exact donor coordinates NEVER leave the server; distance
// is computed from jittered coordinates only.

/** Standard CRC-32 (IEEE), matching PHP crc32(). */
export function crc32(str: string): number {
  let c: number;
  const table = crc32Table();
  let crc = 0 ^ -1;
  const bytes = Buffer.from(str, "utf8");
  for (let i = 0; i < bytes.length; i++) {
    c = (crc ^ bytes[i]) & 0xff;
    crc = (crc >>> 8) ^ table[c];
  }
  return (crc ^ -1) >>> 0;
}

let _table: number[] | null = null;
function crc32Table(): number[] {
  if (_table) return _table;
  _table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    _table[n] = c >>> 0;
  }
  return _table;
}

/**
 * Deterministic location jitter — exact port of applyLocationJitter().
 * Offset is stable within a ~10-minute bucket, seeded by donor id, so the
 * same donor appears consistently but real proximity cannot be reverse-
 * engineered across time.
 */
export function applyLocationJitter(
  lat: number,
  lng: number,
  minMeters: number,
  maxMeters: number,
  seed = ""
): [number, number] {
  if (lat === 0.0 && lng === 0.0) return [lat, lng];
  if (maxMeters < minMeters) {
    const t = minMeters;
    minMeters = maxMeters;
    maxMeters = t;
  }
  const bucket = Math.floor(Date.now() / 600_000); // ~10 min stability window
  const h1 = (crc32(`${seed}|dist|${bucket}`) & 0x7fffffff) as number;
  const h2 = (crc32(`${seed}|brng|${bucket}`) & 0x7fffffff) as number;
  const r1 = (h1 % 100000) / 100000.0; // 0..1
  const r2 = (h2 % 100000) / 100000.0; // 0..1
  const dist = minMeters + r1 * (maxMeters - minMeters); // metres
  const bearing = r2 * 2 * Math.PI; // radians
  const dLat = (dist * Math.cos(bearing)) / 111320.0;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dLng =
    (dist * Math.sin(bearing)) / (111320.0 * (cosLat !== 0.0 ? cosLat : 1e-6));
  return [lat + dLat, lng + dLng];
}

/** Haversine distance in km — exact port of _haversine_km(). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GEO_RE = /Lat:\s*([-0-9.]+),\s*Lon:\s*([-0-9.]+)/;

/** Parse the legacy `reg_geo` text format ("Lat: x, Lon: y"). */
export function parseRegGeo(
  regGeo: string | null | undefined
): { lat: number; lng: number } | null {
  if (!regGeo) return null;
  const m = GEO_RE.exec(regGeo);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}
