#!/usr/bin/env node
/* Adds a Vercel env var to Preview, answering the interactive Git-branch
 * prompt ("Leave empty to apply to all Preview branches") via pty-less stdin.
 * Usage: node vercel-add-preview.cjs NAME VALUE [sensitive] */
const { spawn } = require("child_process");

const [name, value, sensitive] = process.argv.slice(2);
if (!name || value === undefined) {
  console.error("usage: node vercel-add-preview.cjs NAME VALUE [y|n]");
  process.exit(2);
}

const child = spawn("vercel", ["env", "add", name, "preview"], {
  cwd: "/root/ba-build",
  stdio: ["pipe", "pipe", "pipe"],
});

let out = "";
const feed = (chunk) => {
  out += chunk.toString();
  if (/Git branch\?/i.test(out)) {
    child.stdin.write("\n"); // empty = apply to all preview branches
  } else if (/Store as sensitive\?/i.test(out)) {
    child.stdin.write((sensitive === "y" ? "y" : "n") + "\n");
  }
};
child.stdout.on("data", feed);
child.stderr.on("data", feed);

// initial value
setTimeout(() => {
  try { child.stdin.write(value + "\n"); } catch {}
}, 1500);

const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 90000);
child.on("exit", (code) => {
  clearTimeout(timer);
  const clean = out.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\r/g, "\n");
  const ok = /Added/i.test(clean) || /already exists/i.test(clean);
  console.log(`${name}: ${ok ? "OK" : "FAIL"} :: ${(clean.match(/(✓ Added[^\n]*|already exists[^\n]*|Error[^\n]*)/) || ["no-match"])[0].trim()}`);
  process.exit(ok ? 0 : 1);
});
