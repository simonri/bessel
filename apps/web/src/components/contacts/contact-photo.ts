/** The largest centred square of a `width` x `height` image. */
export function centreSquare(width: number, height: number) {
  const side = Math.min(width, height);
  return { x: (width - side) / 2, y: (height - side) / 2, side };
}

const PHOTO_SIZE = 512;

/**
 * A picked image as a square JPEG at most 512 px across, base64-encoded: small
 * enough for Google, and cropped the way the round avatar shows it anyway.
 */
export async function photoForUpload(file: File): Promise<string> {
  const image = await createImageBitmap(file);
  const { x, y, side } = centreSquare(image.width, image.height);
  const size = Math.min(PHOTO_SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Couldn't read that image");
  context.drawImage(image, x, y, side, side, 0, 0, size, size);
  image.close();
  return canvas
    .toDataURL("image/jpeg", 0.9)
    .replace(/^data:image\/jpeg;base64,/, "");
}
