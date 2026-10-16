'use strict';

/* Pestaña Historial: periodos cerrados, acumulado y gráficos. */

/* =====================================================================
   RENDER: HISTORIAL
   ===================================================================== */

function renderStatsCardHTML(aggregate) {
  if (!aggregate.tripCount) return '';
  const perKm = aggregate.totalKm > 0 ? aggregate.totalCost / aggregate.totalKm : 0;
  const perTrip = aggregate.tripCount > 0 ? aggregate.totalCost / aggregate.tripCount : 0;
  const perDay = aggregate.dayCount > 0 ? aggregate.totalCost / aggregate.dayCount : 0;

  const stat = (label, value) => `
    <div class="stat-box">
      <div class="stat-value">${esc(value)}</div>
      <div class="stat-label">${esc(label)}</div>
    </div>`;

  return `
    <div class="card">
      <h2>Estadísticas</h2>
      <div class="stats-grid">
        ${stat('por km', formatEUR(perKm))}
        ${stat('por trayecto', formatEUR(perTrip))}
        ${stat('por día', formatEUR(perDay))}
      </div>
    </div>`;
}

// El historial se guarda con el más reciente primero (unshift): para los
// gráficos lo queremos en orden cronológico, y solo los últimos
// CHART_MAX_BARS periodos para que las barras no se queden diminutas.
const CHART_MAX_BARS = 8;

function historyChronological() {
  return [...state.history].sort((a, b) => (a.startDate || a.closedAt || '').localeCompare(b.startDate || b.closedAt || ''));
}

// Barras de un importe por periodo: [{ entry, value }] en orden cronológico.
function historyBarsHTML(items, totalPeriods) {
  const max = Math.max(...items.map((i) => i.value), 0.01);
  const hiddenCount = totalPeriods - items.length;
  const bars = items.map(({ entry, value }) => `
    <div class="chart-bar-col" title="${esc(entry.range || '')}: ${esc(formatEUR(value))}">
      <div class="chart-bar-value">${esc(formatEUR(value))}</div>
      <div class="chart-bar" style="height:${Math.max(4, Math.round((value / max) * 100))}%;"></div>
      <div class="chart-bar-label">${esc(formatDateShort(entry.startDate || entry.closedAt))}</div>
    </div>`).join('');
  return `
    ${hiddenCount > 0 ? `<p class="hint" style="margin:0 0 10px;">Mostrando los últimos ${items.length} periodos (${hiddenCount} más antiguos no se muestran aquí).</p>` : ''}
    <div class="chart-bars">${bars}</div>`;
}

function renderHistoryChartHTML() {
  if (state.history.length < 2) return '';
  const chronological = historyChronological();
  const items = chronological.slice(-CHART_MAX_BARS).map((entry) => ({ entry, value: entry.summary.totalCost || 0 }));
  return `
    <div class="card chart-card">
      <h2>Evolución del gasto</h2>
      ${historyBarsHTML(items, chronological.length)}
    </div>`;
}

// Cuánto ha pagado una persona en cada periodo cerrado. Se identifica por
// id, y si no hay (periodos muy antiguos) por nombre.
let historyPersonKey = null;

function personShareIn(entry, key) {
  const p = (entry.summary.perPerson || []).find((x) => (x.personId || x.name) === key);
  return p ? p.share : 0;
}

function renderPersonEvolutionHTML() {
  if (state.history.length < 2) return '';
  const chronological = historyChronological();

  const people = new Map(); // clave -> último nombre conocido
  chronological.forEach((e) => (e.summary.perPerson || []).forEach((p) => people.set(p.personId || p.name, p.name)));
  if (people.size === 0) return '';
  if (!people.has(historyPersonKey)) historyPersonKey = [...people.keys()][0];

  const items = chronological.slice(-CHART_MAX_BARS).map((entry) => ({ entry, value: personShareIn(entry, historyPersonKey) }));
  const total = chronological.reduce((sum, e) => sum + personShareIn(e, historyPersonKey), 0);

  return `
    <div class="card chart-card">
      <h2>Evolución por persona</h2>
      <select class="input" id="historyPersonSelect" style="margin-bottom:10px;">
        ${[...people.entries()].map(([key, name]) => `<option value="${esc(key)}" ${key === historyPersonKey ? 'selected' : ''}>${esc(name)}</option>`).join('')}
      </select>
      <p class="hint" style="margin:0 0 10px;">Total en todos los periodos: <strong>${esc(formatEUR(total))}</strong> · media por periodo: ${esc(formatEUR(total / chronological.length))}</p>
      ${historyBarsHTML(items, chronological.length)}
    </div>`;
}

