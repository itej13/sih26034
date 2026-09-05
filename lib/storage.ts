/**
 * The scan-image store — where the original photograph's bytes live once an officer submits one.
 *
 * Same shape as lib/repository.ts: a small duck-typed port (StorageClient below) rather than the
 * real `@supabase/supabase-js` types, so selfCheck() can exercise the exact upload code path
 * against an in-memory double, with no network and no bucket, from a plain `node lib/storage.ts`.
 * See supabase/migrations/20260905140000_scan_images_bucket.sql for the bucket this writes to.
 *
 * image_sha256 is computed here regardless of mode. It is evidence — appendEvidence() folds it
 * into the hash chain — so it must depend only on the bytes an officer actually photographed,
 * never on whether a Supabase project happens to be configured on the machine running this.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { RepositoryError } from "./repository.ts";

// Same augmentation as lib/repository.ts and lib/evidence.ts — see repository.ts's comment.
// Declaring it again here is safe: TypeScript merges identical ambient interface members.
declare global {
  interface ImportMeta {
    main?: boolean;
  }
}

const BUCKET = "scan-images";

/** Deliberately re-derived rather than imported from repositoryMode(): "mirroring" per the
 *  spec, not delegating — a bucket and a database are two different failure modes even though
 *  today they happen to share one pair of env vars, and this keeps that coincidence from
 *  quietly becoming a hidden coupling. */
export function storageMode(): "supabase" | "fixture" {
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? "supabase"
    : "fixture";
}

// ---------------------------------------------------------------------------
// The port. Real supabase-js's storage client satisfies this structurally.
// ---------------------------------------------------------------------------

interface StorageUploadResult {
  data: { path: string } | null;
  error: { message: string } | null;
}
interface StorageBucketApi {
  upload(path: string, body: Buffer, options: { contentType: string; upsert: boolean }): Promise<StorageUploadResult>;
}
export interface StorageClient {
  storage: { from(bucket: string): StorageBucketApi };
}

/** Loaded lazily — same reason as lib/repository.ts's getDbClient: next/headers only resolves
 *  inside a Next.js request, and this module also has to run standalone under import.meta.main. */
async function getStorageClient(): Promise<StorageClient> {
  const { createClient } = await import("@/lib/supabase/server");
  return (await createClient()) as unknown as StorageClient;
}

// ---------------------------------------------------------------------------
// The write path. Takes a StorageClient explicitly so selfCheck() can hand it the in-memory
// double — uploadScanImage() below is the only caller that reaches for a real one.
// ---------------------------------------------------------------------------

/** scanId is already unique per call (app/api/scan/route.ts mints a fresh one for every
 *  persisted scan), so upsert:true is a safety net against a retried request, not a real
 *  overwrite of someone else's evidence. */
async function uploadToBucket(client: StorageClient, bytes: Buffer, scanId: string, contentType: string): Promise<string> {
  const { error } = await client.storage.from(BUCKET).upload(scanId, bytes, { contentType, upsert: true });
  if (error) throw new RepositoryError(`scan-images upload failed: ${error.message}`);
  return `${BUCKET}/${scanId}`;
}

/** No Supabase configured: nothing was uploaded, but the real hash still travels with the
 *  result — see the header comment. An absent bucket must never lose a completed inspection,
 *  so this never throws; storageMode() (or the mode field below) is what says whether the
 *  bytes were actually filed. */
export async function uploadScanImage(
  image: File,
  scanId: string,
): Promise<{ image_url: string; image_sha256: string; mode: "supabase" | "fixture" }> {
  const bytes = Buffer.from(await image.arrayBuffer());
  const image_sha256 = createHash("sha256").update(bytes).digest("hex");

  if (storageMode() === "fixture") {
    return { image_url: "/fixtures/sample-pack.jpg", image_sha256, mode: "fixture" };
  }

  const image_url = await uploadToBucket(await getStorageClient(), bytes, scanId, image.type || "application/octet-stream");
  return { image_url, image_sha256, mode: "supabase" };
}

// ---------------------------------------------------------------------------
// In-memory double + self-check.
// ---------------------------------------------------------------------------

function createInMemoryStorage(): { client: StorageClient; objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  const client: StorageClient = {
    storage: {
      from(bucket) {
        return {
          upload(path, body) {
            objects.set(`${bucket}/${path}`, body);
            return Promise.resolve({ data: { path }, error: null });
          },
        };
      },
    },
  };
  return { client, objects };
}

/** Exercises the exact upload code the real Supabase path runs, against an in-memory double,
 *  plus the fixture-mode fallback with the ambient Supabase env vars forced off — so this
 *  passes the same way on a laptop with `.env.local` populated as on one without it.
 *  Run directly: `node lib/storage.ts`. */
export async function selfCheck(): Promise<void> {
  const bytesA = Buffer.from("front-panel-photo-bytes");
  const bytesB = Buffer.from("a completely different photo");

  const hashA1 = createHash("sha256").update(bytesA).digest("hex");
  const hashA2 = createHash("sha256").update(bytesA).digest("hex");
  assert.equal(hashA1, hashA2, "the same bytes must hash identically across runs");

  const hashB = createHash("sha256").update(bytesB).digest("hex");
  assert.notEqual(hashA1, hashB, "different bytes must hash differently");

  const { client, objects } = createInMemoryStorage();
  const url = await uploadToBucket(client, bytesA, "sc_selfcheck", "image/jpeg");
  assert.equal(url, `${BUCKET}/sc_selfcheck`, "a supabase-mode upload must return a path under the bucket");
  assert.ok(objects.get(`${BUCKET}/sc_selfcheck`)?.equals(bytesA), "the in-memory bucket must hold the exact bytes uploaded");

  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    const image = new File([bytesA], "packet.jpg", { type: "image/jpeg" });
    const result = await uploadScanImage(image, "sc_selfcheck_fixture");
    assert.equal(result.mode, "fixture", "with no Supabase env vars, uploadScanImage must report fixture mode rather than throw");
    assert.equal(result.image_url, "/fixtures/sample-pack.jpg", "fixture mode must return the standard fixture image path");
    assert.equal(result.image_sha256, hashA1, "fixture mode must still hash the real bytes, not fabricate a placeholder");
  } finally {
    if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedKey;
  }

  console.log(
    "ok — image_sha256 is deterministic and byte-sensitive, supabase-mode upload round-trips " +
      "through the in-memory bucket, and fixture mode returns a labelled result instead of throwing",
  );
}

async function demo(): Promise<void> {
  await selfCheck();
}

if (import.meta.main) {
  await demo();
}
