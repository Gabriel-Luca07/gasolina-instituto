'use strict';

/* =====================================================================
   Gastos Coche — lógica de la app (sin frameworks, sin backend)
   Todo se guarda en localStorage. Ver README.md para publicar en
   GitHub Pages.
   ===================================================================== */

const STORAGE_KEY = 'gasolinaInstitutoState_v1';

/* ----------------------------- Utilidades ----------------------------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function todayISO() {
  return toISODate(new Date());
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODate(str) {
  return new Date(`${str}T00:00:00`);
}

function formatEUR(n) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

function formatKm(n) {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n || 0)} km`;
}

function formatDateLong(dateStr) {
  const str = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseISODate(dateStr));
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDateShort(dateStr) {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(parseISODate(dateStr));
}

function qs(sel, root) { return (root || document).querySelector(sel); }
function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------- Estado -------------------------------- */

function createDefaultState() {
  return {
    version: 1,
    people: [],
    cars: [],
    globalPrice: 1.65,
    savedTrips: [],
    driverPays: true,
    period: { id: uid(), createdAt: todayISO(), days: [] },
    history: [],
    lastTrip: null,
    theme: 'auto'
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.people)) return createDefaultState();
    if (!parsed.period) parsed.period = { id: uid(), createdAt: todayISO(), days: [] };
    if (!Array.isArray(parsed.history)) parsed.history = [];
    if (!Array.isArray(parsed.savedTrips)) parsed.savedTrips = [];
    if (!Array.isArray(parsed.cars)) parsed.cars = [];
    if (typeof parsed.globalPrice !== 'number') parsed.globalPrice = 1.65;
    if (typeof parsed.driverPays !== 'boolean') parsed.driverPays = true;
    if (!['auto', 'light', 'dark'].includes(parsed.theme)) parsed.theme = 'auto';
    return parsed;
  } catch (e) {
    console.error('Estado corrupto, se reinicia', e);
    return createDefaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* -------------------------------- Toast -------------------------------- */

let toastTimer = null;
let toastUndoHandler = null;

function hideToast() {
  qs('#toast').classList.add('hidden');
  const btn = qs('#toastUndoBtn');
  btn.classList.add('hidden');
  if (toastUndoHandler) { btn.removeEventListener('click', toastUndoHandler); toastUndoHandler = null; }
}

function showToast(msg) {
  hideToast();
  const el = qs('#toast');
  qs('#toastMessage').textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 2600);
}

function showUndoToast(msg, onUndo) {
  hideToast();
  const el = qs('#toast');
  const btn = qs('#toastUndoBtn');
  qs('#toastMessage').textContent = msg;
  btn.classList.remove('hidden');
  el.classList.remove('hidden');
  toastUndoHandler = () => { hideToast(); clearTimeout(toastTimer); onUndo(); };
  btn.addEventListener('click', toastUndoHandler);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 6000);
}

/* -------------------------------- Modal --------------------------------- */

function openModal(title, bodyHTML) {
  qs('#modalTitle').textContent = title;
  qs('#modalBody').innerHTML = bodyHTML;
  qs('#modalOverlay').classList.remove('hidden');
}

function closeModal() {
  qs('#modalOverlay').classList.add('hidden');
  qs('#modalBody').innerHTML = '';
}

qs('#modalClose').addEventListener('click', closeModal);
qs('#modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

/* -------------------------------- Tabs ---------------------------------- */

function switchTab(tab) {
  qsa('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  qsa('.tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.tabPanel === tab));
  if (tab === 'resumen') renderResumen();
  if (tab === 'historial') renderHistorial();
}

qs('#tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (btn) switchTab(btn.dataset.tab);
});

/* =====================================================================
   CÁLCULO
   ===================================================================== */

function effectivePrice(car) {
  if (car.useOwnPrice && typeof car.ownPrice === 'number' && car.ownPrice > 0) return car.ownPrice;
  return state.globalPrice;
}

function computeTripCost(car, km) {
  if (!car) return 0;
  return (km || 0) * (car.consumption || 0) / 100 * effectivePrice(car);
}

// Coste total de un trayecto tal y como se muestra al usuario: si es de
// ida y vuelta, el coste de los km introducidos (un solo sentido) se cuenta dos veces.
function computeTripDisplayCost(trip) {
  const car = state.cars.find((c) => c.id === trip.carId);
  const legCost = computeTripCost(car, trip.km);
  return trip.roundTrip ? legCost * 2 : legCost;
}

function computePeriodSummary(period) {
  const perCarMap = new Map();
  const shareMap = new Map();
  const pairDebts = new Map(); // "deudorId|acreedorId" -> importe (sin simplificar entre personas)
  state.people.forEach((p) => { shareMap.set(p.id, 0); });

  let totalCost = 0, tripCount = 0;

  period.days.forEach((day) => {
    day.trips.forEach((trip) => {
      const car = state.cars.find((c) => c.id === trip.carId);
      if (!car) return;

      // Un trayecto normal es un solo tramo; uno de ida y vuelta son dos tramos
      // (mismo coche y km, pero cada uno con sus propios pasajeros y su propio coste).
      const legs = trip.roundTrip
        ? [trip.passengerIds, trip.returnPassengerIds || trip.passengerIds]
        : [trip.passengerIds];

      legs.forEach((legPassengerIds) => {
        const cost = computeTripCost(car, trip.km);
        totalCost += cost;
        tripCount++;

        if (!perCarMap.has(car.id)) perCarMap.set(car.id, { car, totalCost: 0, totalKm: 0, tripCount: 0 });
        const agg = perCarMap.get(car.id);
        agg.totalCost += cost;
        agg.totalKm += (trip.km || 0);
        agg.tripCount++;

        let splitSet = new Set((legPassengerIds || []).filter((id) => state.people.some((p) => p.id === id)));
        if (state.driverPays) splitSet.add(car.driverId);
        if (splitSet.size === 0) splitSet.add(car.driverId);
        const share = cost / splitSet.size;

        splitSet.forEach((pid) => {
          if (shareMap.has(pid)) shareMap.set(pid, shareMap.get(pid) + share);
          if (pid !== car.driverId && state.people.some((p) => p.id === pid)) {
            const key = `${pid}|${car.driverId}`;
            pairDebts.set(key, (pairDebts.get(key) || 0) + share);
          }
        });
      });
    });
  });

  const perCar = [...perCarMap.values()]
    .map((a) => ({
      carId: a.car.id,
      name: a.car.name,
      driverName: (state.people.find((p) => p.id === a.car.driverId) || {}).name || '—',
      totalCost: a.totalCost,
      totalKm: a.totalKm,
      tripCount: a.tripCount
    }))
    .sort((a, b) => b.totalCost - a.totalCost);

  const perPerson = state.people
    .map((p) => ({ personId: p.id, name: p.name, share: shareMap.get(p.id) || 0 }))
    .filter((p) => p.share > 0.001)
    .sort((a, b) => b.share - a.share);

  const dayCount = period.days.filter((d) => d.trips.length > 0).length;

  // Deudas persona a persona: solo se neta lo que se deben mutuamente esas dos
  // personas entre sí, sin mezclar a nadie más.
  const pairKeys = new Set();
  pairDebts.forEach((_, key) => pairKeys.add(key.split('|').sort().join('|')));
  const pairwiseBalances = [...pairKeys].map((key) => {
    const [aId, bId] = key.split('|');
    const amount = (pairDebts.get(`${aId}|${bId}`) || 0) - (pairDebts.get(`${bId}|${aId}`) || 0);
    return {
      aId, bId,
      aName: (state.people.find((p) => p.id === aId) || {}).name || '?',
      bName: (state.people.find((p) => p.id === bId) || {}).name || '?',
      amount
    };
  }).filter((p) => Math.abs(p.amount) > 0.005);

  const pairwiseDebts = pairwiseBalances
    .map((p) => (p.amount > 0 ? { from: p.aName, to: p.bName, amount: p.amount } : { from: p.bName, to: p.aName, amount: -p.amount }))
    .sort((a, b) => b.amount - a.amount);

  return { totalCost, tripCount, dayCount, perCar, perPerson, pairwiseBalances, pairwiseDebts };
}

