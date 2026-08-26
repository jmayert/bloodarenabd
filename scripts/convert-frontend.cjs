#!/usr/bin/env node
/* One-time frontend converter: partials/*.php + assets/*.php -> static shell
 * template + real asset files. Outputs are committed artifacts; re-run only
 * when the PHP frontend changes. Run from app/: node scripts/convert-frontend.cjs */
const fs = require("fs");
const path = require("path");

const ROOT = process.env.FRONTEND_ROOT || path.resolve(__dirname, "..", ".."); // public_html
const APP = path.resolve(__dirname, "..");
const OUT_STATIC = path.join(APP, "public", "static");
const OUT_VIEWS = path.join(APP, "src", "views");
fs.mkdirSync(OUT_STATIC, { recursive: true });
fs.mkdirSync(OUT_VIEWS, { recursive: true });
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
function fatal(msg) {
  console.error("FATAL: " + msg);
  process.exit(1);
}

// ---------- 1. Static assets ----------
// Strip any PHP blocks (header comments etc.) — files are served as real JS.
function stripPhp(s, label) {
  const out = s.replace(/<\?php[\s\S]*?\?>/g, "").replace(/<\?=[\s\S]*?\?>/g, "");
  if (/<\?/.test(out)) fatal("unresolved PHP in " + label);
  return out;
}
for (const [src, out] of [
  ["assets/boot.js.php", "boot.js"],
  ["assets/fx-3d.js.php", "fx-3d.js"],
  ["assets/i18n-dict.js.php", "i18n-dict.js"],
  ["assets/i18n-engine.js.php", "i18n-engine.js"],
  ["assets/net-lite.js.php", "net-lite.js"],
]) {
  fs.writeFileSync(path.join(OUT_STATIC, out), stripPhp(read(src), out));
}

// styles.css: bake brand colors from env at build time (documented deviation)
let css = read("assets/styles.css.php");
css = css
  .replace(/<\?= COLOR_BG_MAIN \?>/, process.env.COLOR_BG_MAIN || "#f5f6fa")
  .replace(/<\?= COLOR_PRIMARY \?>/, process.env.COLOR_PRIMARY || "#c0392b")
  .replace(/<\?= COLOR_PRIMARY_HOVER \?>/, process.env.COLOR_PRIMARY_HOVER || "#a93226");
if (/<\?=|<\?php/.test(css)) fatal("unresolved PHP in styles.css");
fs.writeFileSync(path.join(OUT_STATIC, "styles.css"), css);

// head-init.js: Firebase config + VAPID key come from window.BA_CONFIG.firebase
let headInit = read("assets/head-init.js.php");
headInit = headInit.replace(/"<\?= FIREBASE\['(\w+)'\] \?>"/g, '(window.BA_CONFIG.firebase["$1"] || "")');
headInit = headInit.replace(/"<\?= SITE_URL \?>"/g, '(window.BA_CONFIG.siteUrl || "")');
headInit = stripPhp(headInit, "head-init.js");
fs.writeFileSync(path.join(OUT_STATIC, "head-init.js"), headInit);

// app.js: CSRF token + auth state from window.BA_CONFIG
let appJs = read("assets/app.js.php");
appJs = appJs.replace(
  /const CSRF_TOKEN = '<\?php[\s\S]*?';/,
  "const CSRF_TOKEN = (window.BA_CONFIG && window.BA_CONFIG.csrfToken) || '';"
);
appJs = appJs.replace(
  /const BA_AUTH = <\?php[\s\S]*?\?>;/,
  "const BA_AUTH = (window.BA_CONFIG && window.BA_CONFIG.auth) || null;"
);
if (/<\?=|<\?php/.test(appJs)) fatal("unresolved PHP remains in app.js");
fs.writeFileSync(path.join(OUT_STATIC, "app.js"), appJs);

// ---------- 2. Analytics inner block extraction ----------
const bodySrc = read("partials/body.php");
const analyticsMatch = bodySrc.match(/echo <<<HTML([\s\S]*?)^\s*HTML;\s*$/m);
if (!analyticsMatch) fatal("could not extract analytics heredoc");
const ANALYTICS_INNER = analyticsMatch[1];

// ---------- 3. body.php -> shell template ----------
let b = bodySrc;

