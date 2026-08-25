import crypto from "crypto";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";

// Document storage: replaces the PHP UPLOAD_DIR filesystem scheme.
// - Production (Vercel): Vercel Blob when configured
// - Dev fallback: local ./storage/req_docs directory
// Documents are re-encoded to normalized JPEG (PHP parity): long edge <=1600px,
// ~<=500KB target; max 2 documents per request.

const MAX_DOCS = 2;
const LONG_EDGE = 1600;
const TARGET_BYTES = 500 * 1024;

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

export async function saveRequestDocuments(
  tx: Prisma.TransactionClient,
  requestId: number,
  files: Express.Multer.File[]
): Promise<void> {
  for (const file of files.slice(0, MAX_DOCS)) {
    const jpeg = await normalizeToJpeg(file.buffer);
    const token = crypto.randomBytes(32).toString("hex");
    const name = `req_${requestId}_${token}.jpg`;
    const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

    if (useBlob) {
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

/** Read a document by token (for ?req_doc= serving). */export async function readRequestDocument(
  token: string
): Promise<{ buffer: Buffer } | null> {
  const doc = await (await import("../db")).db.requestDocument.findUnique({
    where: { token },
  });
  if (!doc) return null;
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
export async function removeDocument(filePath: string): Promise<void> {
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
    await fs.unlink(path.join(localDir(), path.basename(filePath)));
  } catch {
    // already gone
  }
}