function computeHistoryAggregate() {
  const totals = { totalCost: 0, tripCount: 0, dayCount: 0 };
  const carAgg = new Map();
  const personShare = new Map();
  const pairAgg = new Map(); // "aId|bId" (orden fijo) -> {aId,bId,aName,bName,amount}

  state.history.forEach((entry) => {
    const s = entry.summary || {};
    totals.totalCost += s.totalCost || 0;
    totals.tripCount += s.tripCount || 0;
    totals.dayCount += s.dayCount || 0;

    (s.perCar || []).forEach((c) => {
      const cur = carAgg.get(c.carId) || { name: c.name, driverName: c.driverName, totalCost: 0, totalKm: 0, tripCount: 0 };
      cur.totalCost += c.totalCost; cur.totalKm += c.totalKm; cur.tripCount += c.tripCount;
      cur.name = c.name; cur.driverName = c.driverName;
      carAgg.set(c.carId, cur);
    });
    (s.perPerson || []).forEach((p) => {
      const cur = personShare.get(p.personId) || { name: p.name, share: 0 };
      cur.share += p.share; cur.name = p.name;
      personShare.set(p.personId, cur);
    });
    (s.pairwiseBalances || []).forEach((p) => {
      const key = `${p.aId}|${p.bId}`;
      const cur = pairAgg.get(key) || { aId: p.aId, bId: p.bId, aName: p.aName, bName: p.bName, amount: 0 };
      cur.amount += p.amount; cur.aName = p.aName; cur.bName = p.bName;
      pairAgg.set(key, cur);
    });
  });

  const perCar = [...carAgg.entries()]
    .map(([carId, v]) => ({ carId, name: v.name, driverName: v.driverName, totalCost: v.totalCost, totalKm: v.totalKm, tripCount: v.tripCount }))
    .sort((a, b) => b.totalCost - a.totalCost);

  const perPerson = [...personShare.entries()]
    .map(([personId, v]) => ({ personId, name: v.name, share: v.share }))
    .filter((p) => p.share > 0.001)
    .sort((a, b) => b.share - a.share);

  const pairwiseDebts = [...pairAgg.values()]
    .filter((p) => Math.abs(p.amount) > 0.005)
    .map((p) => (p.amount > 0 ? { from: p.aName, to: p.bName, amount: p.amount } : { from: p.bName, to: p.aName, amount: -p.amount }))
    .sort((a, b) => b.amount - a.amount);

  return { ...totals, perCar, perPerson, pairwiseDebts };
}

/* =====================================================================
   RENDER: cabecera / badge de periodo
   ===================================================================== */

function updatePeriodBadge() {
  const days = getSortedDays(state.period);
  const badge = qs('#periodLabel');
  if (days.length === 0) {
    badge.textContent = 'Periodo sin días';
  } else {
    const first = days[0].date, last = days[days.length - 1].date;
    badge.textContent = first === last ? formatDateShort(first) : `${formatDateShort(first)} - ${formatDateShort(last)}`;
  }
}

function getSortedDays(period) {
  return [...period.days].sort((a, b) => a.date.localeCompare(b.date));
}

/* =====================================================================
   RENDER: REGISTRO
   ===================================================================== */

function getMondayOfCurrentWeek() {
  const today = new Date();
  const dow = today.getDay(); // 0=Dom
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday;
}

function weekdayDate(weekdayIndex) {
  const monday = getMondayOfCurrentWeek();
  const d = new Date(monday);
  d.setDate(monday.getDate() + (weekdayIndex - 1));
  return toISODate(d);
}

function renderQuickWeekdays() {
  qsa('#quickWeekdayButtons .chip-btn').forEach((btn) => {
    const date = weekdayDate(Number(btn.dataset.weekday));
    const exists = state.period.days.some((d) => d.date === date);
    btn.classList.toggle('active', exists);
    btn.classList.toggle('picked', multiSelectMode && multiSelectDates.has(date));
    btn.dataset.date = date;
  });
}

qs('#quickWeekdayButtons').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip-btn');
  if (!btn) return;
  const date = btn.dataset.date || weekdayDate(Number(btn.dataset.weekday));
  if (multiSelectMode) {
    toggleMultiSelectDate(date);
  } else {
    toggleDay(date);
  }
});

qs('#addCustomDateBtn').addEventListener('click', () => {
  const input = qs('#customDateInput');
  if (!input.value) { showToast('Elige una fecha primero'); return; }
  if (multiSelectMode) {
    if (multiSelectDates.has(input.value)) {
      showToast('Esa fecha ya está en la selección');
    } else {
      toggleMultiSelectDate(input.value);
      showToast('Fecha añadida a la selección');
    }
  } else {
    const existed = state.period.days.some((d) => d.date === input.value);
    addDay(input.value);
    showToast(existed ? 'Ese día ya estaba añadido' : 'Día añadido');
  }
  input.value = '';
});

qs('#copyPrevWeekBtn').addEventListener('click', copyPreviousWeek);

/* -------- Selección múltiple de días (para añadir el mismo trayecto a varios) -------- */

let multiSelectMode = false;
const multiSelectDates = new Set();

function toggleMultiSelectDate(date) {
  if (multiSelectDates.has(date)) multiSelectDates.delete(date);
  else multiSelectDates.add(date);
  updateMultiSelectUI();
  renderQuickWeekdays();
}

function updateMultiSelectUI() {
  qs('#toggleMultiSelectBtn').textContent = multiSelectMode
    ? '✕ Cancelar selección múltiple'
    : '☑️ Seleccionar varios días para el mismo trayecto';
  qs('#multiSelectBar').classList.toggle('hidden', !multiSelectMode);
  qs('#addDaysHint').classList.toggle('hidden', multiSelectMode);
  qs('#multiSelectCount').textContent = `${multiSelectDates.size} día(s) seleccionado(s)`;
  qs('#multiSelectAddTripBtn').disabled = multiSelectDates.size === 0;
}

function exitMultiSelect() {
  multiSelectMode = false;
  multiSelectDates.clear();
  updateMultiSelectUI();
  renderQuickWeekdays();
}

qs('#toggleMultiSelectBtn').addEventListener('click', () => {
  multiSelectMode = !multiSelectMode;
  multiSelectDates.clear();
  updateMultiSelectUI();
  renderQuickWeekdays();
});

qs('#multiSelectCancelBtn').addEventListener('click', exitMultiSelect);

