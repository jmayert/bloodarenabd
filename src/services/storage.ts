import crypto from "crypto";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";

// Document storage backends:
//  1. VM storage (default when VM_SSH_HOST is set): files are written to the
//     user's own server over SFTP and served token-guarded through the API
//     (?req_doc=<token>) — same privacy model as the original PHP app.
//  2. Vercel Blob (when BLOB_READ_WRITE_TOKEN is set): previous default.
//  3. Local disk fallback for development.
//
// Documents are re-encoded to normalized JPEG (PHP parity): long edge
// <=1600px, ~<=500KB target; max 2 documents per request.

const MAX_DOCS = 2;
const LONG_EDGE = 1600;
const TARGET_BYTES = 500 * 1024;

function vmConfig() {
  return {
    host: process.env.VM_SSH_HOST || "",
    port: parseInt(process.env.VM_SSH_PORT || "22", 10),
    username: process.env.VM_SSH_USER || "",
    password: process.env.VM_SSH_PASS || "",
    dir: process.env.VM_DOC_DIR || "/home/siam/bloodarena-docs",
  };
}

export function useVmStorage(): boolean {
  const v = vmConfig();
  return !!(v.host && v.username);
}

function localDir(): string {
  return path.resolve(__dirname, "../../storage/req_docs");
}

async function normalizeToJpeg(buf: Buffer): Promise<Buffer> {
  let img = sharp(buf, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  if ((meta.width ?? 0) > LONG_EDGE || (meta.height ?? 0) > LONG_EDGE) {
    img = img.resize({ width: LONG_EDGE, height: LONG_EDGE, fit: "inside" });
  }
  let quality = 82;
  let out = await img.jpeg({ quality, mozjpeg: true }).toBuffer();
  // Degrade quality until under target (matches PHP's iterative compression)
  while (out.length > TARGET_BYTES && quality > 30) {
    quality -= 12;
    out = await sharp(buf, { failOn: "none" })
      .rotate()
      .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: "inside", withoutEnlargement: false })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }
  return out;
}

async function sftpConnect() {
  const SftpClient = require("ssh2-sftp-client");
  const v = vmConfig();
  const sftp = new SftpClient();
  await sftp.connect({
    host: v.host,
    port: v.port,
    username: v.username,
    password: v.password,
    readyTimeout: 15000,
  });
  return sftp;
}

async function saveRequestDocuments(
  tx: Prisma.TransactionClient,
  requestId: number,
  files: Express.Multer.File[]
): Promise<void> {
  for (const file of files.slice(0, MAX_DOCS)) {
    const jpeg = await normalizeToJpeg(file.buffer);
    const token = crypto.randomBytes(32).toString("hex");
    const name = `req_${requestId}_${token}.jpg`;

    if (useVmStorage()) {
      const sftp = await sftpConnect();
      try {
        await sftp.put(jpeg, `${vmConfig().dir}/${name}`);
      } finally {
        await sftp.end();
      }
    } else if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import("@vercel/blob");
      await put(name, jpeg, {
        access: "public",
        addRandomSuffix: false,
        contentType: "image/jpeg",
      });
    } else {
      await fs.mkdir(localDir(), { recursive: true });
      await fs.writeFile(path.join(localDir(), name), jpeg);
    }

    await tx.requestDocument.create({
      data: {
        requestId,
        filePath: name,
        token,
        mime: "image/jpeg",
        bytes: jpeg.length,
      },
    });
  }
}

/** Read a document by token (for ?req_doc= serving). */
async function readRequestDocument(
  token: string
): Promise<{ buffer: Buffer } | null> {
  const doc = await (await import("../db")).db.requestDocument.findUnique({
    where: { token },
  });
  if (!doc) return null;

  if (useVmStorage()) {
    try {
      const sftp = await sftpConnect();
      try {
        const buf = await sftp.get(`${vmConfig().dir}/${path.basename(doc.filePath)}`);
        return { buffer: buf as Buffer };
      } finally {
        await sftp.end();
      }
    } catch (err) {
      console.error("vm doc read failed", err);
      return null;
    }
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { head } = await import("@vercel/blob");
      const meta = await head(doc.filePath);
      const res = await fetch(meta.downloadUrl ?? meta.url);
      if (!res.ok) return null;
      return { buffer: Buffer.from(await res.arrayBuffer()) };
    } catch {
      return null;
    }
  }

  try {
    const p = path.join(localDir(), path.basename(doc.filePath));
    return { buffer: await fs.readFile(p) };
  } catch {
    return null;
  }
}

/** Remove a stored document (cron cleanup). */
async function removeDocument(filePath: string): Promise<void> {
  const name = path.basename(filePath);
  if (useVmStorage()) {
    try {
      const sftp = await sftpConnect();
      try {
        await sftp.delete(`${vmConfig().dir}/${name}`, false);
      } finally {
        await sftp.end();
      }
    } catch {
      // already gone
    }
    return;
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { del } = await import("@vercel/blob");
      await del(filePath);
    } catch {
      // best-effort
    }
    return;
  }
  try {
    await fs.unlink(path.join(localDir(), name));
  } catch {
    // already gone
  }
}

export { saveRequestDocuments, readRequestDocument, removeDocument };
