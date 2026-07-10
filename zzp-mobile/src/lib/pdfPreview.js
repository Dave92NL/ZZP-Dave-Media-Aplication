// Render podglądu PDF na telefonie — pdf.js do <canvas> (jak na desktopie).
// Osadzanie <iframe>/<embed> PDF-a jest na iOS Safari zawodne, więc rysujemy
// strony samodzielnie. Worker ładowany jako zasób zbundlowany przez Vite.

import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// source: ArrayBuffer | Uint8Array | { url } | string(url)
// Renderuje wszystkie strony do przekazanego kontenera (czyści go najpierw).
export async function renderPdf(container, source) {
  container.innerHTML = '<p class="text-muted">Renderowanie PDF…</p>';
  try {
    const task = pdfjsLib.getDocument(
      source instanceof ArrayBuffer || source instanceof Uint8Array ? { data: source }
        : typeof source === 'string' ? { url: source } : source
    );
    const pdf = await task.promise;
    container.innerHTML = '';
    const scale = Math.min(2, (container.clientWidth || 320) / 595 * 2 || 1.5);
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      container.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  } catch (err) {
    container.innerHTML = `<p class="error-msg">Nie udało się wyświetlić PDF: ${err.message}</p>`;
  }
}

// Pobiera plik z URL jako ArrayBuffer (dla podpisanych URL-i z Supabase Storage).
export async function fetchArrayBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.arrayBuffer();
}
