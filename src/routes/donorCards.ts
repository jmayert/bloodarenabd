// Ported verbatim from includes/backend.php ajax_filter HTML rendering
// (lines ~2439-2600). Produces identical desktop rows / mobile cards /
// pagination markup so the existing vanilla-JS frontend renders unchanged.

import { getLiveStatus, getBadgeInfo } from "../services/donorAvailability";

export interface DonorRow {
  id: number;
  name: string;
  blood_group: string;
  location: string;
  last_donation: string | null;
  willing_to_donate: string | null;
  total_donations: number | null;
  badge_level: string | null;
  created_at: Date | null;
  hide_me?: number | boolean;
  allow_call?: number | boolean;
}

/** htmlspecialchars() equivalent */
export function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function displayDate(d: string | Date | null | undefined, fallback: string): string {
  if (!d) return fallback;
  const date = d instanceof Date ? d : new Date(String(d).replace(" ", "T"));
  if (isNaN(date.getTime()) || date.getUTCFullYear() < 1971) return fallback;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dd = String(date.getDate()).padStart(2, "0");
  return `${dd} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function renderDonorList(
  rows: DonorRow[],
  opts: { start: number; page: number; limit: number; totalRecords: number }
): { table: string; cards: string; pagination: string } {
  let output = "";
  let cards = "";
  let serial = opts.start + 1;

  for (const row of rows) {
    const lastVal = row.last_donation ?? "";
    const willingVal = row.willing_to_donate ?? "yes";
    const currentStatus = getLiveStatus(lastVal, willingVal);
    const dbBadge = row.badge_level ?? "";
    const donorBadge =
      dbBadge === "Legend" ? getBadgeInfo(10) :
      dbBadge === "Hero" ? getBadgeInfo(5) :
      dbBadge === "Active" ? getBadgeInfo(2) :
      getBadgeInfo(0);

    const displayLast =
      lastVal === "no" || !lastVal || lastVal === "0000-00-00"
        ? "Never donated"
        : displayDate(lastVal, "Never donated");
    const displaySince = displayDate(row.created_at, "—");
    const totalDon = row.total_donations ?? 0;

    let stClass = "", stIcon = "", stText = "";
    if (currentStatus === "Available") { stClass = "available"; stIcon = "✔"; stText = "Available"; }
    else if (currentStatus === "Unavailable") { stClass = "unavailable"; stIcon = "⛔"; stText = "Not Willing"; }
    else { stClass = "notavailable"; stIcon = "✖"; stText = "Not Available"; }

    const bgClass =
      "bg" + row.blood_group.replace(/[^a-zA-Z]/g, "") +
      (row.blood_group.includes("+") ? "pos" : "neg");
    const sn = serial++;

    const isAvailable = currentStatus === "Available";
    const allowCallRow = Number(row.allow_call ?? true);
    const hideMeRow = Number(row.hide_me ?? false);

    let locData: string;
    if (hideMeRow) {
      const lp = String(row.location ?? "").split(",").map((p) => p.trim()).filter((p) => p !== "");
      const locArea = lp.length >= 2 ? lp[lp.length - 1] : "";
      locData = locArea !== "" ? `Location Hidden · ${locArea}` : "Location Hidden";
    } else {
      locData = String(row.location ?? "");
    }
    const locHidStyle = hideMeRow ? "color:#6366f1;" : "";

    let callBtnDesktop: string, callBtnMobile: string;
    if (!isAvailable) {
      callBtnDesktop = `<button class='phone-link-disabled' disabled title='দাতা এখন Available নেই'>🚫 Unavailable</button>`;
      callBtnMobile = `<button class='dc-call-btn-disabled' disabled title='দাতা এখন Available নেই' aria-label='Not available'>🚫</button>`;
    } else if (allowCallRow === 0) {
      callBtnDesktop = `<button class='phone-link request-link' onclick="prepRequest('${row.id}')">✉️ Request</button>`;
      callBtnMobile = `<button class='dc-call-btn dc-req-btn unselectable' onclick="prepRequest('${row.id}')" oncontextmenu='return false;' aria-label='Request donor'>✉️</button>`;
    } else {
      callBtnDesktop = `<button class='phone-link' onclick="prepCall('${row.id}')">📞 Call</button>`;
      callBtnMobile = `<button class='dc-call-btn unselectable' onclick="prepCall('${row.id}')" oncontextmenu='return false;' aria-label='Call donor'>📞</button>`;
    }

    output += `<tr>
            <td><span class='serial-num'>${sn}</span></td>
            <td style='text-align:left; font-weight:600;'>${esc(row.name)} <span style='font-size:0.85em;opacity:0.85;' title='${donorBadge.level} Donor'>${donorBadge.icon}</span></td>
            <td><span class='blood-badge ${bgClass}'>${esc(row.blood_group)}</span></td>
            <td><span class='${stClass}'>${stIcon} ${stText}</span></td>
            <td style='text-align:left; color:var(--text-muted); font-size:0.88em; ${locHidStyle}'>📍 ${esc(locData)}</td>
            <td style='color:var(--text-muted); font-size:0.88em;'>🗓 ${esc(displayLast)}</td>
            <td class='unselectable' oncontextmenu='return false;' oncopy='return false;'>
                ${callBtnDesktop}
            </td>
        </tr>`;

    const dcData =
      `data-id='${esc(String(row.id))}'` +
      ` data-name='${esc(row.name)}'` +
      ` data-group='${esc(row.blood_group)}'` +
      ` data-bgclass='${esc(bgClass)}'` +
      ` data-status='${esc(stText)}'` +
      ` data-stclass='${esc(stClass)}'` +
      ` data-sticon='${esc(stIcon)}'` +
      ` data-loc='${esc(locData)}'` +
      ` data-last='${esc(displayLast)}'` +
      ` data-since='${esc(displaySince)}'` +
      ` data-total='${totalDon}'` +
      ` data-badge='${esc(donorBadge.level)}'` +
      ` data-badgeicon='${esc(donorBadge.icon)}'` +
      ` data-available='${isAvailable ? "1" : "0"}'` +
      ` data-hide='${hideMeRow}'` +
      ` data-allowcall='${allowCallRow}'`;

    cards += `
        <div class='dc' ${dcData}>
            <div class='dc-badge-wrap' onclick='openDonorDetail(this.parentNode)'>
                <span class='dc-sn'>${sn}</span>
                <span class='dc-badge ${bgClass}'>${esc(row.blood_group)}</span>
            </div>
            <div class='dc-info' onclick='openDonorDetail(this.parentNode)'>
                <div class='dc-name'>${esc(row.name)} <span style='font-size:0.85em;opacity:0.85;' title='${donorBadge.level} Donor'>${donorBadge.icon}</span></div>
                <span class='${stClass} dc-status-badge'>${stIcon} ${stText}</span>
                <div class='dc-loc' style='${locHidStyle}'>📍 ${esc(locData)}</div>
                <div class='dc-last'>🗓 ${displayLast}</div>
            </div>
            ${callBtnMobile}
        </div>`;
  }

  if (rows.length === 0) {
    output = `<tr><td colspan='7' class='no-data'>✖ কোনো রক্তদাতা পাওয়া যায়নি।</td></tr>`;
    cards = `<div class='no-data' style='text-align:center;padding:30px;'>✖ কোনো রক্তদাতা পাওয়া যায়নি।</div>`;
  }

  const totalPages = Math.ceil(opts.totalRecords / opts.limit);
  let pagHtml = '<div class="pagination">';
  pagHtml += '<div class="pag-info-row">';
  pagHtml += '<span class="pag-per-page">প্রতি পাতায়: <select class="pag-per-page-select" onchange="changeDonorsPerPage(this.value)">';
  const pagOpts: Array<[number, string]> = [[20, "২০"], [50, "৫০"], [100, "১০০"]];
  for (const [val, label] of pagOpts) {
    const sel = val === opts.limit ? " selected" : "";
    pagHtml += `<option value="${val}"${sel}>${label}</option>`;
  }
  pagHtml += "</select></span>";
  pagHtml += `<span class="pag-total">মোট ${opts.totalRecords.toLocaleString("en-US")} জন Donor</span>`;
  pagHtml += "</div>";
  pagHtml += '<div class="pag-buttons">';
  if (opts.page > 1) pagHtml += `<a href="#" onclick="fetchFilteredData(${opts.page - 1},true); return false;">Previous</a>`;
  for (let i = 1; i <= totalPages; i++) {
    const active = i === opts.page ? ' class="active-page"' : "";
    pagHtml += `<a href="#" onclick="fetchFilteredData(${i},true); return false;"${active}>${i}</a>`;
  }
  if (opts.page < totalPages) pagHtml += `<a href="#" onclick="fetchFilteredData(${opts.page + 1},true); return false;">Next</a>`;
  pagHtml += "</div>";
  pagHtml += "</div>";

  return { table: output, cards, pagination: pagHtml };
}
