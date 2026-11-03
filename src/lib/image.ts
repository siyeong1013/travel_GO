export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/** The same shape within `maxSide` on the long side; never larger than it was. */
export function fitWithin({ width, height }: Size, maxSide: number): Size {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The largest square in the middle. */
export function centerSquare({ width, height }: Size): Rect {
  const side = Math.min(width, height);
  return {
    x: Math.floor((width - side) / 2),
    y: Math.floor((height - side) / 2),
    width: side,
    height: side,
  };
}

/**
 * Calls `draw` with the image file decoded the way the browser shows it (turned upright by the
 * camera's orientation tag). Rejects when the browser can't read the file as an image.
 */
export async function withDecodedImage<T>(
  file: Blob,
  draw: (image: HTMLImageElement) => T,
): Promise<T> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('the image has no size');
    return draw(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The `from` part of `source`, drawn at `size` on a new canvas. */
export function drawScaled(source: CanvasImageSource, from: Rect, size: Size): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas 2d is not available');
  // JPEG has no transparency: what is see-through (in a PNG) comes out white instead of black.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, from.x, from.y, from.width, from.height, 0, 0, size.width, size.height);
  return canvas;
}

export function toJpegDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  const url = canvas.toDataURL('image/jpeg', quality);
  // Browsers give "data:," for a canvas they could not draw (too large for the memory left).
  if (!url.startsWith('data:image/jpeg;base64,')) throw new Error('could not encode the image');
  return url;
}
