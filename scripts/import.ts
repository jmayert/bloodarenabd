/**
 * db:import — load production MySQL data into the new managed database.
 *
 * Usage:
 *   1. Create a schema-only baseline first:  npm run db:migrate   (prisma migrate deploy)
 *   2. Dump the OLD production DB (on the old host):
 *        mysqldump --single-transaction --no-create-info --complete-insert \
 *          --skip-triggers bloodare_org > prod-data.sql
 *   3. Import:  npm run db:import -- path/to/prod-data.sql
 *
 * The script disables FK checks during load (matching the legacy schema's
 * no-FK design), streams statement batches, and prints per-table row counts
 * for verification at the end.
 */
import { createInterface } from "readline";
import { createReadStream } from "fs";
import mysql from "mysql2/promise";

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
  const conn = await mysql.createConnection(url);
  await conn.query("SET FOREIGN_KEY_CHECKS=0");
  await conn.query("SET UNIQUE_CHECKS=0");
  await conn.query("SET sql_log_bin=0").catch(() => undefined);

  // Parse the dump: split statements on ';' at end-of-line, skipping comments
  const rl = createInterface({ input: createReadStream(sqlFile), crlfDelay: Infinity });
  let buffer = "";
  let stmts = 0;
  let inString = false;
  const batch: string[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    await conn.query(batch.join("\n"));
    stmts += batch.length;
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
    // Skip DDL (schema already exists via Prisma migrations)
    if (/^(CREATE|DROP|ALTER|LOCK|UNLOCK)\b/i.test(buffer + trimmed)) {
      if (trimmed.endsWith(";")) buffer = "";
      continue;
    }
    buffer += line + "\n";
    // count unescaped quotes to detect string boundaries
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === "\\" && inString) continue; // skip escaped char
      if (ch === "'" || ch === '"') inString = !inString;
    }
    if (!inString && trimmed.endsWith(";")) {
      batch.push(buffer);
      buffer = "";
      inString = false;
      if (batch.length >= 200) await flush();
    }
  }
  if (buffer.trim()) batch.push(buffer);
  await flush();
  await conn.query("SET FOREIGN_KEY_CHECKS=1");
  await conn.query("SET UNIQUE_CHECKS=1");

  console.log(`Executed ${stmts} statements.`);

  // Verification: row counts per table
  console.log("\nRow counts (target DB):");
  let total = 0;
  for (const t of TABLES) {
    try {
      const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
      const n = Number((rows as Array<{ n: number }>)[0].n);
      total += n;
      console.log(`  ${t.padEnd(24)} ${n}`);
    } catch {
      console.log(`  ${t.padEnd(24)} (table missing — run migrations first)`);
    }
  }
  console.log(`  ${"TOTAL".padEnd(24)} ${total}`);

  await conn.end();

  // Post-import fixes: recompute badge levels where stale (PHP parity helper)
  console.log("\nDone. Verify against source DB counts before cutover.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