qs('#multiSelectAddTripBtn').addEventListener('click', () => {
  if (multiSelectDates.size === 0) return;
  openTripModal(null, null, [...multiSelectDates]);
});

function copyPreviousWeek() {
  const monday = getMondayOfCurrentWeek();
  const prevMonday = new Date(monday);
  prevMonday.setDate(monday.getDate() - 7);

  const prevWeekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(prevMonday);
    d.setDate(prevMonday.getDate() + i);
    prevWeekDates.push(toISODate(d));
  }

  const sourceDays = state.period.days.filter((d) => prevWeekDates.includes(d.date) && d.trips.length > 0);
  if (sourceDays.length === 0) { showToast('No hay trayectos la semana pasada para copiar'); return; }

  let tripsCopied = 0;
  let daysSkipped = 0;

  sourceDays.forEach((day) => {
    const targetDate = new Date(parseISODate(day.date));
    targetDate.setDate(targetDate.getDate() + 7);
    const targetISO = toISODate(targetDate);

    let target = state.period.days.find((d) => d.date === targetISO);
    if (target && target.trips.length > 0) { daysSkipped++; return; }
    if (!target) {
      target = { id: uid(), date: targetISO, trips: [] };
      state.period.days.push(target);
    }
    const cloned = day.trips.map((t) => cloneTrip(t));
    target.trips.push(...cloned);
    tripsCopied += cloned.length;
  });

  saveState();
  renderRegistro();
  updatePeriodBadge();

  if (tripsCopied === 0) {
    showToast('Esos días ya tenían trayectos propios; no se ha tocado nada');
  } else if (daysSkipped > 0) {
    showToast(`Copiados ${tripsCopied} trayecto(s) (${daysSkipped} día(s) ya tenían trayectos y no se tocaron)`);
  } else {
    showToast(`Copiados ${tripsCopied} trayecto(s) a la semana actual`);
  }
}

function addDay(date) {
  if (state.period.days.some((d) => d.date === date)) return;
  state.period.days.push({ id: uid(), date, trips: [] });
  saveState();
  renderRegistro();
  updatePeriodBadge();
}

function toggleDay(date) {
  const idx = state.period.days.findIndex((d) => d.date === date);
  if (idx === -1) { addDay(date); return; }
  removeDayAt(idx);
}

function removeDay(dayId) {
  const idx = state.period.days.findIndex((d) => d.id === dayId);
  if (idx === -1) return;
  removeDayAt(idx);
}

function removeDayAt(idx) {
  const [removed] = state.period.days.splice(idx, 1);
  saveState();
  renderRegistro();
  updatePeriodBadge();

  const restore = () => {
    state.period.days.splice(idx, 0, removed);
    saveState();
    renderRegistro();
    updatePeriodBadge();
  };

  if (removed.trips.length > 0) {
    showUndoToast(`Día eliminado (${formatDateShort(removed.date)}, ${removed.trips.length} trayecto(s))`, restore);
  } else {
    showUndoToast(`Día eliminado (${formatDateShort(removed.date)})`, restore);
  }
}

function copyPreviousDay(dayId) {
  const sorted = getSortedDays(state.period);
  const idx = sorted.findIndex((d) => d.id === dayId);
  if (idx <= 0) { showToast('No hay un día anterior en este periodo'); return; }
  const prev = sorted[idx - 1];
  if (prev.trips.length === 0) { showToast('El día anterior no tiene trayectos'); return; }
  const target = state.period.days.find((d) => d.id === dayId);
  const doCopy = () => {
    const cloned = prev.trips.map((t) => cloneTrip(t));
    target.trips.push(...cloned);
    saveState();
    renderRegistro();
    showToast('Trayectos copiados');
  };
  if (target.trips.length > 0) {
    if (confirm('Este día ya tiene trayectos. ¿Añadir también los del día anterior?')) doCopy();
  } else {
    doCopy();
  }
}

function renderRegistroDashboard() {
  const summary = computePeriodSummary(state.period);
  const el = qs('#registroDashboard');

  if (summary.tripCount === 0) {
    el.innerHTML = `
      <div class="summary-hero-label">PRESUPUESTO DE ESTE PERIODO</div>
      <div class="summary-hero-value">${esc(formatEUR(0))}</div>
      <div class="summary-hero-sub">Añade trayectos para ver el total en vivo</div>`;
    return;
  }

  const topDebt = (summary.pairwiseDebts || [])[0];
  el.innerHTML = `
    <div class="summary-hero-label">PRESUPUESTO DE ESTE PERIODO</div>
    <div class="summary-hero-value">${esc(formatEUR(summary.totalCost))}</div>
    <div class="summary-hero-sub">${summary.dayCount} día(s) · ${summary.tripCount} trayecto(s)${topDebt ? ` · ${esc(topDebt.from)} debe ${esc(formatEUR(topDebt.amount))} a ${esc(topDebt.to)}` : ''}</div>
    <button type="button" class="dashboard-link-btn" id="dashboardGoToResumenBtn">Ver resumen completo →</button>`;

  qs('#dashboardGoToResumenBtn').addEventListener('click', () => switchTab('resumen'));
}

function renderRegistro() {
  renderRegistroDashboard();
  renderQuickWeekdays();
  const container = qs('#dayList');
  const days = getSortedDays(state.period);
  qs('#registroEmptyState').classList.toggle('hidden', days.length > 0);

  container.innerHTML = days.map((day, idx) => {
    const dayCost = day.trips.reduce((sum, t) => sum + computeTripDisplayCost(t), 0);
    const tripsHTML = day.trips.length
      ? day.trips.map((trip) => renderTripRow(day, trip)).join('')
      : '<p class="hint" style="margin:4px 0 10px;">Sin trayectos este día todavía.</p>';

    return `
      <div class="day-card" data-day-id="${day.id}">
        <div class="day-card-header">
          <div>
            <div class="day-card-title">${esc(formatDateLong(day.date))}</div>
            <div class="day-card-subtitle">${day.trips.length} trayecto(s) · ${esc(formatEUR(dayCost))}</div>
          </div>
          <div class="day-card-actions">
            ${idx > 0 ? `<button type="button" class="icon-btn" data-action="copy-day" title="Copiar día anterior">📋</button>` : ''}
            <button type="button" class="icon-btn danger" data-action="remove-day" title="Eliminar día">🗑</button>
          </div>
        </div>
        <div class="day-card-body">
          ${tripsHTML}
          <button type="button" class="btn btn-secondary btn-block add-trip-btn" data-action="add-trip">+ Añadir trayecto</button>
        </div>
      </div>`;
  }).join('');
}

