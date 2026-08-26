import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db } from "../db";
import { config } from "../config";

// Server-side shell renderer: substitutes the template placeholders with
// per-request values, mirroring what partials/head.php + body.php produced.

let cachedTemplate: string | null = null;

function template(): string {
  if (!cachedTemplate) {
    cachedTemplate = fs.readFileSync(
      path.resolve(__dirname, "shell.template.html"),
      "utf8"
    );
  }
  return cachedTemplate;
}

const BLOOD_GROUPS = config.rules.bloodGroups;
const ID_MAP: Record<string, string> = {
  "A+": "Aplus", "A-": "Aminus", "B+": "Bplus", "B-": "Bminus",
  "AB+": "ABplus", "AB-": "ABminus", "O+": "Oplus", "O-": "Ominus",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function socialLinks(): Array<{ url: string; cls: string; label: string; svg: string }> {
  const svgFb = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7h2.4l.4-2.8h-2.8V9.4c0-.8.2-1.4 1.4-1.4h1.5V5.5c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2H8.2V14h2.7v7h2.6z"/></svg>';
  const svgTg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3l-3.3 15.5c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.5l-4.9-1.5c-1-.3-1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5z"/></svg>';
  return [
    { url: process.env.SOCIAL_FACEBOOK || "#", cls: "sc-fb", label: "Facebook", svg: svgFb },
    { url: process.env.SOCIAL_TELEGRAM || "#", cls: "sc-tg", label: "Telegram", svg: svgTg },
  ];
}

function socialBarHtml(): string {
  const items = socialLinks()
    .map(
      (s) =>
        `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" class="social-btn ${s.cls}" aria-label="${s.label}" title="${s.label}">${s.svg}</a>`
    )
    .join("");
  return `<div class="social-connect"><p class="social-connect-label">আমাদের সাথে যুক্ত থাকুন</p><div class="social-connect-row">${items}</div></div>`;
}

function bgOptions(withValue: boolean): string {
  return BLOOD_GROUPS.map((g) =>
    withValue ? `<option value='${g}'>${g}</option>` : `<option>${g}</option>`
  ).join("");
}

async function freshAvailableCounts(): Promise<{ counts: Record<string, number>; total: number }> {
  // Mirrors the fresh-counts query in ajax_filter (PHP parity)
  const cutoff = isoDayOffset(-config.rules.availabilityDays);
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
  }).catch(() => [] as Array<{ bloodGroup: string; _count: { _all: number } }>);
  const counts: Record<string, number> = {};
  let total = 0;
  for (const g of BLOOD_GROUPS) counts[ID_MAP[g]] = 0;
  for (const row of grouped) {
    const id = ID_MAP[row.bloodGroup];
    if (id) {
      counts[id] = row._count._all;
      total += row._count._all;
    }
  }
  return { counts, total };
}

export function isoDayOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000 + 6 * 3600_000)
    .toISOString()
    .slice(0, 10);
}

export interface ShellLocals {
  csrfToken: string;
  signedIn: boolean;
  auth: Record<string, unknown>;
}

