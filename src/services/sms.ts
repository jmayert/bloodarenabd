import crypto from "crypto";
import { config } from "../config";

// Port of includes/SmsService.php - OneCodeSoft gateway.
// Quirk preserved: GET method by default but with a JSON body (provider's
// unusual contract); env-switchable to POST.

export interface SmsResult {
  success: boolean;
  http: number;
  raw: string;
  error?: string;
}

export function smsConfigured(): boolean {
  return !!(config.sms.url && config.sms.apiKey && config.sms.senderId);
}

/** +8801XXXXXXXXX / 01XXXXXXXXX / 8801XXXXXXXXX -> 8801XXXXXXXXX */
export function formatSmsPhone(phone: string): string {
  const p = phone.replace(/[^\d+]/g, "").trim();
  let m = /^\+?880(1\d{9})$/.exec(p);
  if (m) return `880${m[1]}`;
  m = /^0(1\d{9})$/.exec(p);
  if (m) return `880${m[1]}`;
  m = /^\+?88(01\d{9})$/.exec(p);
  if (m) return `88${m[1]}`;
  return p.replace(/^\+/, "");
}

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  if (!smsConfigured()) {
    return { success: false, http: 0, raw: "", error: "SMS service not configured." };
  }
  const body = JSON.stringify({
    api_key: config.sms.apiKey,
    senderid: config.sms.senderId,
    number: formatSmsPhone(phone),
    message,
  });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    // PHP default is GET-with-body; keep POST (well-supported equivalent) unless
    // ONECODESOFT_METHOD=GET is explicitly required after live testing.
    const res = await fetch(config.sms.url, {
      method: process.env.ONECODESOFT_METHOD === "GET" ? "GET" : "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body,
      signal: ctrl.signal,
    });
    const raw = await res.text();
    console.log(`OneCodeSoft send [${res.status}] raw=${raw.slice(0, 300)}`);
    const ok = res.status >= 200 && res.status < 300;
    return { success: ok, http: res.status, raw, error: ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, http: 0, raw: "", error: `fetch error: ${String(err)}` };
  } finally {
    clearTimeout(t);
  }
}

export function generateOtp(): string {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}