function renderTripRow(day, trip) {
  const car = state.cars.find((c) => c.id === trip.carId);
  if (!car) {
    return `<div class="trip-row"><em class="hint">Coche eliminado. <button type="button" class="icon-btn danger" data-action="remove-trip" data-trip-id="${trip.id}">🗑</button></em></div>`;
  }
  const driver = state.people.find((p) => p.id === car.driverId);
  const cost = computeTripDisplayCost(trip);
  const nameOf = (id) => (state.people.find((p) => p.id === id) || {}).name;
  const outboundNames = (trip.passengerIds || []).map(nameOf).filter(Boolean);
  const driverSuffix = state.driverPays ? ` + ${esc(driver ? driver.name : 'conductor')} (conductor)` : '';

  let peopleHTML;
  if (trip.roundTrip) {
    const returnIds = trip.returnPassengerIds || trip.passengerIds || [];
    const returnNames = returnIds.map(nameOf).filter(Boolean);
    const sameBothWays = JSON.stringify([...(trip.passengerIds || [])].sort()) === JSON.stringify([...returnIds].sort());
    peopleHTML = sameBothWays
      ? `<strong>Con:</strong> ${outboundNames.length ? esc(outboundNames.join(', ')) : 'nadie más marcado'}${driverSuffix} (ida y vuelta)`
      : `<strong>Ida:</strong> ${outboundNames.length ? esc(outboundNames.join(', ')) : 'nadie más marcado'}${driverSuffix}<br>
         <strong>Vuelta:</strong> ${returnNames.length ? esc(returnNames.join(', ')) : 'nadie más marcado'}${driverSuffix}`;
  } else {
    peopleHTML = `<strong>Con:</strong> ${outboundNames.length ? esc(outboundNames.join(', ')) : 'nadie más marcado'}${driverSuffix}`;
  }

  const metaKm = trip.roundTrip ? `${formatKm(trip.km)} × 2 (ida y vuelta)` : formatKm(trip.km);

  return `
    <div class="trip-row" data-trip-id="${trip.id}">
      <div class="trip-row-top">
        <div>
          <div class="trip-row-car">🚗 ${esc(car.name)}</div>
          <div class="trip-row-meta">${esc(metaKm)} · conduce ${esc(driver ? driver.name : '—')}</div>
        </div>
        <div class="trip-row-cost">${esc(formatEUR(cost))}</div>
      </div>
      <div class="trip-row-people">${peopleHTML}</div>
      <div class="trip-row-buttons">
        <button type="button" class="btn btn-secondary btn-sm" data-action="edit-trip">Editar</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="duplicate-trip">Duplicar</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="remove-trip">Eliminar</button>
      </div>
    </div>`;
}

qs('#dayList').addEventListener('click', (e) => {
  const dayCard = e.target.closest('.day-card');
  if (!dayCard) return;
  const dayId = dayCard.dataset.dayId;
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;

  if (action === 'remove-day') return removeDay(dayId);
  if (action === 'copy-day') return copyPreviousDay(dayId);
  if (action === 'add-trip') return openTripModal(dayId, null);
  if (action === 'edit-trip') return openTripModal(dayId, e.target.closest('.trip-row').dataset.tripId);
  if (action === 'duplicate-trip') return duplicateTrip(dayId, e.target.closest('.trip-row').dataset.tripId);
  if (action === 'remove-trip') return removeTrip(dayId, e.target.closest('.trip-row')?.dataset.tripId || e.target.dataset.tripId);
});

function cloneTrip(t) {
  return {
    id: uid(),
    carId: t.carId,
    km: t.km,
    savedTripId: t.savedTripId || null,
    passengerIds: [...(t.passengerIds || [])],
    roundTrip: !!t.roundTrip,
    returnPassengerIds: t.roundTrip ? [...(t.returnPassengerIds || t.passengerIds || [])] : undefined
  };
}

function duplicateTrip(dayId, tripId) {
  const day = state.period.days.find((d) => d.id === dayId);
  const trip = day.trips.find((t) => t.id === tripId);
  if (!trip) return;
  const clone = cloneTrip(trip);
  const idx = day.trips.indexOf(trip);
  day.trips.splice(idx + 1, 0, clone);
  saveState();
  renderRegistro();
  showToast('Trayecto duplicado');
}

function removeTrip(dayId, tripId) {
  const day = state.period.days.find((d) => d.id === dayId);
  if (!day) return;
  const idx = day.trips.findIndex((t) => t.id === tripId);
  if (idx === -1) return;
  const [removed] = day.trips.splice(idx, 1);
  saveState();
  renderRegistro();

  showUndoToast('Trayecto eliminado', () => {
    day.trips.splice(idx, 0, removed);
    saveState();
    renderRegistro();
  });
}

/* -------- Modal de trayecto (añadir / editar) -------- */

