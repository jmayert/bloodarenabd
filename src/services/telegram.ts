import { config } from "../config";

// POST JSON helper supporting the legacy bot's self-signed TLS certificate.
// PHP disabled cert verification via TELEGRAM_BOT_INSECURE_TLS; we scope the
// same behavior to bot calls only (never global).

type PostResult = { status: number; text: string };

export async function postJson(
  url: string,
  body: unknown,
  opts: { insecureTls?: boolean; timeoutMs?: number } = {}
): Promise<PostResult | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);
  try {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    };
    if (opts.insecureTls) {
      // The bot relay uses a self-signed certificate (legacy TELEGRAM_BOT_INSECURE_TLS).
      // Node's GLOBAL fetch silently ignores the dispatcher option — must use
      // undici's own fetch for the custom Agent to take effect.
      const undici = require("undici");
      const agent = new undici.Agent({
        connect: { rejectUnauthorized: false },
      });
      const res = await undici.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
        dispatcher: agent,
      } as any);
      return { status: res.status, text: await res.text() };
    }
    const res = await fetch(url, init);
    return { status: res.status, text: await res.text() };
  } catch (err) {
    console.error("telegram postJson failed:", String(err).slice(0, 150));
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function telegramInsecure(): boolean {
  return process.env.TELEGRAM_BOT_INSECURE_TLS === "true";
}

export async function telegramSend(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<number> {
  if (!config.telegram.botUrl || !config.telegram.botSecret) return 0;
  const res = await postJson(
    `${config.telegram.botUrl.replace(/\/$/, "")}/${endpoint}`,
    { secret: config.telegram.botSecret, ...payload },
    { insecureTls: telegramInsecure(), timeoutMs: 10000 }
  );
  return res ? res.status : 0;
}