export async function renderShell(locals: ShellLocals): Promise<string> {
  const year = String(new Date().getFullYear());
  const brand = process.env.BRAND_NAME || "Blood Arena";
  const brandShort = process.env.BRAND_SHORT || "BA";
  const brandTagline = process.env.BRAND_TAGLINE || "রক্ত দিন, জীবন বাঁচান";
  const logo = process.env.LOGO_PATH || "logo.png";
  const siteUrl = process.env.SITE_URL || "";
  const orgName = process.env.ORG_NAME || "Blood Arena";
  const contactPhone = process.env.CONTACT_PHONE || "";
  const colorTheme = process.env.COLOR_THEME || config.colors.primary;

  const baConfig = {
    csrfToken: locals.csrfToken,
    siteUrl,
    firebase: {
      apiKey: process.env.FIREBASE_WEB_API_KEY || "",
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.FIREBASE_PROJECT_ID_PUBLIC || process.env.FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.FIREBASE_APP_ID || "",
      measurementId: process.env.FIREBASE_MEASUREMENT_ID || "",
      vapidKey: process.env.VAPID_PUBLIC_KEY || "",
    },
    // Must be FALSY when logged out — head-init's _serverSessionAlive() uses
    // truthiness of BA_AUTH to decide whether silent re-auth is needed.
    auth: locals.signedIn ? locals.auth : null,
  };
  const cfgJson = JSON.stringify(baConfig).replace(/</g, "\\u003c");

  const banners = (process.env.BANNERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const bannerSlides = banners
    .map(
      (f, i) =>
        `<div class="banner-slide"><img src="/${esc(f)}" alt="ব্যানার ${i + 1}" loading="${i === 0 ? "eager" : "lazy"}" decoding="async"></div>`
    )
    .join("\n");

  const chips = BLOOD_GROUPS.map(
    (g) =>
      `<button class="req-bg-chip" data-group="${g}" onclick="setReqGroupFilter('${g}')">${g}</button>`
  ).join("\n        ");
  const mapPills = BLOOD_GROUPS.map(
    (g) =>
      `<button class="map-pill" data-val="${g}" onclick="setMapFilter('group','${g}',this)">${g}</button>`
  ).join("\n                ");
  const reqGroupBtns = BLOOD_GROUPS.map(
    (g) =>
      `<button type="button" class="req-group-btn" onclick="selectReqGroup(this,'${g}')" data-group="${g}">${g}</button>`
  ).join("\n                    ");

  const fabItems = socialLinks()
    .map(
      (s) =>
        `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" class="social-btn ${s.cls}" aria-label="${s.label}" title="${s.label}">${s.svg}</a>`
    )
    .join("\n      ");

  let html = template();

  // Conditional banner region
  html = html.replace(/<!--IF:BANNERS-->[\s\S]*?<!--ENDIF:BANNERS-->/, (m) =>
    banners.length ? m : ""
  );

  const { counts, total } = await freshAvailableCounts();

  html = html
    .split("__BA_CONFIG__").join(cfgJson)
    .split("__FIREBASE_CFG__").join(cfgJson)
    .split("__CSRF_TOKEN__").join(esc(locals.csrfToken))
    .split("__SOCIAL_BAR__").join(socialBarHtml())
    .split("__SOCIAL_FAB_ITEMS__").join(fabItems)
    .split("__BG_OPTIONS_VAL__").join(bgOptions(true))
    .split("__BG_OPTIONS__").join(bgOptions(false))
    .split("__REQ_BG_CHIPS__").join(chips)
    .split("__MAP_PILLS__").join(mapPills)
    .split("__REQ_GROUP_BTNS__").join(reqGroupBtns)
    .split("__BGV__").join("")
    .split("__TOTAL_DONORS__").join(String(await db.donor.count().catch(() => 0)))
    .split("__TOTAL_AVAIL__").join(String(total))
    .split("__SIGNED_IN_STYLE__").join(locals.signedIn ? "display:flex;" : "display:none;")
    .split("__SIGNED_OUT_STYLE__").join(locals.signedIn ? "display:none;" : "")
    .split("__BRAND_TAGLINE__").join(esc(brandTagline))
    .split("__BRAND_SHORT__").join(esc(brandShort))
    .split("__BRAND__").join(esc(brand))
    .split("__LOGO__").join(esc(logo))
    .split("__SITE_URL__").join(esc(siteUrl))
    .split("__ORG_NAME__").join(esc(orgName))
    .split("__CONTACT_PHONE__").join(esc(contactPhone))
    .split("__COLOR_THEME__").join(esc(colorTheme))
    .split("__YEAR__").join(year);

  for (const g of Object.keys(ID_MAP)) {
    html = html.split(`__QC_${ID_MAP[g]}__`).join(String(counts[ID_MAP[g]] ?? 0));
  }

  html = html.split("__BANNER_SLIDES__").join(bannerSlides);

  // Any unresolved placeholder -> empty (fail-soft, log once in dev)
  if (process.env.NODE_ENV !== "production" && /__[A-Z]/.test(html)) {
    console.warn("renderShell: unresolved placeholders:", html.match(/__[A-Z_0-9]+__/g));
  }
  return html;
}

/** Session bootstrap used on every page render. */
export function newSessionBootstrap() {
  return { csrfToken: crypto.randomBytes(32).toString("hex") };
}
