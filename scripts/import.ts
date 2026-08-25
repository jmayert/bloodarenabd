/**
 * db:import — load production MySQL data into the new managed database.
 *
 * Usage:
 *   1. Schema already applied (prisma migrate deploy / db push).
 *   2. Dump the OLD production DB (on the old host):
 *        mysqldump --single-transaction --no-create-info --complete-insert \
 *          --skip-triggers bloodare_org > prod-data.sql
 *   3. Import:  npm run db:import -- path/to/prod-data.sql
 *
 * NOTE ON COLUMNS: the legacy PHP schema uses snake_case column names while
 * this Prisma-managed DB uses camelCase. INSERT statements are rewritten on
 * the fly (blood_group -> bloodGroup etc.) so legacy dumps drop in directly.
 *
 * The script disables FK checks during load and prints per-table row counts
 * for verification at the end.
 */
import { createInterface } from "readline";
import { createReadStream } from "fs";
import * as mysql from "mysql2/promise";

const TABLES = [
  "donors",
  "blood_requests",
  "request_documents",
  "contact_requests",
  "call_logs",
  "reports",
  "analytics_counters",
  "service_notifications",
  "admin_messages",
  "auth_users",
  "otp_verifications",
  "sms_otp",
  "donation_history",
  "code_redemptions",
  "online_visitors",
  "visitors",
  "fcm_tokens",
  "push_subscriptions",
  "device_tokens",
  "community_posts",
  "community_replies",
  "community_action_log",
];

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Rewrite an INSERT statement's column list from snake_case to camelCase. */
function translateInsert(stmt: string): string {
  const m = stmt.match(/^(\s*INSERT\s+(?:IGNORE\s+)?INTO\s+`?\w+`?\s*)\(([^)]+)\)(\s*VALUES[\s\S]*)$/i);
  if (!m) return stmt;
  const cols = m[2].split(",").map((c) => {
    const name = c.trim().replace(/`/g, "");
    return "`" + snakeToCamel(name) + "`";
  });
  // Prisma-created tables may not have every legacy column; unknown columns
  // will fail loudly — acceptable for verification purposes.
  return `${m[1]}(${cols.join(", ")})${m[3]}`;
}

async function main() {
  const sqlFile = process.argv[2];
  if (!sqlFile) {
    console.error("Usage: npm run db:import -- <dump.sql>");
    process.exit(2);
  }
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("DIRECT_DATABASE_URL / DATABASE_URL not set");
    process.exit(2);
  }
  // Strip query params that mysql2 does not understand
  const cleanUrl = url.replace(/\?.*$/, "");
  const conn = await mysql.createConnection({
    uri: cleanUrl,
    ssl: { rejectUnauthorized: false },
    multipleStatements: false,
  });
  await conn.query("SET FOREIGN_KEY_CHECKS=0");
  await conn.query("SET UNIQUE_CHECKS=0");

  const rl = createInterface({ input: createReadStream(sqlFile), crlfDelay: Infinity });
  let buffer = "";
  let stmts = 0;
  let skipped = 0;
  let inString = false;
  const batch: string[] = [];
  const flush = async () => {
    for (const s of batch) {
      try {
        await conn.query(s);
        stmts++;
      } catch (err) {
        skipped++;
        console.error(`  ! statement failed (${(err as Error).message.slice(0, 100)})`);
      }
    }
    batch.length = 0;
  };

  for await (const line of rl) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("--") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("#") ||
      trimmed === ""
    ) {
      continue;
    }
    buffer += line + "\n";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === "\\" && inString) continue;
      if (ch === "'" || ch === '"') inString = !inString;
    }
    if (!inString && trimmed.endsWith(";")) {
      const stmt = buffer.trim();
      buffer = "";
      inString = false;
      // Skip DDL/locking — schema already exists via Prisma
      if (/^(CREATE|DROP|ALTER|LOCK|UNLOCK|SET)\b/i.test(stmt)) continue;
      batch.push(translateInsert(stmt));
      if (batch.length >= 200) await flush();
    }
  }
  if (buffer.trim() && !/^(CREATE|DROP|ALTER|LOCK|UNLOCK|SET)\b/i.test(buffer.trim())) {
    batch.push(translateInsert(buffer.trim()));
  }
  await flush();
  await conn.query("SET FOREIGN_KEY_CHECKS=1");
  await conn.query("SET UNIQUE_CHECKS=1");

  console.log(`\nExecuted ${stmts} statements${skipped ? `, ${skipped} failed` : ""}.`);

  console.log("\nRow counts (target DB):");
  let total = 0;
  for (const t of TABLES) {
    try {
      const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
      const n = Number((rows as Array<{ n: number }>)[0].n);
      total += n;
      console.log(`  ${t.padEnd(24)} ${n}`);
    } catch {
      console.log(`  ${t.padEnd(24)} (missing)`);
    }
  }
  console.log(`  ${"TOTAL".padEnd(24)} ${total}`);

  await conn.end();
  console.log("\nVerify against source DB counts before cutover.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
