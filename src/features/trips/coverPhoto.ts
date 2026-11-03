import type { CoverPhoto } from '@/data/models';
import {
  centerSquare,
  drawScaled,
  fitWithin,
  toJpegDataUrl,
  withDecodedImage,
} from '@/lib/image';

/** The cover image's long side: sharp across a phone screen at 3x. */
export const COVER_MAX_SIDE = 1600;
/** The thumbnail's side: a 56px list cover at 3x, with some room. */
export const THUMBNAIL_SIDE = 192;
const JPEG_QUALITY = 0.8;

/**
 * The photo the user picked, made small enough to keep on the device: the whole photo for the
 * large covers, and the square in its middle for the small ones. Rejects files the browser can't
 * read as an image (e.g. HEIC outside Safari).
 */
export function prepareCoverPhoto(file: Blob): Promise<CoverPhoto> {
  return withDecodedImage(file, (image) => {
    const natural = { width: image.naturalWidth, height: image.naturalHeight };
    const cover = drawScaled(image, { x: 0, y: 0, ...natural }, fitWithin(natural, COVER_MAX_SIDE));
    const square = centerSquare(cover);
    const thumbnail = drawScaled(cover, square, fitWithin(square, THUMBNAIL_SIDE));
    try {
      return {
        image: toJpegDataUrl(cover, JPEG_QUALITY),
        thumbnail: toJpegDataUrl(thumbnail, JPEG_QUALITY),
      };
    } finally {
      // Let go of the pixels now: iOS Safari limits the memory all canvases may hold.
      for (const canvas of [cover, thumbnail]) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  });
}