function openTripModal(dayId, tripId, batchDates) {
  if (state.cars.length === 0) { showToast('Añade primero un coche en Configuración'); return; }
  const day = dayId ? state.period.days.find((d) => d.id === dayId) : null;
  const editing = (!batchDates && tripId) ? day.trips.find((t) => t.id === tripId) : null;

  // Al añadir un trayecto nuevo (no al editar uno existente), precargamos el
  // último coche/trayecto guardado que se usó: casi siempre es el mismo día tras día.
  const lastTrip = state.lastTrip;
  const selection = {
    carId: editing ? editing.carId
      : (lastTrip && state.cars.some((c) => c.id === lastTrip.carId) ? lastTrip.carId : state.cars[0].id),
    savedTripId: editing ? editing.savedTripId
      : (lastTrip && lastTrip.savedTripId && state.savedTrips.some((s) => s.id === lastTrip.savedTripId) ? lastTrip.savedTripId : null),
    km: null,
    passengerIds: editing ? [...editing.passengerIds] : [],
    roundTrip: editing ? !!editing.roundTrip : false,
    returnPassengerIds: editing ? [...(editing.returnPassengerIds || editing.passengerIds || [])] : []
  };
  if (editing) {
    selection.km = editing.km;
  } else if (selection.savedTripId) {
    selection.km = (state.savedTrips.find((s) => s.id === selection.savedTripId) || {}).km || null;
  } else if (lastTrip && lastTrip.km) {
    selection.km = lastTrip.km;
  }

  // Si al editar la ida y la vuelta llevaban la misma gente, arrancamos con la
  // vista simple (una sola lista); si eran distintas, mostramos las dos de entrada.
  let sameReturnUI = true;
  if (editing && editing.roundTrip) {
    const sortedOut = [...(editing.passengerIds || [])].sort();
    const sortedRet = [...(editing.returnPassengerIds || editing.passengerIds || [])].sort();
    sameReturnUI = JSON.stringify(sortedOut) === JSON.stringify(sortedRet);
  }

  let step = 1;

  qs('#modalOverlay').classList.remove('hidden');
  renderStep();

  function stepDone(n) {
    if (n === 1) return !!selection.carId;
    if (n === 2) return !!selection.km;
    return false;
  }

  function renderStep() {
    qs('#modalTitle').textContent = batchDates ? `Añadir trayecto a ${batchDates.length} día(s)` : (editing ? 'Editar trayecto' : 'Añadir trayecto');

    const stepsHtml = `<div class="wizard-steps">${[1, 2, 3].map((n) => `
      <button type="button" class="wizard-dot ${step === n ? 'active' : ''} ${step !== n && stepDone(n) ? 'done' : ''}" data-step="${n}">${n}</button>
    `).join('')}</div>`;

    let bodyHtml;
    if (step === 1) {
      bodyHtml = `
        <h3 class="wizard-title">Paso 1 de 3 · ¿Qué coche?</h3>
        <div class="wizard-options">
          ${state.cars.map((c) => {
            const driver = state.people.find((p) => p.id === c.driverId);
            return `
            <button type="button" class="wizard-option ${selection.carId === c.id ? 'selected' : ''}" data-car-id="${c.id}">
              <span class="wizard-option-title">🚗 ${esc(c.name)}</span>
              <span class="wizard-option-sub">Conduce ${esc(driver ? driver.name : '—')} · ${c.consumption} L/100km</span>
            </button>`;
          }).join('')}
        </div>`;
    } else if (step === 2) {
      bodyHtml = `
        <h3 class="wizard-title">Paso 2 de 3 · ¿Cuántos km?</h3>
        <label class="field-toggle" style="margin-bottom:14px;">
          <input type="checkbox" id="roundTripToggle" ${selection.roundTrip ? 'checked' : ''}>
          <span>🔁 Es de ida y vuelta</span>
        </label>
        ${state.savedTrips.length ? `
          <p class="hint" style="margin:0 0 8px;">Trayectos guardados:</p>
          <div class="wizard-chip-row">
            ${state.savedTrips.map((s) => `<button type="button" class="wizard-chip ${selection.savedTripId === s.id ? 'selected' : ''}" data-saved-id="${s.id}">${esc(s.name)} · ${s.km} km</button>`).join('')}
          </div>
          <p class="hint" style="margin:14px 0 8px;">O introduce los km a mano:</p>
        ` : ''}
        <div class="row-inline">
          <input type="number" id="wizardKmInput" class="input" inputmode="decimal" step="0.1" min="0" value="${selection.km || ''}" placeholder="15">
          <button type="button" class="btn btn-primary" id="wizardKmNextBtn">Siguiente</button>
        </div>
        <p class="hint" style="margin:10px 0 0;">${selection.roundTrip ? 'Introduce los km de un solo trayecto: el coste se calcula ×2 automáticamente.' : 'Km de este trayecto (un solo sentido).'}</p>`;
    } else {
      const car = state.cars.find((c) => c.id === selection.carId);
      const driver = car ? state.people.find((p) => p.id === car.driverId) : null;
      const passengerCandidates = state.people.filter((p) => p.id !== (car ? car.driverId : null));

      const renderPassengerCheckboxes = (checkedIds) => passengerCandidates.length
        ? passengerCandidates.map((p) => `
            <label class="checkbox-row">
              <input type="checkbox" value="${p.id}" ${checkedIds.includes(p.id) ? 'checked' : ''}>
              <span>${esc(p.name)}</span>
            </label>`).join('')
        : '<p class="hint">No hay más personas que el conductor. Añade personas en Configuración.</p>';

      bodyHtml = `
        <h3 class="wizard-title">Paso 3 de 3 · ${selection.roundTrip ? '¿Quién iba a la ida?' : '¿Quién iba?'}</h3>
        <p class="hint" style="margin:0 0 10px;">Aparte del conductor (${esc(driver ? driver.name : '—')}).</p>
        <div class="checkbox-grid" id="wizardOutboundPassengers">${renderPassengerCheckboxes(selection.passengerIds)}</div>
        ${selection.roundTrip ? `
          <label class="field-toggle" style="margin:14px 0 6px;">
            <input type="checkbox" id="sameReturnToggle" ${sameReturnUI ? 'checked' : ''}>
            <span>Los mismos pasajeros a la vuelta</span>
          </label>
          <div id="wizardReturnSection" class="${sameReturnUI ? 'hidden' : ''}">
            <p class="hint" style="margin:8px 0 6px;">¿Quién iba a la vuelta?</p>
            <div class="checkbox-grid" id="wizardReturnPassengers">${renderPassengerCheckboxes(selection.returnPassengerIds)}</div>
          </div>
        ` : ''}
        <button type="button" class="btn btn-primary btn-block mt-8" id="wizardSaveBtn">${batchDates ? `Añadir a ${batchDates.length} día(s)` : (editing ? 'Guardar cambios' : 'Guardar trayecto')}</button>`;
    }

    const backHtml = step > 1 ? `<button type="button" class="btn btn-secondary btn-block mt-8" id="wizardBackBtn">← Atrás</button>` : '';

    const modalBodyEl = qs('#modalBody');
    modalBodyEl.innerHTML = stepsHtml + bodyHtml + backHtml;
    modalBodyEl.classList.remove('step-anim');
    void modalBodyEl.offsetWidth; // fuerza reflow para reiniciar la animación en cada paso
    modalBodyEl.classList.add('step-anim');
    bindEvents();
  }

  function bindEvents() {
    qsa('.wizard-dot').forEach((btn) => btn.addEventListener('click', () => {
      step = Number(btn.dataset.step);
      renderStep();
    }));

    if (step === 1) {
      qsa('.wizard-option').forEach((btn) => btn.addEventListener('click', () => {
        selection.carId = btn.dataset.carId;
        const newCar = state.cars.find((c) => c.id === selection.carId);
        selection.passengerIds = selection.passengerIds.filter((id) => id !== newCar.driverId);
        selection.returnPassengerIds = selection.returnPassengerIds.filter((id) => id !== newCar.driverId);
        step = 2;
        renderStep();
      }));
    } else if (step === 2) {
      qs('#roundTripToggle').addEventListener('change', (e) => {
        selection.roundTrip = e.target.checked;
        if (selection.roundTrip) {
          sameReturnUI = true;
          if (selection.returnPassengerIds.length === 0) selection.returnPassengerIds = [...selection.passengerIds];
        }
        renderStep();
      });
      qsa('.wizard-chip').forEach((btn) => btn.addEventListener('click', () => {
        const saved = state.savedTrips.find((s) => s.id === btn.dataset.savedId);
        selection.savedTripId = saved.id;
        selection.km = saved.km;
        step = 3;
        renderStep();
      }));
      qs('#wizardKmNextBtn').addEventListener('click', () => {
        const val = parseFloat(qs('#wizardKmInput').value);
        if (!val || val <= 0) { showToast('Introduce unos km válidos'); return; }
        selection.km = val;
        selection.savedTripId = null;
        step = 3;
        renderStep();
      });
    } else {
      if (selection.roundTrip) {
        qs('#sameReturnToggle').addEventListener('change', (e) => {
          sameReturnUI = e.target.checked;
          const currentOutbound = qsa('#wizardOutboundPassengers input[type="checkbox"]:checked').map((cb) => cb.value);
          selection.passengerIds = currentOutbound;
          // Tanto al activar como al desactivar "mismos pasajeros" partimos de una
          // copia de la ida: es más rápido ajustar una diferencia puntual que
          // marcar la vuelta entera desde cero.
          selection.returnPassengerIds = [...currentOutbound];
          renderStep();
        });
      }

      qs('#wizardSaveBtn').addEventListener('click', () => {
        const passengerIds = qsa('#wizardOutboundPassengers input[type="checkbox"]:checked').map((cb) => cb.value);
        const returnPassengerIds = selection.roundTrip
          ? (sameReturnUI ? [...passengerIds] : qsa('#wizardReturnPassengers input[type="checkbox"]:checked').map((cb) => cb.value))
          : undefined;
        selection.passengerIds = passengerIds;
        selection.returnPassengerIds = returnPassengerIds || [];
        state.lastTrip = { carId: selection.carId, savedTripId: selection.savedTripId, km: selection.km };

        const tripData = {
          carId: selection.carId,
          km: selection.km,
          passengerIds,
          savedTripId: selection.savedTripId,
          roundTrip: selection.roundTrip,
          returnPassengerIds
        };

        if (batchDates && batchDates.length) {
          batchDates.forEach((date) => {
            let d = state.period.days.find((dd) => dd.date === date);
            if (!d) { d = { id: uid(), date, trips: [] }; state.period.days.push(d); }
            d.trips.push({ id: uid(), ...tripData });
          });
          saveState();
          closeModal();
          exitMultiSelect();
          renderRegistro();
          updatePeriodBadge();
          showToast(`Trayecto añadido a ${batchDates.length} día(s)`);
          return;
        }

        if (editing) {
          Object.assign(editing, tripData);
        } else {
          day.trips.push({ id: uid(), ...tripData });
        }
        saveState();
        closeModal();
        renderRegistro();
        showToast('Trayecto guardado');
      });
    }

    if (step > 1) {
      qs('#wizardBackBtn').addEventListener('click', () => { step -= 1; renderStep(); });
    }
  }
}

