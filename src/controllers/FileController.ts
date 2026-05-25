import { randomUUID } from "node:crypto";
import type { FileInfo } from "@/entities/FileInfo";
import type { FileInfoDTO } from "@/entities/FileInfoDTO";
import { FileInfoRepository } from "@/repositories/FileInfoRepository";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const DEFAULT_STORAGE_BUCKET = "flashtalk-files";

function sanitizeFileName(name: string): string {
  const base = name.replace(/[/\\]/g, "_").trim();
  return base.length > 0 ? base : "file";
}

function storageBucketName(): string {
  return (
    process.env.SUPABASE_STORAGE_BUCKET?.trim() || DEFAULT_STORAGE_BUCKET
  );
}

export class FileController {
  constructor(
    private readonly fileInfoRepository: FileInfoRepository = new FileInfoRepository()
  ) {}

  async uploadFile(file: File, userId: string): Promise<FileInfoDTO> {
    const fileId = randomUUID();
    const fileName = sanitizeFileName(file.name);
    const filePath = `${userId}/${fileId}_${fileName}`;
    const fileType = file.type || "application/octet-stream";
    const fileSize = file.size;

    const supabase = getSupabaseAdminClient();
    const bucket = storageBucketName();
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: fileType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[FileController.uploadFile] storage", uploadError.message);
      throw new Error("파일 업로드에 실패했습니다.");
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
