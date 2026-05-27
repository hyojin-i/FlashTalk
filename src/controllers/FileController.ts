import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileInfo } from "@/entities/FileInfo";
import type { FileInfoDTO } from "@/entities/FileInfoDTO";
import { FileInfoRepository } from "@/repositories/FileInfoRepository";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from "@/utils/fileValidator";

const DEFAULT_STORAGE_BUCKET = "flashtalk-files";

/** Display name stored in DB / shown in chat (original name, path separators only). */
function displayFileName(name: string): string {
  const base = name.replace(/[/\\]/g, "_").trim();
  return base.length > 0 ? base : "file";
}

/** ASCII-only extension for Supabase Storage object keys. */
function storageFileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) return "";
  const raw = name.slice(lastDot).toLowerCase();
  const safe = raw.replace(/[^.a-z0-9]/g, "");
  if (!safe.startsWith(".") || safe.length > 21) return "";
  return safe;
}

/** Supabase Storage keys must be ASCII (A–Z, a–z, 0–9, `_`, `-`, `.`). */
function buildStorageObjectPath(
  userId: string,
  fileId: string,
  originalName: string
): string {
  return `${userId}/${fileId}${storageFileExtension(originalName)}`;
}

function storageBucketName(): string {
  return (
    process.env.SUPABASE_STORAGE_BUCKET?.trim() || DEFAULT_STORAGE_BUCKET
  );
}

const bucketsWithVerifiedLimit = new Set<string>();

function parseFileSizeLimit(limit: unknown): number | null {
  if (limit == null) return null;
  if (typeof limit === "number" && Number.isFinite(limit)) return limit;
  if (typeof limit === "string") {
    const parsed = Number(limit);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isStorageSizeLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("maximum allowed size") ||
    lower.includes("payload too large") ||
    lower.includes("entitytoolarge")
  );
}

async function ensureBucketFileSizeLimit(
  supabase: SupabaseClient,
  bucket: string
): Promise<void> {
  if (bucketsWithVerifiedLimit.has(bucket)) return;

  const { data: bucketData, error: getError } =
    await supabase.storage.getBucket(bucket);
  if (getError) {
    console.warn(
      "[FileController.ensureBucketFileSizeLimit] getBucket",
      getError.message
    );
    return;
  }

  const currentLimit = parseFileSizeLimit(
    (bucketData as { file_size_limit?: unknown }).file_size_limit
  );
  if (currentLimit != null && currentLimit >= MAX_FILE_SIZE_BYTES) {
    bucketsWithVerifiedLimit.add(bucket);
    return;
  }

  const { error: updateError } = await supabase.storage.updateBucket(bucket, {
    public: Boolean((bucketData as { public?: boolean }).public),
    fileSizeLimit: MAX_FILE_SIZE_BYTES,
  });
  if (updateError) {
    console.warn(
      "[FileController.ensureBucketFileSizeLimit] updateBucket",
      updateError.message
    );
    return;
  }

  bucketsWithVerifiedLimit.add(bucket);
}

export class FileController {
  constructor(
    private readonly fileInfoRepository: FileInfoRepository = new FileInfoRepository()
  ) {}

  async uploadFile(file: File, userId: string): Promise<FileInfoDTO> {
    const fileId = randomUUID();
    const fileName = displayFileName(file.name);
    const filePath = buildStorageObjectPath(userId, fileId, file.name);
    const fileType = file.type || "application/octet-stream";
    const fileSize = file.size;

    const supabase = getSupabaseAdminClient();
    const bucket = storageBucketName();
    await ensureBucketFileSizeLimit(supabase, bucket);
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: fileType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[FileController.uploadFile] storage", uploadError.message);
      if (isStorageSizeLimitError(uploadError.message)) {
        throw new Error(
          `파일 용량이 Storage 제한을 초과했습니다. Supabase 대시보드에서 Storage 전역·버킷 업로드 한도를 ${MAX_FILE_SIZE_MB}MB 이상으로 설정해 주세요.`
        );
      }
      throw new Error("파일 업로드에 실패했습니다. 다시 시도하여 주세요.");
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    const fileUrl = urlData.publicUrl;

    const fileInfo: FileInfo = {
      fileId,
      fileName,
      filePath,
      fileSize,
      fileType,
      userId,
      uploadedAt: new Date(),
    };

    await this.fileInfoRepository.saveFileInfo(fileInfo);

    return {
      fileName,
      filePath,
      fileUrl,
      fileSize,
      userId,
    };
  }
}
