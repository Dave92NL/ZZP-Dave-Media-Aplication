'use strict';

/**
 * PdfViewer — render PDF do <canvas> przez pdf.js (pdfjs-dist UMD z CDN).
 *
 * Dlaczego nie <embed>/<iframe>: wbudowany PDFium w tym Electronie renderuje
 * pustą (szarą) powierzchnię dla blob:/data: PDF. pdf.js rysuje strony do
 * canvas niezależnie od pluginu.
 *
 * CSP: biblioteka i worker z cdn.jsdelivr.net (dozwolone w script-src).
 * Cross-origin Worker jest blokowany przez same-origin policy, więc pdf.js
 * spada do "fake worker" (ładuje skrypt workera przez <script>, script-src OK).
 * Dane PDF przekazujemy jako bajty (bez fetch — zgodne z connect-src 'none').
 */
const PdfViewer = (() => {
  const WORKER_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const _latest = new WeakMap(); // container -> ostatni renderId (anty-wyścig)

  function _lib() {
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('pdf.js nie został załadowany (sprawdź script w index.html).');
    if (!lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    return lib;
  }

  function _toBytes(dataUrl) {
    const comma = String(dataUrl).indexOf(',');
    const bin = atob(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  // Renderuje wszystkie strony PDF do przewijalnego kontenera.
  async function render(container, dataUrl) {
    if (!container) return;
    const myId = (_latest.get(container) || 0) + 1;
    _latest.set(container, myId);

    let lib;
    try { lib = _lib(); } catch (e) { container.innerHTML = `<div class="doc-viewer-hint">${e.message}</div>`; return; }

    let pdf;
    try {
      pdf = await lib.getDocument({ data: _toBytes(dataUrl) }).promise;
    } catch (e) {
      if (_latest.get(container) !== myId) return;
      container.innerHTML = `<div class="doc-viewer-hint">Nie udało się otworzyć PDF: ${e.message}</div>`;
      return;
    }
    if (_latest.get(container) !== myId) return; // zastąpiony nowszym renderem

    const wrap = document.createElement('div');
    wrap.className = 'pdf-canvas-wrap';
    container.innerHTML = '';
    container.appendChild(wrap);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = (wrap.clientWidth || container.clientWidth || 620) - 8;

    for (let n = 1; n <= pdf.numPages; n++) {
      if (_latest.get(container) !== myId) return;
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.max(0.2, targetW / base.width) * dpr;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page';
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = (viewport.width / dpr) + 'px';
      wrap.appendChild(canvas);

      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  }

  return { render };
})();

window.PdfViewer = PdfViewer;
