'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Minimal, dedicated bridge for the floating launcher bubble.
// Deliberately does NOT expose the full app API surface (invoices, expenses, etc.)
// since this window only needs to reposition itself and open the main window.
contextBridge.exposeInMainWorld('floatingAPI', {
  move: (dx, dy) => ipcRenderer.send('floating:move', { dx, dy }),
  dragEnd: () => ipcRenderer.send('floating:dragEnd'),
  click: () => ipcRenderer.send('floating:click')
});
