import "server-only";

/**
 * Upload backend abstraction.
 *
 * Real mode: when `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY` + `S3_BUCKET`
 * + `S3_ENDPOINT` are set, mints a presigned PUT URL pointing at S3/R2 so
 * the browser uploads bytes directly (no proxy through our Node runtime).
 *
 * Dev fallback: returns a sentinel URL the client can recognize, signaling
 * that the upload should be inlined as a `data:` URL when the file is small
 * (≤512 KB). Keeps the dev preview working without any cloud creds.
 *
 * Production note: for a real S3/R2 wiring the SDK adds dep weight (~600 KB).
 * We use the AWS Signature V4 algorithm by hand instead — same compatibility
 * window, ~100 LOC. Kept simple for the SaaS skeleton; switch to `@aws-sdk/*`
 * when the workload justifies it.
 */

import { createHash, createHmac } from "crypto";

const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION ?? "auto";
const S3_ENDPOINT = process.env.S3_ENDPOINT; // e.g. https://<account>.r2.cloudflarestorage.com
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_PUBLIC_BASE = process.env.S3_PUBLIC_BASE; // CDN base for resolving the public URL

export function uploadsEnabled(): boolean {
  return !!(S3_BUCKET && S3_ENDPOINT && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY);
}

export interface PresignResult {
  /** Backend mode the caller should use. */
  mode: "s3" | "data-url";
  /** When mode=s3: PUT this URL with the bytes. Headers must match `signedHeaders`. */
  putUrl?: string;
  /** When mode=s3: required headers for the PUT (e.g. `Content-Type`). */
  signedHeaders?: Record<string, string>;
  /** When mode=s3: where the file will be publicly readable after the PUT. */
  publicUrl?: string;
  /** Server-stored object key (S3 path). */
  key: string;
  /** Bytes the client has been authorized to upload — caller must enforce. */
  maxBytes: number;
  /** Allowed MIME types (caller should refuse anything else client-side too). */
  allowedTypes: string[];
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB hard cap
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export interface PresignInput {
  /** Tenant scope — never cross-tenant. */
  hotelId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export function presignUpload(input: PresignInput): PresignResult {
  if (input.sizeBytes > MAX_BYTES) {
    throw new Error(`file too large: ${input.sizeBytes} > ${MAX_BYTES}`);
  }
  if (!ALLOWED_TYPES.includes(input.contentType)) {
    throw new Error(`unsupported content type: ${input.contentType}`);
  }

  // Stable per-upload key. Hotel-prefixed so a leaked key can't enumerate
  // siblings, and timestamp-suffixed so re-uploads of the same name don't
  // collide.
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const key = `hotels/${input.hotelId}/uploads/${Date.now()}-${safeName}`;

  if (!uploadsEnabled()) {
    return { mode: "data-url", key, maxBytes: MAX_BYTES, allowedTypes: ALLOWED_TYPES };
  }

  // ── AWS SigV4 PUT presign ──────────────────────────────────────────
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const host = new URL(S3_ENDPOINT!).host;
  const canonicalUri = `/${S3_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const expiresIn = 600; // 10 minutes
  const credential = `${S3_ACCESS_KEY_ID}/${dateStamp}/${S3_REGION}/s3/aws4_request`;
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  });
  const canonicalQuery = params.toString();
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    `${dateStamp}/${S3_REGION}/s3/aws4_request`,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const kDate = createHmac("sha256", `AWS4${S3_SECRET_ACCESS_KEY}`).update(dateStamp).digest();
  const kRegion = createHmac("sha256", kDate).update(S3_REGION).digest();
  const kService = createHmac("sha256", kRegion).update("s3").digest();
  const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const putUrl = `${S3_ENDPOINT}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  const publicUrl = S3_PUBLIC_BASE
    ? `${S3_PUBLIC_BASE.replace(/\/$/, "")}/${key}`
    : `${S3_ENDPOINT}/${S3_BUCKET}/${key}`;

  return {
    mode: "s3",
    putUrl,
    signedHeaders: { "Content-Type": input.contentType },
    publicUrl,
    key,
    maxBytes: MAX_BYTES,
    allowedTypes: ALLOWED_TYPES,
  };
}
