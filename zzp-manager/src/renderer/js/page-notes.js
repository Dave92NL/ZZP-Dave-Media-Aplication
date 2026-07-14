'use strict';

window.PageNotes = (() => {
  let _notes = [];
  let _projects = [];
  let _activeId = null;
  let _autoSaveTimer = null;
  let _dirty = false;
  let _filter = { tab: 'all', project_id: null, search: '' };

  // ── Entry point ──────────────────────────────────────────────────────────
  async function load() {
    const el = document.getElementById('page-content');
    el.innerHTML = _skeleton();

    _projects = await window.api.projects.getAll({});
    await _loadList();
  }

  function unload() {
    _stopAutoSave();
    if (_dirty && _activeId) _saveActive(true);
  }

  // ── Shell ────────────────────────────────────────────────────────────────
  function _skeleton() {
    const projectOpts = _projects.map(p =>
      `<option value="${p.id}">${UI.esc(p.name)}</option>`
    ).join('');

    return `
<div class="notes-layout">
  <!-- LEFT: list panel -->
  <div class="notes-sidebar" id="notes-sidebar">
    <div class="notes-sidebar-header">
      <input type="text" id="notes-search" class="filter-select" placeholder="Szukaj notatek…" style="flex:1">
      <button class="btn btn-primary btn-sm" id="notes-new-btn" style="white-space:nowrap">+ Nowa</button>
    </div>

    <div class="notes-tabs">
      <button class="notes-tab active" data-tab="all">Wszystkie</button>
      <button class="notes-tab" data-tab="global">Ogólne</button>
      <button class="notes-tab" data-tab="project">Projektowe</button>
    </div>

    <div id="notes-project-row" class="notes-project-row" style="display:none">
      <select id="notes-project-filter" class="filter-select" style="width:100%">
        <option value="">— Wybierz projekt —</option>
        ${projectOpts}
      </select>
    </div>

    <div id="notes-list" class="notes-list"></div>
  </div>

  <!-- RIGHT: editor panel -->
  <div class="notes-editor-panel" id="notes-editor-panel">
    <div id="notes-empty-state" class="notes-empty-state">
      <div style="font-size:3rem">📝</div>
      <p style="color:var(--text-muted);margin-top:.5rem">Wybierz notatkę lub utwórz nową</p>
    </div>

    <div id="notes-editor-wrap" style="display:none;height:100%;display:none;flex-direction:column">
      <div class="notes-editor-toolbar">
        <input type="text" id="notes-title" class="notes-title-input" placeholder="Tytuł notatki…">
        <div style="display:flex;gap:.5rem;align-items:center">
          ${window.Translator ? Translator.widgetHTML('notes-title') : ''}
          <button class="btn btn-sm btn-ghost" id="notes-pin-btn" title="Przypnij">📌</button>
          <button class="btn btn-sm btn-ghost" id="notes-export-md-btn" title="Eksportuj .md">⬇ .md</button>
          <button class="btn btn-sm btn-ghost" id="notes-export-pdf-btn" title="Eksportuj PDF">⬇ PDF</button>
          <button class="btn btn-sm btn-danger" id="notes-delete-btn" title="Usuń">🗑</button>
        </div>
      </div>

      <div class="notes-tags-row">
        <span style="color:var(--text-muted);font-size:.8rem">Tagi:</span>
        <div id="notes-tags-list" class="notes-tags-list"></div>
        <input type="text" id="notes-tag-input" class="notes-tag-input" placeholder="+ dodaj tag">
      </div>

      <div class="notes-body">
        <div class="notes-pane" id="notes-editor-pane">
          <div class="notes-toolbar-md">
            <button class="md-btn" data-cmd="bold" title="Pogrubienie">B</button>
            <button class="md-btn" data-cmd="italic" title="Kursywa">I</button>
            <button class="md-btn" data-cmd="h2" title="Nagłówek">H2</button>
            <button class="md-btn" data-cmd="h3" title="Nagłówek 3">H3</button>
            <button class="md-btn" data-cmd="ul" title="Lista">•</button>
            <button class="md-btn" data-cmd="ol" title="Lista num.">1.</button>
            <button class="md-btn" data-cmd="code" title="Kod">&lt;/&gt;</button>
            <button class="md-btn" data-cmd="link" title="Link">🔗</button>
            <button class="md-btn" data-cmd="hr" title="Linia">—</button>
            ${window.Translator ? Translator.widgetHTML('notes-content') : ''}
          </div>
          <textarea id="notes-content" class="notes-textarea" placeholder="Pisz w Markdown…"></textarea>
        </div>
        <div class="notes-divider"></div>
        <div class="notes-pane notes-preview-pane">
          <div class="notes-preview-label">Podgląd</div>
          <div id="notes-preview" class="notes-preview"></div>
        </div>
      </div>

      <div class="notes-footer">
        <span id="notes-save-status" style="color:var(--text-muted);font-size:.8rem"></span>
        <span id="notes-project-badge" style="font-size:.8rem;color:var(--text-muted)"></span>
      </div>
    </div>
  </div>
</div>`;
  }

  // ── List ─────────────────────────────────────────────────────────────────
  async function _loadList() {
    const filters = {};
    if (_filter.tab === 'global') filters.project_id = null;
    else if (_filter.tab === 'project' && _filter.project_id) filters.project_id = _filter.project_id;
    if (_filter.search) filters.search = _filter.search;

    _notes = await window.api.notes.getAll(filters);
    _renderList();
    _bindShell();
  }

  function _renderList() {
    const el = document.getElementById('notes-list');
    if (!el) return;

    if (!_notes.length) {
      el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-muted)">Brak notatek</div>`;
      return;
    }

    el.innerHTML = _notes.map(n => {
      const tags = _parseTags(n.tags);
      const preview = (n.content || '').replace(/[#*`>\-_\[\]]/g, '').slice(0, 80);
      const active = n.id === _activeId ? ' active' : '';
      const pin = n.is_pinned ? '<span class="note-pin">📌</span>' : '';
      return `
<div class="notes-list-item${active}" data-id="${n.id}">
  <div class="notes-list-item-header">
    <span class="notes-list-title">${pin}${UI.esc(n.title)}</span>
    <span class="notes-list-date">${_relDate(n.updated_at)}</span>
  </div>
  ${preview ? `<div class="notes-list-preview">${UI.esc(preview)}</div>` : ''}
  ${tags.length ? `<div class="notes-list-tags">${tags.map(t => `<span class="note-tag">${UI.esc(t)}</span>`).join('')}</div>` : ''}
</div>`;
    }).join('');

    el.querySelectorAll('.notes-list-item').forEach(item => {
      item.addEventListener('click', () => _openNote(+item.dataset.id));
    });
  }

  // ── Open note ─────────────────────────────────────────────────────────────
  async function _openNote(id) {
    if (_dirty && _activeId) await _saveActive(true);

    _activeId = id;
    const note = await window.api.notes.getById(id);
    if (!note) return;

    _renderList(); // re-highlight active

    document.getElementById('notes-empty-state').style.display = 'none';
    const wrap = document.getElementById('notes-editor-wrap');
    wrap.style.display = 'flex';

    document.getElementById('notes-title').value = note.title;
    document.getElementById('notes-content').value = note.content || '';
    _renderTags(_parseTags(note.tags));
    _updatePinBtn(note.is_pinned);
    _renderPreview(note.content || '');
    _setStatus('');

    const proj = _projects.find(p => p.id === note.project_id);
    document.getElementById('notes-project-badge').textContent = proj ? `Projekt: ${proj.name}` : '';

    _dirty = false;
    _startAutoSave();
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function _saveActive(silent = false) {
    if (!_activeId) return;
    const title = document.getElementById('notes-title').value.trim();
    if (!title) { if (!silent) UI.toast('Tytuł jest wymagany', 'error'); return; }

    const content = document.getElementById('notes-content').value;
    const tags = _getCurrentTags();
    const note = _notes.find(n => n.id === _activeId);
    const is_pinned = note?.is_pinned ?? 0;

    await window.api.notes.update(_activeId, { title, content, tags, is_pinned });
    _dirty = false;
    _setStatus('Zapisano ' + new Date().toLocaleTimeString('pl'));
    // Update local list entry
    const idx = _notes.findIndex(n => n.id === _activeId);
    if (idx !== -1) { _notes[idx].title = title; _notes[idx].content = content; }
    _renderList();
  }

  // ── New note ───────────────────────────────────────────────────────────────
  async function _newNote() {
    const project_id = (_filter.tab === 'project' && _filter.project_id) ? +_filter.project_id : null;
    const result = await window.api.notes.create({ title: 'Nowa notatka', content: '', project_id });
    await _loadList();
    await _openNote(result.id);
    const titleEl = document.getElementById('notes-title');
    titleEl.focus();
    titleEl.select();
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function _deleteActive() {
    if (!_activeId) return;
    const ok = await UI.confirm('Usunąć tę notatkę? Operacja jest nieodwracalna.');
    if (!ok) return;
    await window.api.notes.delete(_activeId);
    _activeId = null;
    _dirty = false;
    _stopAutoSave();
    document.getElementById('notes-editor-wrap').style.display = 'none';
    document.getElementById('notes-empty-state').style.display = '';
    await _loadList();
  }

  // ── Pin ───────────────────────────────────────────────────────────────────
  async function _togglePin() {
    if (!_activeId) return;
    const note = _notes.find(n => n.id === _activeId);
    if (!note) return;
    const newPin = note.is_pinned ? 0 : 1;
    await window.api.notes.update(_activeId, { is_pinned: newPin });
    note.is_pinned = newPin;
    _updatePinBtn(newPin);
    _renderList();
  }

  function _updatePinBtn(pinned) {
    const btn = document.getElementById('notes-pin-btn');
    if (btn) btn.style.opacity = pinned ? '1' : '0.4';
  }

  // ── Markdown toolbar ──────────────────────────────────────────────────────
  function _mdCmd(cmd) {
    const ta = document.getElementById('notes-content');
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = ta.value.slice(start, end);
    let insert = '';
    const wrap = (before, after = before) => {
      insert = before + sel + after;
      ta.setRangeText(insert, start, end, 'end');
      ta.focus();
    };

    if (cmd === 'bold')   wrap('**');
    else if (cmd === 'italic') wrap('_');
    else if (cmd === 'code')   wrap('`');
    else if (cmd === 'h2')  { ta.setRangeText(`\n## ${sel || 'Nagłówek'}\n`, start, end, 'end'); }
    else if (cmd === 'h3')  { ta.setRangeText(`\n### ${sel || 'Nagłówek'}\n`, start, end, 'end'); }
    else if (cmd === 'ul')  { ta.setRangeText(`\n- ${sel || 'Element'}\n`, start, end, 'end'); }
    else if (cmd === 'ol')  { ta.setRangeText(`\n1. ${sel || 'Element'}\n`, start, end, 'end'); }
    else if (cmd === 'link') { ta.setRangeText(`[${sel || 'tekst'}](url)`, start, end, 'end'); }
    else if (cmd === 'hr')  { ta.setRangeText('\n---\n', start, end, 'end'); }

    ta.focus();
    _onContentChange();
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  function _renderPreview(md) {
    const el = document.getElementById('notes-preview');
    if (!el) return;
    if (typeof marked !== 'undefined') {
      try {
        const html = marked.parse(md || '');
        el.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;
      } catch { el.textContent = md || ''; }
    } else {
      el.textContent = md || '';
    }
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  function _parseTags(raw) {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  function _getCurrentTags() {
    return Array.from(document.querySelectorAll('.notes-tags-list .note-tag-editable'))
      .map(el => el.dataset.tag);
  }

  function _renderTags(tags) {
    const el = document.getElementById('notes-tags-list');
    if (!el) return;
    el.innerHTML = tags.map(t =>
      `<span class="note-tag-editable" data-tag="${UI.esc(t)}">${UI.esc(t)}<button class="note-tag-remove" data-tag="${UI.esc(t)}">×</button></span>`
    ).join('');
    el.querySelectorAll('.note-tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.note-tag-editable').remove();
        _markDirty();
      });
    });
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function _exportMd() {
    const title = document.getElementById('notes-title').value || 'notatka';
    const content = document.getElementById('notes-content').value;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = title.replace(/[^a-z0-9ąęółśżźćń]/gi, '_') + '.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function _exportPdf() {
    if (!_activeId) return;
    await _saveActive(true);
    try {
      await window.api.reports.export('notes', 'pdf', { note_id: _activeId });
      UI.toast('PDF wyeksportowany', 'success');
    } catch (e) {
      UI.toast('Błąd eksportu PDF: ' + e.message, 'error');
    }
  }

  // ── Auto-save ─────────────────────────────────────────────────────────────
  function _startAutoSave() {
    _stopAutoSave();
    _autoSaveTimer = setInterval(() => {
      if (_dirty) _saveActive(true);
    }, 30000);
  }

  function _stopAutoSave() {
    if (_autoSaveTimer) { clearInterval(_autoSaveTimer); _autoSaveTimer = null; }
  }

  function _markDirty() {
    _dirty = true;
    _setStatus('Niezapisane zmiany…');
  }

  function _onContentChange() {
    _markDirty();
    _renderPreview(document.getElementById('notes-content').value);
  }

  function _setStatus(msg) {
    const el = document.getElementById('notes-save-status');
    if (el) el.textContent = msg;
  }

  // ── Event binding ─────────────────────────────────────────────────────────
  function _bindShell() {
    // Tabs
    document.querySelectorAll('.notes-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.notes-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _filter.tab = btn.dataset.tab;
        const projRow = document.getElementById('notes-project-row');
        projRow.style.display = _filter.tab === 'project' ? 'block' : 'none';
        await _loadList();
      });
    });

    // Project filter
    const projFilter = document.getElementById('notes-project-filter');
    if (projFilter) {
      projFilter.addEventListener('change', async () => {
        _filter.project_id = projFilter.value ? +projFilter.value : null;
        await _loadList();
      });
    }

    // Search
    const searchEl = document.getElementById('notes-search');
    if (searchEl) {
      let searchDebounce;
      searchEl.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(async () => {
          _filter.search = searchEl.value.trim();
          await _loadList();
        }, 300);
      });
    }

    // New note
    const newBtn = document.getElementById('notes-new-btn');
    if (newBtn) newBtn.addEventListener('click', _newNote);

    // Editor events (may not exist until note opened)
    _bindEditorEvents();
  }

  function _bindEditorEvents() {
    const titleEl = document.getElementById('notes-title');
    if (titleEl) titleEl.addEventListener('input', _markDirty);

    const contentEl = document.getElementById('notes-content');
    if (contentEl) {
      contentEl.addEventListener('input', _onContentChange);
      contentEl.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          _saveActive(false);
        }
      });
    }

    document.querySelectorAll('.md-btn').forEach(btn => {
      btn.addEventListener('click', () => _mdCmd(btn.dataset.cmd));
    });

    const tagInput = document.getElementById('notes-tag-input');
    if (tagInput) {
      tagInput.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ',') && tagInput.value.trim()) {
          e.preventDefault();
          const tag = tagInput.value.trim().replace(',', '');
          if (!tag) return;
          const existing = _getCurrentTags();
          if (!existing.includes(tag)) {
            _renderTags([...existing, tag]);
            _markDirty();
          }
          tagInput.value = '';
        }
      });
    }

    const pinBtn = document.getElementById('notes-pin-btn');
    if (pinBtn) pinBtn.addEventListener('click', _togglePin);

    const delBtn = document.getElementById('notes-delete-btn');
    if (delBtn) delBtn.addEventListener('click', _deleteActive);

    const exportMdBtn = document.getElementById('notes-export-md-btn');
    if (exportMdBtn) exportMdBtn.addEventListener('click', _exportMd);

    const exportPdfBtn = document.getElementById('notes-export-pdf-btn');
    if (exportPdfBtn) exportPdfBtn.addEventListener('click', _exportPdf);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _relDate(dateStr) {
    if (!dateStr) return '';
    const diff = (Date.now() - new Date(dateStr)) / 1000;
    if (diff < 60)       return 'przed chwilą';
    if (diff < 3600)     return `${Math.floor(diff/60)} min temu`;
    if (diff < 86400)    return `${Math.floor(diff/3600)} godz. temu`;
    if (diff < 86400*7)  return `${Math.floor(diff/86400)} dni temu`;
    return new Date(dateStr).toLocaleDateString('pl');
  }

  return { load, unload };
})();
