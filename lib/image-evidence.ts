const MAX_IMAGE_DATA_URL_LENGTH = 720_000;

/** Check that an evidence attachment contains an actual supported image payload. */
export function isSupportedImageDataUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_IMAGE_DATA_URL_LENGTH) return false;
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match || match[2].length % 4 !== 0) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 12) return false;
  const mime = match[1].toLowerCase();
  if (mime === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

/** Only embedded, server-inspectable image data counts as visual evidence. */
export function hasEmbeddedImageEvidence(images: unknown): boolean {
  return Array.isArray(images) && images.some((image) =>
    image !== null && typeof image === 'object' && isSupportedImageDataUrl((image as { d?: unknown }).d));
}

export function countEmbeddedImageEvidence(images: unknown): number {
  return Array.isArray(images) ? images.filter((image) =>
    image !== null && typeof image === 'object' && isSupportedImageDataUrl((image as { d?: unknown }).d)).length : 0;
}