/* =====================================================================
   RENDER: RESUMEN
   ===================================================================== */

function renderSummaryBlocksHTML(summary) {
  if (summary.tripCount === 0) {
    return `<p class="empty-state">Este periodo todavía no tiene trayectos registrados.</p>`;
  }

  const carsHTML = summary.perCar.map((c) => `
    <div class="summary-item">
      <div>
        <div class="summary-item-name">🚗 ${esc(c.name)}</div>
        <div class="summary-item-sub">Conduce ${esc(c.driverName)} · ${esc(formatKm(c.totalKm))} · ${c.tripCount} trayecto(s)</div>
      </div>
      <div class="summary-item-value">${esc(formatEUR(c.totalCost))}</div>
    </div>`).join('');

  const peopleHTML = summary.perPerson.map((p) => `
    <div class="summary-item">
      <div class="summary-item-name">${esc(p.name)}</div>
      <div class="summary-item-value">${esc(formatEUR(p.share))}</div>
    </div>`).join('');

  const debtRowHTML = (d) => `
    <div class="debt-item">
      <span>${esc(d.from)}</span>
      <span class="debt-arrow">→</span>
      <span>${esc(d.to)}</span>
      <span class="debt-amount">${esc(formatEUR(d.amount))}</span>
    </div>`;

  const pairwiseHTML = (summary.pairwiseDebts || []).length
    ? summary.pairwiseDebts.map(debtRowHTML).join('')
    : `<p class="empty-state">Nadie debe nada a nadie 🎉</p>`;

  return `
    <div class="card">
      <h2>Gasto por coche</h2>
      <div class="summary-list">${carsHTML}</div>
    </div>
    <div class="card">
      <h2>Consumo por persona</h2>
      <div class="summary-list">${peopleHTML}</div>
    </div>
    <div class="card">
      <h2>Deudas</h2>
      <p class="hint" style="margin:0 0 10px;">Quién le debe a quién, persona a persona.</p>
      <div class="summary-list">${pairwiseHTML}</div>
    </div>`;
}

function renderResumen() {
  const summary = computePeriodSummary(state.period);
  const days = getSortedDays(state.period);
  const range = days.length ? (days[0].date === days[days.length - 1].date
    ? formatDateShort(days[0].date)
    : `${formatDateShort(days[0].date)} - ${formatDateShort(days[days.length - 1].date)}`) : 'sin días';

  const hero = `
    <div class="summary-hero">
      <div class="summary-hero-label">TOTAL DEL PERIODO (${esc(range)})</div>
      <div class="summary-hero-value">${esc(formatEUR(summary.totalCost))}</div>
      <div class="summary-hero-sub">${summary.dayCount} día(s) con trayectos · ${summary.tripCount} trayecto(s)</div>
    </div>`;

  const actions = `
    <div class="summary-actions">
      <button type="button" class="btn btn-primary" id="shareSummaryBtn">📤 Compartir resumen</button>
      <button type="button" class="btn btn-secondary" id="closePeriodBtn">✅ Cerrar periodo y empezar uno nuevo</button>
    </div>`;

  qs('#summaryContent').innerHTML = hero + renderSummaryBlocksHTML(summary) + actions;

  qs('#shareSummaryBtn').addEventListener('click', () => shareSummary(summary, range));
  qs('#closePeriodBtn').addEventListener('click', () => closePeriod(summary, range));
}

function buildShareText(summary, range) {
  const lines = [];
  lines.push(`⛽ Gastos Coche — Periodo ${range}`);
  lines.push('');
  lines.push(`Total: ${formatEUR(summary.totalCost)}`);
  if (summary.perCar.length) {
    lines.push('');
    lines.push('Por coche:');
    summary.perCar.forEach((c) => lines.push(`- ${c.name} (${c.driverName}): ${formatEUR(c.totalCost)}`));
  }
  if (summary.perPerson.length) {
    lines.push('');
    lines.push('Consumo por persona:');
    summary.perPerson.forEach((p) => lines.push(`- ${p.name}: ${formatEUR(p.share)}`));
  }
  lines.push('');
  if ((summary.pairwiseDebts || []).length) {
    lines.push('Deudas:');
    summary.pairwiseDebts.forEach((d) => lines.push(`- ${d.from} debe ${formatEUR(d.amount)} a ${d.to}`));
  } else {
    lines.push('No hay deudas pendientes.');
  }
  return lines.join('\n');
}

async function shareSummary(summary, range) {
  if (summary.tripCount === 0) { showToast('No hay nada que compartir todavía'); return; }
  const text = buildShareText(summary, range);
  if (navigator.share) {
    try { await navigator.share({ title: 'Gastos Coche', text }); return; } catch (e) { /* cancelado, seguimos con fallback */ }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); showToast('Resumen copiado al portapapeles'); return; } catch (e) { /* sigue al prompt */ }
  }
  window.prompt('Copia el resumen:', text);
}

function closePeriod(summary, range) {
  if (summary.tripCount === 0) {
    if (!confirm('El periodo está vacío. ¿Cerrarlo igualmente y empezar uno nuevo?')) return;
  } else if (!confirm(`¿Cerrar el periodo (${range}) y guardarlo en el historial? Empezarás uno nuevo vacío.`)) {
    return;
  }

  state.history.unshift({
    id: uid(),
    closedAt: todayISO(),
    range,
    startDate: getSortedDays(state.period)[0]?.date || null,
    endDate: getSortedDays(state.period).slice(-1)[0]?.date || null,
    summary
  });
  state.period = { id: uid(), createdAt: todayISO(), days: [] };
  saveState();
  renderRegistro();
  updatePeriodBadge();
  switchTab('registro');
  showToast('Periodo cerrado y guardado en el historial');
}

/* =====================================================================
   RENDER: HISTORIAL
   ===================================================================== */

