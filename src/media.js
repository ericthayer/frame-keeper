// @ts-check
/** Photo helpers: shrink phone photos before upload so they fit function limits and cell data. */

/**
 * Downscale an image file to a JPEG no larger than maxEdge on its long side.
 * @param {Blob} file
 * @param {number} [maxEdge]
 * @param {number} [quality]
 * @returns {Promise<Blob>}
 */
export async function downscale(file, maxEdge = 1800, quality = 0.84) {
  // createImageBitmap applies EXIF orientation, so sideways phone shots come out upright.
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process photos.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that photo."))), "image/jpeg", quality),
  );
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>} Base64 without the data: prefix.
 */
export function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Couldn't read that photo."));
    reader.readAsDataURL(blob);
  });
}

/** @param {string} gameId @param {string} photoId @returns {string} */
export const photoUrl = (gameId, photoId) => `/api/photos/${encodeURIComponent(gameId)}/${photoId}`;
