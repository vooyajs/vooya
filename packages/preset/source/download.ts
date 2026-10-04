import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, renameSync, rmSync } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface VerifiedDownload { url: string; sha256: string }

// Stream to a private partial file; never execute or extract before verification.
export async function downloadVerified({ url, sha256 }: VerifiedDownload, destination: string): Promise<void> {
  const partial = `${destination}.partial-${randomUUID()}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
    if (!response.ok || !response.body) throw new Error(`Toolchain download failed: ${response.status} ${url}`);
    const hash = createHash("sha256");
    const digest = new Transform({ transform(chunk, _encoding, callback) { hash.update(chunk); callback(null, chunk); } });
    await pipeline(Readable.fromWeb(response.body), digest, createWriteStream(partial, { flags: "wx" }));
    if (hash.digest("hex") !== sha256) throw new Error(`SHA-256 mismatch for ${url}. Download discarded.`);
    renameSync(partial, destination);
  } finally { rmSync(partial, { force: true }); }
}
