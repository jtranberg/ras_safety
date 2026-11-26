import "dotenv/config";
import { randomUUID } from "node:crypto";
import multer from "multer";
import sharp from "sharp";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const MAX_PHOTOS = 5;

const storage = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.R2_BUCKET;

export const receivePhotos = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: MAX_PHOTOS,
    fields: 0,
    parts: MAX_PHOTOS,
  },
}).array("photos", MAX_PHOTOS);

export function signedPhotos(photos) {
  return Promise.all(
    photos.map(async (photo) => ({
      id: String(photo._id),
      name: photo.originalName,
      url: await getSignedUrl(
        storage,
        new GetObjectCommand({
          Bucket: bucket,
          Key: photo.objectKey,
        }),
        { expiresIn: 300 }
      ),
    }))
  );
}

// Decode actual image content rather than trusting its extension.
// Throws when any file is not a valid, non-animated JPEG, PNG or WebP.
export async function preparePhotos(files, keyPrefix) {
  const prepared = [];

  for (const file of files) {
    const image = sharp(file.buffer, {
      limitInputPixels: 40000000,
    });

    const metadata = await image.metadata();

    if (
      !["jpeg", "png", "webp"].includes(metadata.format) ||
      (metadata.pages ?? 1) > 1
    ) {
      throw new Error("Unsupported image");
    }

    const buffer = await image
      .rotate()
      .resize({
        width: 2000,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();

    prepared.push({
      buffer,
      objectKey: `${keyPrefix}/${randomUUID()}.webp`,
      originalName: file.originalname.slice(0, 200),
      contentType: "image/webp",
      size: buffer.length,
    });
  }

  return prepared;
}

export async function deletePhotoObjects(keys) {
  const results = await Promise.allSettled(
    keys.map((key) =>
      storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    )
  );

  if (results.some((result) => result.status === "rejected")) {
    console.error("Photo cleanup incomplete; inspect R2 objects.");
  }
}

// Uploads every prepared photo, or removes any partial upload and throws.
export async function uploadPhotos(prepared) {
  const uploadedKeys = [];

  try {
    for (const photo of prepared) {
      // Include the key before upload so cleanup covers a lost response.
      uploadedKeys.push(photo.objectKey);

      await storage.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: photo.objectKey,
          Body: photo.buffer,
          ContentType: photo.contentType,
        })
      );
    }
  } catch (err) {
    console.error("R2 upload failed:", {
      name: err.name,
      code: err.code,
      message: err.message,
      status: err.$metadata?.httpStatusCode,
    });

    await deletePhotoObjects(uploadedKeys);
    throw err;
  }

  return uploadedKeys;
}

export function photoMetadata(prepared) {
  return prepared.map(({ buffer: _buffer, ...metadata }) => metadata);
}
