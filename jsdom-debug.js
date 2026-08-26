/* Runtime JS debugger: loads the live page in jsdom, executes all scripts,
 * reports every uncaught error + which script it came from. */
const { JSDOM, VirtualConsole } = require("jsdom");

const url = process.argv[2] || "https://ba-build.vercel.app/";
const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (err) => {
  errors.push({ type: "jsdomError", detail: String(err.detail?.stack || err.stack || err.message || err).slice(0, 500) });
});
vc.on("error", (...a) => errors.push({ type: "console.error", detail: a.map(String).join(" ").slice(0, 300) }));

(async () => {
  const dom = await JSDOM.fromURL(url, {
    resources: "usable",
    runScripts: "dangerously",
    virtualConsole: vc,
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.addEventListener("error", (e) => {
    errors.push({ type: "window.onerror", detail: (e.message || "") + " @ " + (e.filename || "?") + ":" + (e.lineno || "?") });
  });

  // let scripts settle
  await new Promise((r) => setTimeout(r, 12000));

  const checks = {
    hasBA_CONFIG: typeof w.BA_CONFIG !== "undefined",
    csrfToken: typeof w.BA_CONFIG !== "undefined" ? String(w.BA_CONFIG.csrfToken).slice(0, 8) : "-",
    firebaseConfigured: typeof w.firebase !== "undefined",
    hasJQueryLike$: false,
    appSwitchPage: typeof w.appSwitchPage === "function",
    fetchFilteredData: typeof w.fetchFilteredData === "function",
    prepCall: typeof w.prepCall === "function",
    loadAnalytics: typeof w.loadAnalytics === "function",
    authGoogleSignIn: typeof w.authGoogleSignIn === "function",
    quickFilter: typeof w.quickFilter === "function",
    openDonorDetail: typeof w.openDonorDetail === "function",
    registerFormSubmitBound: !!w.document.querySelector('#page-register form') ,
    pages: w.document.querySelectorAll(".app-page").length,
    donorTableRows: w.document.querySelectorAll("#donorsTableBody tr, #donorTable tr").length,
  };
  console.log(JSON.stringify(checks, null, 2));
  console.log("\n=== ERRORS (" + errors.length + ") ===");
  const seen = new Set();
  for (const e of errors) {
    const key = e.detail.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`[${e.type}] ${e.detail}\n`);
  }
  process.exit(0);
})().catch((e) => {
  console.error("HARNESS FAIL:", e.message);
  process.exit(1);
});
