/**
 * Supabase Storage 上传辅助
 *
 * V0 用法：后端在 API 路由里调用（admin client，绕过 RLS）。
 * Sprint 2 接 magic link 后可以加 user-scoped policies。
 */

import { createAdminClient } from "@/lib/supabase/server";

const BUCKET = "curio-items";

export interface UploadedFile {
  storage_path: string;     // bucket 内部路径，存进 items.storage_path
  signed_url: string;       // 1 小时临时 URL，给 LLM 读图用
  mime_type: string;
  size_bytes: number;
}

/**
 * 把一个 File / Blob 上传到 bucket
 *
 * @param userId  当前用户 ID（路径前缀，保证隔离）
 * @param file    File / Blob 对象
 * @param ext     扩展名（不带点），如 "jpg" "png" "m4a"
 */
export async function uploadFile(
  userId: string,
  file: File | Blob,
  ext: string
): Promise<UploadedFile> {
  const admin = createAdminClient();

  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `${userId}/${filename}`;

  const buffer = file instanceof File
    ? await file.arrayBuffer()
    : await file.arrayBuffer();
  const mime = (file as File).type || guessMime(ext);

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: mime,
      upsert: false,
    });

  if (upErr) {
    throw new Error(`storage upload failed: ${upErr.message}`);
  }

  // 生成 1 小时 signed URL 给 LLM
  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  if (signErr || !signed?.signedUrl) {
    throw new Error(`signed url failed: ${signErr?.message}`);
  }

  return {
    storage_path: path,
    signed_url: signed.signedUrl,
    mime_type: mime,
    size_bytes: (file as Blob).size,
  };
}

/**
 * 删除一个文件（用户撤销 draft 时调用，避免 storage 堆积无主文件）
 */
export async function deleteFile(storagePath: string): Promise<void> {
  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove([storagePath]);
}

function guessMime(ext: string): string {
  const m: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    webm: "audio/webm",
    ogg: "audio/ogg",
  };
  return m[ext.toLowerCase()] ?? "application/octet-stream";
}
