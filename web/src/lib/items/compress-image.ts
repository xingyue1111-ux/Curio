/**
 * 客户端图片压缩（上传前跑）
 *
 * 手机照片动辄 3-5MB，直接传上去既费存储又加载慢。
 * 用 canvas 把长边压到 maxDim，重新编码成 JPEG，体积通常降到 1/5~1/10。
 *
 * 纯前端 canvas 实现，零依赖。失败就退回原文件（不阻塞上传）。
 */

const MAX_DIM = 1600; // 长边上限 px
const QUALITY = 0.82;

export async function compressImage(file: File): Promise<File> {
  // 非图片 / GIF（动图压了会丢帧）直接返回原文件
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;

    // 已经够小就不压（避免无谓重编码反而变大）
    const longest = Math.max(width, height);
    if (longest <= MAX_DIM && file.size < 800 * 1024) {
      bitmap.close();
      return file;
    }

    const scale = longest > MAX_DIM ? MAX_DIM / longest : 1;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    if (!blob) return file;

    // 压完反而更大就用原图
    if (blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