qs('#historyAggregate').addEventListener('change', (e) => {
  if (e.target.id !== 'historyPersonSelect') return;
  historyPersonKey = e.target.value;
  renderHistorial();
});

function renderHistorial() {
  const aggregateContainer = qs('#historyAggregate');
  const heading = qs('#historyListHeading');
  const clearBtn = qs('#clearHistoryBtn');

  clearBtn.classList.toggle('hidden', state.history.length === 0);
  qs('#exportHistoryCsvBtn').classList.toggle('hidden', state.history.length === 0);

  if (state.history.length > 0) {
    const aggregate = computeHistoryAggregate();
    aggregateContainer.classList.remove('hidden');
    heading.classList.remove('hidden');
    aggregateContainer.innerHTML = `
      <div class="summary-hero">
        <div class="summary-hero-label">TOTAL ACUMULADO · ${state.history.length} PERIODO${state.history.length === 1 ? '' : 'S'} CERRADO${state.history.length === 1 ? '' : 'S'}</div>
        <div class="summary-hero-value">${esc(formatEUR(aggregate.totalCost))}</div>
        <div class="summary-hero-sub">${aggregate.dayCount} día(s) con trayectos · ${aggregate.tripCount} trayecto(s) en total</div>
      </div>
      ${renderHistoryChartHTML()}
      ${renderPersonEvolutionHTML()}
      ${renderStatsCardHTML(aggregate)}
      ${renderSummaryBlocksHTML(aggregate, { personBars: true })}`;
  } else {
    aggregateContainer.classList.add('hidden');
    aggregateContainer.innerHTML = '';
    heading.classList.add('hidden');
  }

  const container = qs('#historyList');
  qs('#historyEmptyState').classList.toggle('hidden', state.history.length > 0);
  container.innerHTML = state.history.map((entry) => `
    <div class="history-item" data-history-id="${entry.id}">
      <div class="history-item-header" data-action="toggle-detail">
        <div>
          <div class="history-item-title">${esc(entry.range || '—')}</div>
          <div class="history-item-sub">Cerrado el ${esc(formatDateShort(entry.closedAt))} · ${entry.summary.tripCount} trayecto(s)</div>
        </div>
        <div class="history-item-total">${esc(formatEUR(entry.summary.totalCost))}</div>
      </div>
      <div class="history-item-detail hidden">
        ${renderSummaryBlocksHTML(entry.summary)}
        <button type="button" class="btn btn-danger" data-action="delete-history">Eliminar del historial</button>
      </div>
    </div>`).join('');
}

qs('#historyList').addEventListener('click', (e) => {
  const item = e.target.closest('.history-item');
  if (!item) return;
  const id = item.dataset.historyId;
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'toggle-detail') {
    item.querySelector('.history-item-detail').classList.toggle('hidden');
  } else if (action === 'delete-history') {
    confirmModal({
      title: 'Eliminar periodo',
      message: '¿Eliminar este periodo del historial? No se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
      onConfirm: () => {
        state.history = state.history.filter((h) => h.id !== id);
        saveState();
        renderHistorial();
      }
    });
  }
});

qs('#exportHistoryCsvBtn').addEventListener('click', async () => {
  const how = await saveOrShareTextFile(`gastos-coche-historial-${todayISO()}.csv`, buildHistoryCSV(state.history), 'text/csv');
  showToast(how === 'shared' ? 'CSV listo' : 'CSV descargado');
});

qs('#clearHistoryBtn').addEventListener('click', () => {
  confirmModal({
    title: 'Borrar historial',
    message: '¿Borrar TODO el historial? Se perderán los totales acumulados de todos los periodos cerrados. Esta acción no se puede deshacer.',
    confirmLabel: 'Borrar todo',
    danger: true,
    onConfirm: () => {
      state.history = [];
      saveState();
      renderHistorial();
      showToast('Historial borrado');
    }
  });
});