function renderHistorial() {
  const aggregateContainer = qs('#historyAggregate');
  const heading = qs('#historyListHeading');
  const clearBtn = qs('#clearHistoryBtn');

  clearBtn.classList.toggle('hidden', state.history.length === 0);

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
      ${renderSummaryBlocksHTML(aggregate)}`;
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
    if (!confirm('¿Eliminar este periodo del historial? No se puede deshacer.')) return;
    state.history = state.history.filter((h) => h.id !== id);
    saveState();
    renderHistorial();
  }
});

qs('#clearHistoryBtn').addEventListener('click', () => {
  if (!confirm('¿Borrar TODO el historial? Se perderán los totales acumulados de todos los periodos cerrados. Esta acción no se puede deshacer.')) return;
  state.history = [];
  saveState();
  renderHistorial();
  showToast('Historial borrado');
});

/* =====================================================================
   CONFIGURACIÓN: Personas
   ===================================================================== */

function renderPeople() {
  const list = qs('#peopleList');
  qs('#peopleEmptyState').classList.toggle('hidden', state.people.length > 0);
  list.innerHTML = state.people.map((p) => {
    const drivesCarNames = state.cars.filter((c) => c.driverId === p.id).map((c) => c.name);
    return `
    <div class="item-row" data-id="${p.id}">
      <div class="item-row-main">
        <div class="item-row-title">${esc(p.name)}</div>
        ${drivesCarNames.length ? `<div class="item-row-sub">Conduce: ${esc(drivesCarNames.join(', '))}</div>` : ''}
      </div>
      <div class="item-row-actions">
        <button type="button" class="icon-btn" data-action="edit-person">✏️</button>
        <button type="button" class="icon-btn danger" data-action="delete-person">🗑</button>
      </div>
    </div>`;
  }).join('');
}

qs('#addPersonBtn').addEventListener('click', () => openPersonModal(null));

qs('#peopleList').addEventListener('click', (e) => {
  const row = e.target.closest('.item-row');
  if (!row) return;
  const action = e.target.closest('[data-action]')?.dataset.action;
  const person = state.people.find((p) => p.id === row.dataset.id);
  if (action === 'edit-person') openPersonModal(person);
  if (action === 'delete-person') deletePerson(person);
});

function openPersonModal(person) {
  const html = `
    <label class="field">
      <span>Nombre</span>
      <input type="text" id="personNameInput" class="input" value="${person ? esc(person.name) : ''}" placeholder="Ej. Ana" autofocus>
    </label>
    <button type="button" class="btn btn-primary btn-block" id="personSaveBtn">Guardar</button>
  `;
  openModal(person ? 'Editar persona' : 'Añadir persona', html);
  qs('#personSaveBtn').addEventListener('click', () => {
    const name = qs('#personNameInput').value.trim();
    if (!name) { showToast('Escribe un nombre'); return; }
    if (person) {
      person.name = name;
    } else {
      state.people.push({ id: uid(), name });
    }
    saveState();
    closeModal();
    renderPeople();
    renderCars();
    showToast('Guardado');
  });
}

function deletePerson(person) {
  const drivesAnyCar = state.cars.some((c) => c.driverId === person.id);
  if (drivesAnyCar) { showToast('Esta persona conduce un coche. Cambia el conductor antes de borrarla.'); return; }
  if (!confirm(`¿Eliminar a ${person.name}? Se quitará de los trayectos donde apareciera.`)) return;
  state.people = state.people.filter((p) => p.id !== person.id);
  state.period.days.forEach((day) => day.trips.forEach((t) => { t.passengerIds = t.passengerIds.filter((id) => id !== person.id); }));
  saveState();
  renderPeople();
  renderRegistro();
}

/* =====================================================================
   CONFIGURACIÓN: Coches
   ===================================================================== */

function renderCars() {
  const list = qs('#carsList');
  qs('#carsEmptyState').classList.toggle('hidden', state.cars.length > 0);
  list.innerHTML = state.cars.map((c) => {
    const driver = state.people.find((p) => p.id === c.driverId);
    const priceLabel = c.useOwnPrice && c.ownPrice ? `${c.ownPrice} €/L propio` : 'precio general';
    return `
    <div class="item-row" data-id="${c.id}">
      <div class="item-row-main">
        <div class="item-row-title">🚗 ${esc(c.name)}</div>
        <div class="item-row-sub">Conductor: ${esc(driver ? driver.name : '—')} · ${c.consumption} L/100km · ${esc(priceLabel)}</div>
      </div>
      <div class="item-row-actions">
        <button type="button" class="icon-btn" data-action="edit-car">✏️</button>
        <button type="button" class="icon-btn danger" data-action="delete-car">🗑</button>
      </div>
    </div>`;
  }).join('');
}

qs('#addCarBtn').addEventListener('click', () => {
  if (state.people.length === 0) { showToast('Añade primero alguna persona'); return; }
  openCarModal(null);
});

qs('#carsList').addEventListener('click', (e) => {
  const row = e.target.closest('.item-row');
  if (!row) return;
  const action = e.target.closest('[data-action]')?.dataset.action;
  const car = state.cars.find((c) => c.id === row.dataset.id);
  if (action === 'edit-car') openCarModal(car);
  if (action === 'delete-car') deleteCar(car);
});

function openCarModal(car) {
  const peopleOptions = state.people.map((p) => `<option value="${p.id}" ${car && car.driverId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const html = `
    <label class="field">
      <span>Nombre del coche</span>
      <input type="text" id="carNameInput" class="input" value="${car ? esc(car.name) : ''}" placeholder="Ej. Coche de Ana">
    </label>
    <label class="field">
      <span>Conductor</span>
      <select id="carDriverSelect" class="input">${peopleOptions}</select>
    </label>
    <label class="field">
      <span>Consumo (L/100km)</span>
      <input type="number" id="carConsumptionInput" class="input" inputmode="decimal" step="0.1" min="0" value="${car ? car.consumption : ''}" placeholder="6.5">
    </label>
    <label class="field-toggle" style="margin-bottom:10px;">
      <input type="checkbox" id="carUseOwnPriceToggle" ${car && car.useOwnPrice ? 'checked' : ''}>
      <span>Usar un precio de gasolina propio</span>
    </label>
    <label class="field ${car && car.useOwnPrice ? '' : 'hidden'}" id="carOwnPriceField">
      <span>Precio propio (€/L)</span>
      <input type="number" id="carOwnPriceInput" class="input" inputmode="decimal" step="0.001" min="0" value="${car && car.ownPrice ? car.ownPrice : ''}" placeholder="1.700">
    </label>
    <button type="button" class="btn btn-primary btn-block" id="carSaveBtn">Guardar</button>
  `;
  openModal(car ? 'Editar coche' : 'Añadir coche', html);

  qs('#carUseOwnPriceToggle').addEventListener('change', (e) => {
    qs('#carOwnPriceField').classList.toggle('hidden', !e.target.checked);
  });

  qs('#carSaveBtn').addEventListener('click', () => {
    const name = qs('#carNameInput').value.trim();
    const driverId = qs('#carDriverSelect').value;
    const consumption = parseFloat(qs('#carConsumptionInput').value);
    const useOwnPrice = qs('#carUseOwnPriceToggle').checked;
    const ownPrice = parseFloat(qs('#carOwnPriceInput').value) || null;
    if (!name) { showToast('Escribe un nombre para el coche'); return; }
    if (!driverId) { showToast('Elige un conductor'); return; }
    if (!consumption || consumption <= 0) { showToast('Introduce un consumo válido'); return; }
    if (useOwnPrice && (!ownPrice || ownPrice <= 0)) { showToast('Introduce un precio propio válido'); return; }

    if (car) {
      Object.assign(car, { name, driverId, consumption, useOwnPrice, ownPrice: useOwnPrice ? ownPrice : null });
    } else {
      state.cars.push({ id: uid(), name, driverId, consumption, useOwnPrice, ownPrice: useOwnPrice ? ownPrice : null });
    }
    saveState();
    closeModal();
    renderCars();
    renderPeople();
    renderRegistro();
    showToast('Guardado');
  });
}

function deleteCar(car) {
  const usedInPeriod = state.period.days.some((day) => day.trips.some((t) => t.carId === car.id));
  if (usedInPeriod) { showToast('Este coche tiene trayectos en el periodo actual. Elimínalos primero.'); return; }
  if (!confirm(`¿Eliminar el coche "${car.name}"?`)) return;
  state.cars = state.cars.filter((c) => c.id !== car.id);
  saveState();
  renderCars();
  renderPeople();
}

/* =====================================================================
   CONFIGURACIÓN: Precio global y opción conductor paga
   ===================================================================== */

function renderConfigMisc() {
  qs('#globalPriceInput').value = state.globalPrice;
  qs('#driverPaysToggle').checked = state.driverPays;
}

qs('#globalPriceInput').addEventListener('change', (e) => {
  const val = parseFloat(e.target.value);
  state.globalPrice = (val && val > 0) ? val : 0;
  saveState();
  renderRegistro();
});

qs('#driverPaysToggle').addEventListener('change', (e) => {
  state.driverPays = e.target.checked;
  saveState();
  renderRegistro();
});

/* =====================================================================
   CONFIGURACIÓN: Trayectos guardados
   ===================================================================== */

function renderSavedTrips() {
  const list = qs('#savedTripsList');
  qs('#savedTripsEmptyState').classList.toggle('hidden', state.savedTrips.length > 0);
  list.innerHTML = state.savedTrips.map((s) => `
    <div class="item-row" data-id="${s.id}">
      <div class="item-row-main">
        <div class="item-row-title">${esc(s.name)}</div>
        <div class="item-row-sub">${esc(formatKm(s.km))}</div>
      </div>
      <div class="item-row-actions">
        <button type="button" class="icon-btn" data-action="edit-saved">✏️</button>
        <button type="button" class="icon-btn danger" data-action="delete-saved">🗑</button>
      </div>
    </div>`).join('');
}

qs('#addSavedTripBtn').addEventListener('click', () => openSavedTripModal(null));

qs('#savedTripsList').addEventListener('click', (e) => {
  const row = e.target.closest('.item-row');
  if (!row) return;
  const action = e.target.closest('[data-action]')?.dataset.action;
  const trip = state.savedTrips.find((s) => s.id === row.dataset.id);
  if (action === 'edit-saved') openSavedTripModal(trip);
  if (action === 'delete-saved') deleteSavedTrip(trip);
});

function openSavedTripModal(trip) {
  const html = `
    <label class="field">
      <span>Nombre del trayecto</span>
      <input type="text" id="savedNameInput" class="input" value="${trip ? esc(trip.name) : ''}" placeholder="Ej. Casa → Instituto">
    </label>
    <label class="field">
      <span>Kilómetros</span>
      <input type="number" id="savedKmInput" class="input" inputmode="decimal" step="0.1" min="0" value="${trip ? trip.km : ''}" placeholder="15">
    </label>
    <button type="button" class="btn btn-primary btn-block" id="savedSaveBtn">Guardar</button>
  `;
  openModal(trip ? 'Editar trayecto guardado' : 'Añadir trayecto guardado', html);
  qs('#savedSaveBtn').addEventListener('click', () => {
    const name = qs('#savedNameInput').value.trim();
    const km = parseFloat(qs('#savedKmInput').value);
    if (!name) { showToast('Escribe un nombre'); return; }
    if (!km || km <= 0) { showToast('Introduce unos km válidos'); return; }
    if (trip) {
      trip.name = name; trip.km = km;
    } else {
      state.savedTrips.push({ id: uid(), name, km });
    }
    saveState();
    closeModal();
    renderSavedTrips();
    showToast('Guardado');
  });
}

function deleteSavedTrip(trip) {
  if (!confirm(`¿Eliminar "${trip.name}"?`)) return;
  state.savedTrips = state.savedTrips.filter((s) => s.id !== trip.id);
  saveState();
  renderSavedTrips();
}

/* =====================================================================
   CONFIGURACIÓN: Datos (exportar / importar / borrar)
   ===================================================================== */

qs('#exportDataBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gasolina-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Exportado');
});

