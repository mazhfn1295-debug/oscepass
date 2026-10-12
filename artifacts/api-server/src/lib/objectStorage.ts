import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// S3-compatible storage (Cloudflare R2, Backblaze B2, AWS S3, MinIO, ...).
// Required env: S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
// Optional env: S3_ENDPOINT (needed for R2/B2), S3_REGION (default "auto")

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export interface ObjectInfo {
  size: number;
  contentType: string;
}

function config() {
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Object storage is not configured (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)");
  }
  return { bucket, accessKeyId, secretAccessKey };
}

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    const { accessKeyId, secretAccessKey } = config();
    client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

const OBJECT_PATH = /^\/objects\/uploads\/[a-zA-Z0-9-]+$/;
const keyOf = (objectPath: string) => objectPath.replace(/^\/objects\//, "");

function isMissing(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

export class ObjectStorageService {
  /** Creates a short-lived signed URL the browser uses to PUT the file directly into the bucket. */
  async createUpload(mimeType: string): Promise<{ uploadURL: string; objectPath: string }> {
    const { bucket } = config();
    const id = randomUUID();
    const uploadURL = await getSignedUrl(
      s3(),
      new PutObjectCommand({ Bucket: bucket, Key: `uploads/${id}`, ContentType: mimeType }),
      { expiresIn: 900 },
    );
    return { uploadURL, objectPath: `/objects/uploads/${id}` };
  }

  async getObjectInfo(objectPath: string): Promise<ObjectInfo> {
    if (!OBJECT_PATH.test(objectPath)) throw new ObjectNotFoundError();
    try {
      const head = await s3().send(new HeadObjectCommand({ Bucket: config().bucket, Key: keyOf(objectPath) }));
      return { size: Number(head.ContentLength ?? 0), contentType: head.ContentType ?? "application/octet-stream" };
    } catch (error) {
      if (isMissing(error)) throw new ObjectNotFoundError();
      throw error;
    }
  }

  /** Streams an object. Supports HTTP Range so videos can seek. */
  async downloadObject(objectPath: string, cacheTtlSec = 3600, range?: string): Promise<Response> {
    if (!OBJECT_PATH.test(objectPath)) throw new ObjectNotFoundError();
    try {
      const out = await s3().send(new GetObjectCommand({ Bucket: config().bucket, Key: keyOf(objectPath), Range: range }));
      const headers: Record<string, string> = {
        "Content-Type": out.ContentType ?? "application/octet-stream",
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
        "Accept-Ranges": "bytes",
      };
      if (out.ContentLength !== undefined) headers["Content-Length"] = String(out.ContentLength);
      if (out.ContentRange) headers["Content-Range"] = out.ContentRange;
      const body = Readable.toWeb(out.Body as Readable) as ReadableStream;
      return new Response(body, { status: out.ContentRange ? 206 : 200, headers });
    } catch (error) {
      if (isMissing(error)) throw new ObjectNotFoundError();
      throw error;
    }
  }

  async deleteObjectEntity(objectPath: string): Promise<void> {
    if (!OBJECT_PATH.test(objectPath)) throw new ObjectNotFoundError();
    await s3().send(new DeleteObjectCommand({ Bucket: config().bucket, Key: keyOf(objectPath) }));
  }
}
