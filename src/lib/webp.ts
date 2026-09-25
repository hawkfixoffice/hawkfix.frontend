/**
 * Любое фото → WebP прямо в браузере, до отправки (правило проекта: вся
 * растровая графика — WebP). Заодно уменьшаем до разумной ширины: снимок
 * с телефона весит 4–8 МБ, после конвертации — обычно 150–400 КБ.
 *
 * createImageBitmap учитывает поворот из EXIF (imageOrientation), поэтому
 * вертикальное фото с телефона не ложится на бок.
 */
export async function toWebp(file: File, maxSide = 2000, quality = 0.84): Promise<Blob> {
  if (file.type === 'image/webp' && file.size < 600_000) return file
  let bmp: ImageBitmap | HTMLImageElement
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Safari до 17 и HEIC без поддержки — через <img>
    bmp = await new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image()
      img.onload = () => res(img)
      img.onerror = () => rej(new Error('format'))
      img.src = URL.createObjectURL(file)
    })
  }
  const w = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width
  const h = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  if ('close' in bmp) bmp.close()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality))
  // Браузер без кодировщика WebP вернул бы PNG — такой файл не принимаем
  if (!blob || blob.type !== 'image/webp') throw new Error('webp')
  return blob
}

/** Короткий случайный идентификатор для имени файла. */
export const rid = () => Math.random().toString(36).slice(2, 10)
