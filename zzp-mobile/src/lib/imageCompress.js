import imageCompression from 'browser-image-compression';

// Compresses a receipt photo before upload: caps at ~1MB / 1920px long edge,
// forces JPEG output (also normalises the rare HEIC-from-library-picker case
// into a universally supported format). If compression fails for any reason,
// falls back to the original file rather than blocking the whole flow.
export async function compressReceiptPhoto(file) {
  try {
    return await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: 'image/jpeg'
    });
  } catch (err) {
    console.warn('Kompresja zdjęcia nieudana, wysyłam oryginał:', err.message);
    return file;
  }
}
