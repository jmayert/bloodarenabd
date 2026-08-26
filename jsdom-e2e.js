/* Full client-pipeline test: real fetch (with cookies) inside jsdom,
 * triggers the donor list fetch, checks DOM rendering. */
const { JSDOM, VirtualConsole, CookieJar } = require("jsdom");

const BASE = "https://ba-build.vercel.app";
const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (err) => errors.push(String(err.detail?.message || err.message || err).slice(0, 200)));

(async () => {
  const jar = new CookieJar();
  const dom = await JSDOM.fromURL(BASE + "/", {
    resources: "usable",
    runScripts: "dangerously",
    virtualConsole: vc,
    pretendToBeVisual: true,
    cookieJar: jar,
  });
  const w = dom.window;
  await new Promise((r) => setTimeout(r, 10000));

  // Polyfill fetch bound to the jsdom cookie jar
  const { fetch: undiciFetch } = require("undici");
  w.fetch = async (input, init = {}) => {
    const u = typeof input === "string" ? new URL(input, BASE).href : input.href || String(input);
    const cookie = jar.getCookieStringSync(BASE);
    const headers = new (require("undici").Headers)(init.headers || {});
    if (cookie) headers.set("cookie", cookie);
    const res = await undiciFetch(u, { ...init, headers, redirect: "manual" });
    const setc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of setc) {
      try { jar.setCookieSync(c.split(";")[0], BASE); } catch {}
    }
    return res;
  };

  console.log("csrf:", String(w.BA_CONFIG?.csrfToken).slice(0, 8));
  console.log("globals:", ["appSwitchPage","fetchFilteredData","loadAnalytics"].map(f=>f+"="+typeof w[f]).join(", "));

  // Trigger donor list like the UI does
  try {
    await w.fetchFilteredData(1, false);
  } catch (e) {
    console.log("fetchFilteredData threw:", e.message);
  }
  await new Promise((r) => setTimeout(r, 6000));

  // Inspect donor list containers (find actual IDs from app.js)
  const html = w.document.body.innerHTML;
  const candidates = ["donorsTable", "donorTableBody", "donorCards", "donorsList", "tableBody"];
  let found = {};
  for (const c of candidates) found[c] = !!w.document.getElementById(c);
  console.log("containers:", JSON.stringify(found));
  // count any rendered donor card/row markers
  console.log("dc cards:", w.document.querySelectorAll(".dc").length);
  console.log("serial-num cells:", w.document.querySelectorAll(".serial-num").length);
  console.log("blood-badge spans:", w.document.querySelectorAll(".blood-badge").length);
  const noData = w.document.body.textContent.includes("রক্তদাতা পাওয়া যায়নি");
  console.log("shows no-donor message:", noData);

  // Check analytics numbers rendered
  const kpi = w.document.querySelector('[data-an="kpiTotal"]');
  console.log("kpiTotal text:", kpi ? kpi.textContent : "(missing)");

  console.log("\n=== RUNTIME ERRORS ===");
  const seen = new Set();
  for (const e of errors) {
    if (seen.has(e.slice(0, 80))) continue;
    seen.add(e.slice(0, 80));
    console.log("-", e);
  }
  process.exit(0);
})().catch((e) => { console.error("HARNESS FAIL:", e.stack); process.exit(1); });
