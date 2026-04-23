/**
 * 이미지를 Canvas API로 리사이징하여 Base64 data URL로 변환한다.
 * 비율을 유지하면서 maxSize × maxSize 안에 맞춘다.
 * WebP 우선, 미지원 시 JPEG 폴백.
 */
export async function resizeImageToBase64(
  file: File,
  maxSize = 300,
  quality = 0.85,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // 비율 유지 리사이징
  let dw = width;
  let dh = height;
  if (width > maxSize || height > maxSize) {
    const ratio = Math.min(maxSize / width, maxSize / height);
    dw = Math.round(width * ratio);
    dh = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context를 생성할 수 없습니다.');
  ctx.drawImage(bitmap, 0, 0, dw, dh);
  bitmap.close();

  // WebP 우선, 미지원 시 JPEG 폴백
  let dataUrl = canvas.toDataURL('image/webp', quality);
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  return dataUrl;
}