// Drop leading function-definitions PHP block (through first standalone `?>`)
b = b.replace(/^[\s\S]*?^\?>\s*$/m, "");

// Banner slider region -> conditional marker + slides placeholder
b = b.replace(/<\?php\n\/\* ══ IMAGE BANNER SLIDER[\s\S]*?\?>\n/, "");
b = b.replace(/<\?php if \(!empty\(\$__banners\)\): \?>/, "<!--IF:BANNERS-->");
b = b.replace(
  /<\?php foreach \(\$__banners as \$__i => \$__bImg\): \?>[\s\S]*?<\?php endforeach; \?>/,
  "__BANNER_SLIDES__"
);
b = b.replace(
  /<\?php foreach \(\$__banners as \$__i => \$__bImg\): \?>[\s\S]*?<\?php endforeach; \?>/,
  "__BANNER_SLIDES__"
);
b = b.replace(/<\?php endif; \?>/, "<!--ENDIF:BANNERS-->");

// Quick-filter stat cards loop -> static expansion
const ID_MAP = {
  "A+": "Aplus", "A-": "Aminus", "B+": "Bplus", "B-": "Bminus",
  "AB+": "ABplus", "AB-": "ABminus", "O+": "Oplus", "O-": "Ominus",
};
const statCards = Object.keys(ID_MAP).map((g) => {
  const id = ID_MAP[g];
  return `<div class='stat-card blood-${id}' role='button' tabindex='0' onclick="appSwitchPage('donors'); quickFilter('${g}');">
                <span class='sc-drop' aria-hidden='true'>🩸</span>
                <span class='sc-dot' aria-hidden='true'></span>
                <h4>${g}</h4>
                <div class='count' id='count-${id}'>🩸 __QC_${id}__ Available</div>
                <span class='stat-tap-hint'>👆 তালিকা দেখুন</span>
                <span class='sc-go' aria-hidden='true'>তালিকা দেখুন →</span>
              </div>`;
}).join("\n    ");
b = b.replace(/<\?php\s*\n\s*\$__id_map[\s\S]*?\?>\n/m, statCards + "\n");

// Hero counters
b = b.replace(/<\?php echo \$total_donors_count; \?>/, "__TOTAL_DONORS__");
b = b.replace(/<\?php echo array_sum\(\$avail_counts\); \?>/, "__TOTAL_AVAIL__");

// Analytics inner blocks
b = b.split("<?php render_analytics_inner(); ?>").join(ANALYTICS_INNER);

// Social bar calls
b = b.split("<?php render_social_bar(); ?>").join("__SOCIAL_BAR__");

// Social FAB loop
b = b.replace(
  /<\?php foreach \(social_links_array\(\) as \$s\): \?>[\s\S]*?<\?php endforeach; \?>/,
  "__SOCIAL_FAB_ITEMS__"
);

// CSRF hidden inputs
b = b.split("<?php echo $_SESSION['csrf_token'] ?? ''; ?>").join("__CSRF_TOKEN__");

// Signed-in ternaries
b = b.replace(/<\?php \$__signedIn = !empty\(\$_SESSION\['auth_uid'\]\); \?>\n?/g, "");
b = b.replace(
  /style="<\?= \$__signedIn \? 'display:flex;' : 'display:none;' \?>/g,
  'style="__SIGNED_IN_STYLE__'
);
b = b.replace(
  /style="<\?= \$__signedIn \? 'display:none;' : '' \?>/g,
  'style="__SIGNED_OUT_STYLE__"'
);

// Request-page bg chips loop (lines ~818)
b = b.replace(
  /<\?php foreach\(\["A\+","A-","B\+","B-","AB\+","AB-","O\+","O-"\] as \$g\): \?>[\s\S]*?<\?php endforeach; \?>/,
  "__REQ_BG_CHIPS__"
);

// Blood-group option variants
b = splitExact(
  b,
  `<?php foreach(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as $g){ echo "<option value='$g'>$g</option>"; } ?>`,
  "__BG_OPTIONS_VAL__"
);
b = splitExact(
  b,
  `<?php foreach(["A+","A-","B+","B-","AB+","AB-","O+","O-"] as $g) echo "<option>$g</option>"; ?>`,
  "__BG_OPTIONS__"
);
b = splitExact(
  b,
  `<?php foreach(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as $g) echo "<option>$g</option>"; ?>`,
  "__BG_OPTIONS__"
);