qs('#importDataBtn').addEventListener('click', () => qs('#importFileInput').click());

qs('#importFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported || !Array.isArray(imported.people) || !Array.isArray(imported.cars)) throw new Error('Formato no reconocido');
      if (!confirm('Esto reemplazará todos los datos actuales por los del archivo importado. ¿Continuar?')) return;
      state = imported;
      if (!state.period) state.period = { id: uid(), createdAt: todayISO(), days: [] };
      if (!Array.isArray(state.history)) state.history = [];
      if (!Array.isArray(state.savedTrips)) state.savedTrips = [];
      saveState();
      renderAll();
      showToast('Datos importados');
    } catch (err) {
      showToast('El archivo no es válido');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

qs('#resetDataBtn').addEventListener('click', () => {
  if (!confirm('¿Borrar TODOS los datos (personas, coches, periodo actual e historial)? Esta acción no se puede deshacer.')) return;
  state = createDefaultState();
  saveState();
  renderAll();
  switchTab('registro');
  showToast('Datos borrados');
});

/* =====================================================================
   Tema (claro / oscuro / automático)
   ===================================================================== */

const THEME_ICONS = { auto: '🌓', light: '☀️', dark: '🌙' };
const THEME_LABELS = { auto: 'Automático (según el sistema)', light: 'Claro', dark: 'Oscuro' };

function applyTheme() {
  const root = document.documentElement;
  if (state.theme === 'auto') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', state.theme);
  }
  const btn = qs('#themeToggleBtn');
  btn.textContent = THEME_ICONS[state.theme];
  btn.setAttribute('aria-label', `Tema: ${THEME_LABELS[state.theme]}. Toca para cambiar.`);
}

function setupThemeToggle() {
  applyTheme();
  qs('#themeToggleBtn').addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    state.theme = order[(order.indexOf(state.theme) + 1) % order.length];
    saveState();
    applyTheme();
    showToast(`Tema: ${THEME_LABELS[state.theme]}`);
  });
}

/* =====================================================================
   Banner de instalación iOS
   ===================================================================== */

function setupIosBanner() {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const dismissed = localStorage.getItem('iosBannerDismissed') === '1';

  if (isIos && !isStandalone && !dismissed) {
    qs('#iosInstallBanner').classList.remove('hidden');
  }
  qs('#iosInstallDismiss').addEventListener('click', () => {
    qs('#iosInstallBanner').classList.add('hidden');
    localStorage.setItem('iosBannerDismissed', '1');
  });
}

/* =====================================================================
   Service worker
   ===================================================================== */

function showUpdateBanner(worker) {
  const banner = qs('#updateBanner');
  banner.classList.remove('hidden');
  qs('#updateReloadBtn').addEventListener('click', () => worker.postMessage('SKIP_WAITING'), { once: true });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');

      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker);
          }
        });
      });

      let reloadedForUpdate = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadedForUpdate) return;
        reloadedForUpdate = true;
        window.location.reload();
      });
    } catch (err) {
      console.warn('SW no registrado', err);
    }
  });
}

/* =====================================================================
   Arranque
   ===================================================================== */

function renderAll() {
  renderPeople();
  renderCars();
  renderSavedTrips();
  renderConfigMisc();
  renderRegistro();
  updatePeriodBadge();
}

setupThemeToggle();
renderAll();
setupIosBanner();
registerServiceWorker();
