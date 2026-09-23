type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';

export async function ConvertBitmap(bitmap: ImageBitmap, type: ImageType = 'image/png', quality = 1.0): Promise<Blob> {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('bitmaprenderer');
    context.transferFromImageBitmap(bitmap);
    return canvas.convertToBlob({ type, quality });
}

/* ConvertImage removed: dead code (knip: unused export) — use ConvertBitmap directly */