// Map filter pills loop
b = b.replace(
  /<\?php foreach\(\["A\+","A-","B\+","B-","AB\+","AB-","O\+","O-"\] as \$g\): \?>[\s\S]*?<\?php endforeach; \?>/,
  "__MAP_PILLS__"
);

// Emergency request group buttons loop (multiline attrs)
b = b.replace(
  /<\?php foreach\(\["A\+","A-","B\+","B-","AB\+","AB-","O\+","O-"\] as \$g\): \?>[\s\S]*?<\?php endforeach; \?>/,
  "__REQ_GROUP_BTNS__"
);

// Brand / config constants (short echo)
b = b.replace(/<\?= htmlspecialchars\(BRAND_NAME\) \?>/g, "__BRAND__");
b = b.replace(/<\?= htmlspecialchars\(BRAND_SHORT\) \?>/g, "__BRAND_SHORT__");
b = b.replace(/<\?= htmlspecialchars\(BRAND_TAGLINE\) \?>/g, "__BRAND_TAGLINE__");
b = b.replace(/<\?= htmlspecialchars\(LOGO_PATH\) \?>/g, "__LOGO__");
b = b.split('<?= htmlspecialchars($s[\'url\']) ?>').join("__SOCIAL_URLS__");
b = b.replace(/<\?= \$g \?>/g, "__BGV__");
b = b.replace(/<\?php echo \$g; \?>/g, "__BGV__");

// Year stamps
b = b.split('<?php echo date("Y"); ?>').join("__YEAR__");
b = b.split('<?php /* Blood Arena — index_part2.php */ ?>').join("");

// Bottom script includes -> external static files
b = splitExact(
  b,
  `<script><?php include __DIR__ . '/../assets/boot.js.php'; ?></script>`,
  `<script src="/static/boot.js" defer></script>`
);
b = splitExact(
  b,
  `<script><?php include __DIR__ . '/../assets/app.js.php'; ?></script>`,
  `<script src="/static/app.js"></script>`
);
b = splitExact(
  b,
  `<script><?php include __DIR__ . '/../assets/fx-3d.js.php'; ?></script>`,
  `<script src="/static/fx-3d.js" defer></script>`
);
b = splitExact(
  b,
  `<script><?php include __DIR__ . '/../assets/i18n-dict.js.php'; ?></script>`,
  `<script src="/static/i18n-dict.js"></script>`
);
b = splitExact(
  b,
  `<script><?php include __DIR__ . '/../assets/net-lite.js.php'; ?></script>`,
  `<script src="/static/net-lite.js"></script>`
);

function splitExact(str, needle, replacement) {
  return str.split(needle).join(replacement);
}

// ---------- 4. head.php -> head template ----------
let h = read("partials/head.php");
h = h.replace(/<\?= COLOR_THEME \?>/g, "__COLOR_THEME__");
h = h.replace(/<\?= BRAND_NAME \?>/g, "__BRAND__");
h = h.replace(/<\?= SITE_URL \?>/g, "__SITE_URL__");
h = h.replace(/<\?= ORG_NAME \?>/g, "__ORG_NAME__");
h = h.replace(/<\?= CONTACT_PHONE \?>/g, "__CONTACT_PHONE__");
h = splitExact(h, `<style><?php include __DIR__ . '/../assets/styles.css.php'; ?></style>`, `<link rel="stylesheet" href="/static/styles.css">`);
h = splitExact(h, `<script><?php include __DIR__ . '/../assets/head-init.js.php'; ?></script>`, `<script>window.BA_CONFIG=__BA_CONFIG__;</script>\n<script src="/static/head-init.js"></script>`);

// ---------- 5. Assemble full shell ----------
const shell = `<!DOCTYPE html>
<html lang="en">
${h}
<body>
${b}
</body></html>
`;

// Sanity: no PHP may remain
const leftover = shell.match(/<\?(?:php|=)?[\s\S]{0,80}/g);
if (leftover) {
  fatal(`${leftover.length} unresolved PHP fragments:\n` + leftover.slice(0, 10).join("\n---\n"));
}

fs.writeFileSync(path.join(OUT_VIEWS, "shell.template.html"), shell);
console.log("OK: wrote public/static/* and src/views/shell.template.html");
