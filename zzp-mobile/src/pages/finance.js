import { icon } from '../lib/icons.js';

// Ekran „Finanse" — na teraz placeholder. Pełny ekran (przychód/koszt/zysk/VAT,
// trendy) do zbudowania w przyszłości (patrz CLAUDE.md).
export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <div class="coming-soon">
        <div class="coming-soon-icon">${icon('chart', { size: 38 })}</div>
        <h2>Finanse</h2>
        <p>Zbiorczy widok finansów (przychody, koszty, zysk, VAT i trendy) pojawi się tutaj wkrótce.</p>
        <span class="badge badge-info">Wkrótce</span>
      </div>
    </div>
  `;
}
