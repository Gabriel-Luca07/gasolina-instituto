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
    theme: 'auto',
    pin: null
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
    if (!(/^\d{4}$/.test(parsed.pin))) parsed.pin = null;
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

let modalReturnFocusEl = null;

function getFocusable(container) {
  return qsa('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', container)
    .filter((el) => !el.disabled && el.getClientRects().length > 0);
}

function openModal(title, bodyHTML) {
  modalReturnFocusEl = document.activeElement;
  qs('#modalTitle').textContent = title;
  qs('#modalBody').innerHTML = bodyHTML;
  qs('#modalOverlay').classList.remove('hidden');
  // Foco al primer campo del modal para que el teclado (y lectores de
  // pantalla) entren directos en el contenido, sin tener que tabular desde
  // el botón que lo abrió.
  const focusables = getFocusable(qs('.modal-box'));
  (focusables[0] || qs('#modalClose')).focus();
}

function closeModal() {
  qs('#modalOverlay').classList.add('hidden');
  qs('#modalBody').innerHTML = '';
  if (modalReturnFocusEl && document.body.contains(modalReturnFocusEl)) modalReturnFocusEl.focus();
  modalReturnFocusEl = null;
}

qs('#modalClose').addEventListener('click', closeModal);
qs('#modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

// Atrapamos el foco dentro del modal (Tab/Shift+Tab no deben salir a la
// página de detrás) y permitimos cerrar con Escape, como se espera de
// cualquier diálogo accesible.
qs('#modalOverlay').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key !== 'Tab') return;
  const focusables = getFocusable(qs('.modal-box'));
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* --------------------------- Modal de confirmación --------------------------- */

function confirmModal({ title = 'Confirmar', message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, onConfirm }) {
  const html = `
    <p class="confirm-message">${esc(message)}</p>
    <div class="confirm-actions">
      <button type="button" class="btn btn-secondary btn-block" id="confirmCancelBtn">${esc(cancelLabel)}</button>
      <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" id="confirmOkBtn">${esc(confirmLabel)}</button>
    </div>`;
  openModal(title, html);
  // El foco por defecto (heredado de openModal) cae en "Cancelar", el primer
  // botón del cuerpo: es el comportamiento más seguro para una acción que
  // puede ser destructiva.
  qs('#confirmCancelBtn').addEventListener('click', closeModal);
  qs('#confirmOkBtn').addEventListener('click', () => { closeModal(); onConfirm(); });
}

/* -------------------------------- Tabs ---------------------------------- */

const TAB_ORDER = ['registro', 'resumen', 'config', 'historial'];

// Duraciones que deben coincidir con las de las animaciones CSS
// tabExitTo*/tabEnterFrom* (con un pequeño margen). Usamos setTimeout en vez
// de esperar al evento "animationend": si el usuario toca varias pestañas muy
// rápido, un mismo panel puede acabar con clases de salida Y de entrada a la
// vez, y por especificidad CSS gana la que no toca, disparando el evento
// "equivocado" y encadenando una transición detrás de otra sin parar.
const TAB_EXIT_MS = 170;
const TAB_ENTER_MS = 250;

let tabTransitionTimer = null;

function switchTab(tab) {
  const panels = qsa('.tab-panel');
  const targetPanel = panels.find((p) => p.dataset.tabPanel === tab);
  if (!targetPanel) return;

  // Si había una transición en curso, la cortamos en seco (sin terminar de
  // animar) para partir de un estado limpio antes de empezar la siguiente.
  if (tabTransitionTimer) { clearTimeout(tabTransitionTimer); tabTransitionTimer = null; }
  panels.forEach((p) => p.classList.remove('tab-exit-left', 'tab-exit-right', 'tab-enter-left', 'tab-enter-right'));

  // El botón activo se sincroniza SIEMPRE, incluso si salimos ya mismo
  // porque el panel destino ya está activo: si no, un toque rápido a varias
  // pestañas puede cancelar una transición a medias y dejar el botón
  // resaltado en una pestaña distinta a la que realmente se ve.
  qsa('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));

  const currentPanel = panels.find((p) => p.classList.contains('active'));
  if (targetPanel === currentPanel) return;

  const fromIndex = TAB_ORDER.indexOf(currentPanel ? currentPanel.dataset.tabPanel : tab);
  const toIndex = TAB_ORDER.indexOf(tab);
  const forward = toIndex >= fromIndex;

  const showTarget = () => {
    if (tab === 'resumen') renderResumen();
    if (tab === 'historial') renderHistorial();
    targetPanel.classList.add('active', forward ? 'tab-enter-right' : 'tab-enter-left');
    tabTransitionTimer = setTimeout(() => {
      targetPanel.classList.remove('tab-enter-right', 'tab-enter-left');
      tabTransitionTimer = null;
    }, TAB_ENTER_MS);
  };

  if (currentPanel) {
    currentPanel.classList.add(forward ? 'tab-exit-left' : 'tab-exit-right');
    tabTransitionTimer = setTimeout(() => {
      currentPanel.classList.remove('active', 'tab-exit-left', 'tab-exit-right');
      showTarget();
    }, TAB_EXIT_MS);
  } else {
    showTarget();
  }
}

qs('#tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (btn) switchTab(btn.dataset.tab);
});

/* -------- Deslizar con el dedo para cambiar de pestaña -------- */
// Compartida por el gesto táctil y los atajos de teclado: mueve a la pestaña
// anterior/siguiente según TAB_ORDER, sin salirse por los extremos.
function goToAdjacentTab(direction) {
  const currentTab = qs('.tab-btn.active')?.dataset.tab;
  const idx = TAB_ORDER.indexOf(currentTab);
  if (idx === -1) return;
  const nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= TAB_ORDER.length) return;
  switchTab(TAB_ORDER[nextIdx]);
}

(function setupSwipeNavigation() {
  const main = qs('#mainContent');
  const SWIPE_MIN_DISTANCE = 60; // px mínimos para contar como swipe, no como un toque tembloroso
  const SWIPE_MAX_OFF_AXIS_RATIO = 0.5; // el movimiento vertical no puede superar la mitad del horizontal
  const SWIPE_MAX_TIME = 700; // ms: pasado esto, es un gesto lento (arrastrar, no deslizar) y lo ignoramos
  let startX = 0, startY = 0, startTime = 0, tracking = false;

  main.addEventListener('touchstart', (e) => {
    tracking = false;
    if (!qs('#modalOverlay').classList.contains('hidden')) return;
    if (!qs('#lockScreen').classList.contains('hidden')) return;
    // El gráfico de Historial tiene su propio scroll horizontal, y los campos
    // de texto/número necesitan poder arrastrar el cursor sin que eso cambie
    // de pestaña.
    if (e.target.closest('.chart-bars, input, select, textarea')) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    startTime = Date.now();
    tracking = true;
  }, { passive: true });

  main.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    // En cuanto quede claro que el gesto es un scroll vertical (el caso más
    // común con diferencia), dejamos de vigilarlo: no hace falta esperar a
    // touchend para saber que esto no es un swipe de pestaña.
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) tracking = false;
  }, { passive: true });

  main.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const dt = Date.now() - startTime;
    if (dt > SWIPE_MAX_TIME) return;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return;
    if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_OFF_AXIS_RATIO) return;

    if (dx < 0) goToAdjacentTab(1); // dedo hacia la izquierda -> siguiente pestaña
    else goToAdjacentTab(-1); // dedo hacia la derecha -> pestaña anterior
  }, { passive: true });
})();

/* -------- Flechas del teclado para cambiar de pestaña (escritorio) -------- */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  // No interferir con mover el cursor dentro de un campo de texto/número,
  // ni mientras hay un modal o la pantalla de bloqueo por encima.
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  if (!qs('#modalOverlay').classList.contains('hidden')) return;
  if (!qs('#lockScreen').classList.contains('hidden')) return;
  goToAdjacentTab(e.key === 'ArrowRight' ? 1 : -1);
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

        // Reparto por "partes": quien no tenga un peso propio en trip.weights
        // cuenta como 1 parte (el reparto a partes iguales de siempre). Con
        // pesos iguales para todos esto da exactamente lo mismo que antes.
        const weights = trip.weights || {};
        const totalWeight = [...splitSet].reduce((sum, pid) => sum + (weights[pid] || 1), 0);

        splitSet.forEach((pid) => {
          const share = cost * (weights[pid] || 1) / totalWeight;
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

  // Pagos que alguien ha marcado como ya hechos (fuera de la app): restan de
  // lo que esa persona debía, igual que si hubiera pagado ese trayecto.
  (period.settlements || []).forEach((s) => {
    const key = `${s.fromId}|${s.toId}`;
    pairDebts.set(key, (pairDebts.get(key) || 0) - s.amount);
  });

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
    .map((p) => (p.amount > 0
      ? { from: p.aName, to: p.bName, fromId: p.aId, toId: p.bId, amount: p.amount }
      : { from: p.bName, to: p.aName, fromId: p.bId, toId: p.aId, amount: -p.amount }))
    .sort((a, b) => b.amount - a.amount);

  const totalKm = perCar.reduce((sum, c) => sum + (c.totalKm || 0), 0);

  return { totalCost, tripCount, dayCount, totalKm, perCar, perPerson, pairwiseBalances, pairwiseDebts };
}

function computeHistoryAggregate() {
  const totals = { totalCost: 0, tripCount: 0, dayCount: 0, totalKm: 0 };
  const carAgg = new Map();
  const personShare = new Map();
  const pairAgg = new Map(); // "aId|bId" (orden fijo) -> {aId,bId,aName,bName,amount}

  state.history.forEach((entry) => {
    const s = entry.summary || {};
    totals.totalCost += s.totalCost || 0;
    totals.tripCount += s.tripCount || 0;
    totals.dayCount += s.dayCount || 0;
    // Los periodos cerrados antes de tener este campo no lo llevan: lo
    // recalculamos sumando los km por coche, que sí existían desde el principio.
    totals.totalKm += (typeof s.totalKm === 'number' ? s.totalKm : (s.perCar || []).reduce((sum, c) => sum + (c.totalKm || 0), 0));

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
    confirmModal({ title: 'Copiar día anterior', message: 'Este día ya tiene trayectos. ¿Añadir también los del día anterior?', confirmLabel: 'Añadir', onConfirm: doCopy });
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
  const OPEN_PERIOD_WARN_DAYS = 10;
  const daysOpen = Math.round((parseISODate(todayISO()) - parseISODate(state.period.createdAt)) / 86400000);
  const staleWarning = daysOpen >= OPEN_PERIOD_WARN_DAYS
    ? `<div class="dashboard-stale-notice">⏳ Llevas ${daysOpen} días con este periodo abierto. Considera cerrarlo desde Resumen para no acumular demasiado.</div>`
    : '';

  el.innerHTML = `
    <div class="summary-hero-label">PRESUPUESTO DE ESTE PERIODO</div>
    <div class="summary-hero-value">${esc(formatEUR(summary.totalCost))}</div>
    <div class="summary-hero-sub">${summary.dayCount} día(s) · ${summary.tripCount} trayecto(s)${topDebt ? ` · ${esc(topDebt.from)} debe ${esc(formatEUR(topDebt.amount))} a ${esc(topDebt.to)}` : ''}</div>
    ${staleWarning}
    <button type="button" class="dashboard-link-btn" id="dashboardGoToResumenBtn">Ver resumen completo →</button>`;

  qs('#dashboardGoToResumenBtn').addEventListener('click', () => switchTab('resumen'));
}

// La primera vez que se abre la app (sin personas ni coches), el dashboard y
// los botones de "añadir día/trayecto" no sirven de nada todavía y solo
// confunden. En su lugar, se guía a crear primero una persona y luego un
// coche, paso a paso, antes de mostrar el Registro normal.
function renderOnboarding() {
  const card = qs('#onboardingCard');
  const needsPerson = state.people.length === 0;
  const needsCar = !needsPerson && state.cars.length === 0;
  const show = needsPerson || needsCar;

  card.classList.toggle('hidden', !show);
  qs('#registroDashboard').classList.toggle('hidden', show);
  qs('#addDayCard').classList.toggle('hidden', show);
  qs('#dayList').classList.toggle('hidden', show);
  if (show) qs('#registroEmptyState').classList.add('hidden');
  if (!show) return false;

  qs('#onboardingSteps').innerHTML = needsPerson ? `
    <p class="hint" style="margin:0 0 14px;">Para repartir gastos hacen falta al menos una persona y un coche. Empieza añadiendo a las personas del grupo (tú incluido/a).</p>
    <button type="button" class="btn btn-primary btn-block" id="onboardingAddPersonBtn">1️⃣ Añadir primera persona</button>
  ` : `
    <p class="hint" style="margin:0 0 14px;">Ya tienes gente en el grupo. Ahora añade el coche que vais a compartir (y quién lo conduce).</p>
    <button type="button" class="btn btn-primary btn-block" id="onboardingAddCarBtn">2️⃣ Añadir primer coche</button>
  `;
  if (needsPerson) {
    qs('#onboardingAddPersonBtn').addEventListener('click', () => openPersonModal(null));
  } else {
    qs('#onboardingAddCarBtn').addEventListener('click', () => openCarModal(null));
  }
  return true;
}

function renderRegistro() {
  if (renderOnboarding()) return;
  renderRegistroDashboard();
  renderQuickWeekdays();
  const container = qs('#dayList');
  const days = getSortedDays(state.period);
  qs('#registroEmptyState').classList.toggle('hidden', days.length > 0);

  container.innerHTML = days.map((day, idx) => {
    const dayCost = day.trips.reduce((sum, t) => sum + computeTripDisplayCost(t), 0);
    const tripsHTML = day.trips.length
      ? day.trips.map((trip, idx) => renderTripRow(day, trip, idx)).join('')
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

function renderTripRow(day, trip, idx) {
  const car = state.cars.find((c) => c.id === trip.carId);
  if (!car) {
    return `<div class="trip-row"><em class="hint">Coche eliminado. <button type="button" class="icon-btn danger" data-action="remove-trip" data-trip-id="${trip.id}">🗑</button></em></div>`;
  }
  const driver = state.people.find((p) => p.id === car.driverId);
  const cost = computeTripDisplayCost(trip);
  const nameWithWeight = (id) => {
    const name = (state.people.find((p) => p.id === id) || {}).name;
    if (!name) return null;
    const w = trip.weights && trip.weights[id];
    return w && w > 1 ? `${name} (×${w})` : name;
  };
  const outboundNames = (trip.passengerIds || []).map(nameWithWeight).filter(Boolean);
  const driverSuffix = state.driverPays ? ` + ${esc(driver ? driver.name : 'conductor')} (conductor)` : '';

  let peopleHTML;
  if (trip.roundTrip) {
    const returnIds = trip.returnPassengerIds || trip.passengerIds || [];
    const returnNames = returnIds.map(nameWithWeight).filter(Boolean);
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
        ${day.trips.length > 1 ? `
          <button type="button" class="icon-btn reorder-btn" data-action="move-trip-up" ${idx === 0 ? 'disabled' : ''} title="Subir">▲</button>
          <button type="button" class="icon-btn reorder-btn" data-action="move-trip-down" ${idx === day.trips.length - 1 ? 'disabled' : ''} title="Bajar">▼</button>
        ` : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-action="edit-trip">Editar</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="duplicate-trip">Duplicar</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="remove-trip">Eliminar</button>
      </div>
    </div>`;
}

function moveTrip(dayId, tripId, direction) {
  const day = state.period.days.find((d) => d.id === dayId);
  if (!day) return;
  const idx = day.trips.findIndex((t) => t.id === tripId);
  const targetIdx = idx + direction;
  if (idx === -1 || targetIdx < 0 || targetIdx >= day.trips.length) return;
  [day.trips[idx], day.trips[targetIdx]] = [day.trips[targetIdx], day.trips[idx]];
  saveState();
  renderRegistro();
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
  if (action === 'move-trip-up') return moveTrip(dayId, e.target.closest('.trip-row').dataset.tripId, -1);
  if (action === 'move-trip-down') return moveTrip(dayId, e.target.closest('.trip-row').dataset.tripId, 1);
});

function cloneTrip(t) {
  return {
    id: uid(),
    carId: t.carId,
    km: t.km,
    savedTripId: t.savedTripId || null,
    passengerIds: [...(t.passengerIds || [])],
    roundTrip: !!t.roundTrip,
    returnPassengerIds: t.roundTrip ? [...(t.returnPassengerIds || t.passengerIds || [])] : undefined,
    weights: t.weights ? { ...t.weights } : undefined
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
  // último coche/trayecto/pasajeros que se usaron: casi siempre es el mismo
  // grupo de gente día tras día.
  const lastTrip = state.lastTrip;
  const validLastPassengers = (ids) => (Array.isArray(ids) ? ids.filter((id) => state.people.some((p) => p.id === id)) : []);
  const selection = {
    carId: editing ? editing.carId
      : (lastTrip && state.cars.some((c) => c.id === lastTrip.carId) ? lastTrip.carId : state.cars[0].id),
    savedTripId: editing ? editing.savedTripId
      : (lastTrip && lastTrip.savedTripId && state.savedTrips.some((s) => s.id === lastTrip.savedTripId) ? lastTrip.savedTripId : null),
    km: null,
    passengerIds: editing ? [...editing.passengerIds] : validLastPassengers(lastTrip && lastTrip.passengerIds),
    roundTrip: editing ? !!editing.roundTrip : !!(lastTrip && lastTrip.roundTrip),
    returnPassengerIds: editing ? [...(editing.returnPassengerIds || editing.passengerIds || [])] : validLastPassengers(lastTrip && lastTrip.returnPassengerIds),
    // Por defecto el coste se reparte a partes iguales (sin entradas en
    // weights); el toggle "repartir en partes distintas" es opcional y solo
    // se activa de entrada si el trayecto que se edita ya tenía pesos.
    useWeights: editing ? !!(editing.weights && Object.keys(editing.weights).length) : false,
    weights: editing && editing.weights ? { ...editing.weights } : {}
  };
  if (editing) {
    selection.km = editing.km;
  } else if (selection.savedTripId) {
    selection.km = (state.savedTrips.find((s) => s.id === selection.savedTripId) || {}).km || null;
  } else if (lastTrip && lastTrip.km) {
    selection.km = lastTrip.km;
  }

  // Si la ida y la vuelta llevaban la misma gente (al editar, o en el último
  // trayecto usado como referencia), arrancamos con la vista simple (una
  // sola lista); si eran distintas, mostramos las dos de entrada.
  let sameReturnUI = true;
  const referenceRoundTrip = editing || (lastTrip && lastTrip.roundTrip ? lastTrip : null);
  if (referenceRoundTrip && referenceRoundTrip.roundTrip) {
    const sortedOut = [...(referenceRoundTrip.passengerIds || [])].sort();
    const sortedRet = [...(referenceRoundTrip.returnPassengerIds || referenceRoundTrip.passengerIds || [])].sort();
    sameReturnUI = JSON.stringify(sortedOut) === JSON.stringify(sortedRet);
  }

  let step = 1;

  // El wizard no pasa por openModal() (tiene su propio ciclo de renderStep()
  // por paso), así que hay que anotar aquí el elemento con foco para poder
  // devolverlo al cerrar, igual que hace el resto de modales.
  modalReturnFocusEl = document.activeElement;
  qs('#modalOverlay').classList.remove('hidden');
  renderStep();

  function stepDone(n) {
    if (n === 1) return !!selection.carId;
    if (n === 2) return !!selection.km;
    return false;
  }

  // Los inputs de peso no se guardan en `selection.weights` hasta que se
  // lee el DOM explícitamente: hay que hacerlo antes de cualquier
  // renderStep() disparado desde dentro del propio paso 3, o se perderían
  // los valores que el usuario ya había tecleado.
  function captureWeightsFromDOM() {
    // Ida y vuelta comparten el mismo peso por persona, así que la misma
    // persona puede tener DOS inputs en pantalla (uno por lista): el que no
    // corresponde a su checkbox marcado queda deshabilitado y hay que
    // ignorarlo, o su valor por defecto ("1") pisaría el que sí se tecleó.
    qsa('.weight-input:not(:disabled)').forEach((inp) => {
      const val = parseInt(inp.value, 10);
      if (val && val > 0) selection.weights[inp.dataset.personId] = val;
    });
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

      const renderPassengerCheckboxes = (checkedIds, containerKind) => passengerCandidates.length
        ? passengerCandidates.map((p) => `
            <label class="checkbox-row ${selection.useWeights ? 'weight-checkbox-row' : ''}">
              <input type="checkbox" value="${p.id}" ${checkedIds.includes(p.id) ? 'checked' : ''}>
              <span>${esc(p.name)}</span>
              ${selection.useWeights ? `<input type="number" class="input weight-input" data-person-id="${p.id}" data-kind="${containerKind}" min="1" max="9" step="1" value="${selection.weights[p.id] || 1}" ${checkedIds.includes(p.id) ? '' : 'disabled'}>` : ''}
            </label>`).join('')
        : '<p class="hint">No hay más personas que el conductor. Añade personas en Configuración.</p>';

      bodyHtml = `
        <h3 class="wizard-title">Paso 3 de 3 · ${selection.roundTrip ? '¿Quién iba a la ida?' : '¿Quién iba?'}</h3>
        <p class="hint" style="margin:0 0 10px;">Aparte del conductor (${esc(driver ? driver.name : '—')}).</p>
        <div class="checkbox-grid" id="wizardOutboundPassengers">${renderPassengerCheckboxes(selection.passengerIds, 'outbound')}</div>
        ${selection.roundTrip ? `
          <label class="field-toggle" style="margin:14px 0 6px;">
            <input type="checkbox" id="sameReturnToggle" ${sameReturnUI ? 'checked' : ''}>
            <span>Los mismos pasajeros a la vuelta</span>
          </label>
          <div id="wizardReturnSection" class="${sameReturnUI ? 'hidden' : ''}">
            <p class="hint" style="margin:8px 0 6px;">¿Quién iba a la vuelta?</p>
            <div class="checkbox-grid" id="wizardReturnPassengers">${renderPassengerCheckboxes(selection.returnPassengerIds, 'return')}</div>
          </div>
        ` : ''}
        ${passengerCandidates.length ? `
          <label class="field-toggle" style="margin:14px 0 6px;">
            <input type="checkbox" id="weightedToggle" ${selection.useWeights ? 'checked' : ''}>
            <span>⚖️ Repartir en partes distintas (no a partes iguales)</span>
          </label>
          ${selection.useWeights ? `<p class="hint" style="margin:0 0 10px;">Cuántas "partes" paga cada uno: 1 es lo normal, 2 el doble, etc. El conductor siempre cuenta como 1 parte.</p>` : ''}
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
    // Cada paso reconstruye el HTML entero, así que el foco se pierde: lo
    // devolvemos al primer campo interactivo del paso nuevo.
    const stepFocusables = getFocusable(modalBodyEl);
    if (stepFocusables[0]) stepFocusables[0].focus();
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
          captureWeightsFromDOM();
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

      const weightedToggleEl = qs('#weightedToggle');
      if (weightedToggleEl) {
        weightedToggleEl.addEventListener('change', (e) => {
          captureWeightsFromDOM();
          selection.useWeights = e.target.checked;
          renderStep();
        });
      }
      if (selection.useWeights) {
        // El input de peso de cada fila se activa/desactiva junto con su
        // checkbox: no tiene sentido pedir "cuántas partes paga" alguien que
        // ni siquiera va en el trayecto.
        qsa('#wizardOutboundPassengers input[type="checkbox"], #wizardReturnPassengers input[type="checkbox"]').forEach((cb) => {
          cb.addEventListener('change', () => {
            const weightInput = cb.closest('.checkbox-row').querySelector('.weight-input');
            if (weightInput) weightInput.disabled = !cb.checked;
          });
        });
      }

      qs('#wizardSaveBtn').addEventListener('click', (e) => {
        // Un doble toque rápido no debe crear el trayecto dos veces: este
        // paso no tiene validaciones que puedan fallar, así que es seguro
        // deshabilitar el botón nada más pulsarlo.
        e.target.disabled = true;
        const passengerIds = qsa('#wizardOutboundPassengers input[type="checkbox"]:checked').map((cb) => cb.value);
        const returnPassengerIds = selection.roundTrip
          ? (sameReturnUI ? [...passengerIds] : qsa('#wizardReturnPassengers input[type="checkbox"]:checked').map((cb) => cb.value))
          : undefined;
        selection.passengerIds = passengerIds;
        selection.returnPassengerIds = returnPassengerIds || [];

        // Solo guardamos un peso por persona si se activó el reparto desigual
        // y de verdad se tecleó algo distinto de 1 (el caso normal no lleva
        // este campo, para no ensuciar los trayectos de siempre).
        let weights;
        if (selection.useWeights) {
          captureWeightsFromDOM();
          weights = {};
          new Set([...passengerIds, ...(returnPassengerIds || [])]).forEach((pid) => {
            const w = selection.weights[pid];
            if (w && w > 1) weights[pid] = w;
          });
          if (Object.keys(weights).length === 0) weights = undefined;
        }

        state.lastTrip = {
          carId: selection.carId,
          savedTripId: selection.savedTripId,
          km: selection.km,
          passengerIds,
          roundTrip: selection.roundTrip,
          returnPassengerIds: selection.returnPassengerIds,
          weights
        };

        const tripData = {
          carId: selection.carId,
          km: selection.km,
          passengerIds,
          savedTripId: selection.savedTripId,
          roundTrip: selection.roundTrip,
          returnPassengerIds,
          weights
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

function renderSummaryBlocksHTML(summary, opts) {
  const interactive = !!(opts && opts.interactive);
  const personBars = !!(opts && opts.personBars);

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

  // En el acumulado de Historial mostramos además una barra de progreso bajo
  // cada persona, para ver de un vistazo quién ha gastado más a lo largo del
  // tiempo (no solo el número).
  const maxShare = Math.max(...summary.perPerson.map((p) => p.share), 0.01);
  const peopleHTML = summary.perPerson.map((p) => `
    <div class="summary-item ${personBars ? 'summary-item-bar' : ''}">
      <div class="summary-item-row">
        <div class="summary-item-name">${esc(p.name)}</div>
        <div class="summary-item-value">${esc(formatEUR(p.share))}</div>
      </div>
      ${personBars ? `<div class="person-bar-track"><div class="person-bar-fill" style="width:${Math.max(4, Math.round(p.share / maxShare * 100))}%;"></div></div>` : ''}
    </div>`).join('');

  // El botón para marcar una deuda como pagada solo tiene sentido en el
  // periodo actual (con ids de personas vivos): en Historial las deudas son
  // una foto fija de periodos ya cerrados.
  const debtRowHTML = (d) => `
    <div class="debt-item">
      <span>${esc(d.from)}</span>
      <span class="debt-arrow">→</span>
      <span>${esc(d.to)}</span>
      <span class="debt-amount">${esc(formatEUR(d.amount))}</span>
      ${interactive ? `<button type="button" class="icon-btn settle-btn" data-action="settle-debt" data-from-id="${esc(d.fromId)}" data-to-id="${esc(d.toId)}" data-from-name="${esc(d.from)}" data-to-name="${esc(d.to)}" data-amount="${d.amount}" title="Marcar como pagada">✓</button>` : ''}
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
      <p class="hint" style="margin:0 0 10px;">Quién le debe a quién, persona a persona.${interactive ? ' Toca ✓ si ya se ha pagado fuera de la app.' : ''}</p>
      <div class="summary-list">${pairwiseHTML}</div>
    </div>`;
}

function openSettleModal(fromId, toId, fromName, toName, maxAmount) {
  const html = `
    <p class="hint" style="margin:0 0 12px;">Registra que ${esc(fromName)} ya le ha pagado a ${esc(toName)} fuera de la app. Se restará de la deuda pendiente.</p>
    <label class="field">
      <span>Importe pagado (€)</span>
      <input type="number" id="settleAmountInput" class="input" inputmode="decimal" step="0.01" min="0.01" value="${maxAmount.toFixed(2)}">
    </label>
    <button type="button" class="btn btn-primary btn-block" id="settleSaveBtn">Marcar como pagada</button>
  `;
  openModal('Registrar pago', html);
  qs('#settleSaveBtn').addEventListener('click', (e) => {
    const amount = parseFloat(qs('#settleAmountInput').value);
    if (!amount || amount <= 0) { showToast('Introduce un importe válido'); return; }
    if (amount > maxAmount + 0.01) { showToast('No puede ser más que la deuda actual'); return; }
    // Solo se deshabilita una vez pasa la validación: si se deshabilitara
    // antes, un intento fallido dejaría el botón inutilizable para reintentar.
    e.target.disabled = true;
    closeModal();
    settleDebt(fromId, toId, amount);
  });
}

function settleDebt(fromId, toId, amount) {
  if (!Array.isArray(state.period.settlements)) state.period.settlements = [];
  const record = { id: uid(), fromId, toId, amount };
  state.period.settlements.push(record);
  saveState();
  renderResumen();
  renderRegistroDashboard();
  showUndoToast('Pago registrado', () => {
    state.period.settlements = state.period.settlements.filter((s) => s.id !== record.id);
    saveState();
    renderResumen();
    renderRegistroDashboard();
  });
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

  qs('#summaryContent').innerHTML = hero + renderSummaryBlocksHTML(summary, { interactive: true }) + actions;

  qs('#shareSummaryBtn').addEventListener('click', () => shareSummary(summary, range));
  qs('#closePeriodBtn').addEventListener('click', () => closePeriod(summary, range));
}

// Delegado sobre el contenedor fijo (no se recrea en cada render, a
// diferencia de los botones de dentro) para no acumular listeners cada vez
// que se visita la pestaña Resumen.
qs('#summaryContent').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="settle-debt"]');
  if (!btn) return;
  openSettleModal(btn.dataset.fromId, btn.dataset.toId, btn.dataset.fromName, btn.dataset.toName, parseFloat(btn.dataset.amount));
});

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

/* -------- Compartir el resumen como imagen (canvas, sin librerías) -------- */

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function buildShareImageBlob(summary, range) {
  const W = 900;
  const PAD = 56;
  const ROW_H = 62;
  const ROW_GAP = 12;
  const debtRows = Math.max(1, (summary.pairwiseDebts || []).length);
  const H = 430 + summary.perPerson.length * (ROW_H + ROW_GAP) + debtRows * (ROW_H + ROW_GAP) + 100;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const FONT = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  // Mismo degradado fijo que .summary-hero en la app: independiente del
  // tema, para que la imagen se lea bien la comparta quien la comparta.
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1e40af');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const rowBg = () => { ctx.fillStyle = 'rgba(255,255,255,0.12)'; };
  const drawRow = (y, leftText, rightText, leftFont, rightFont) => {
    drawRoundedRect(ctx, PAD, y, W - PAD * 2, ROW_H, 14);
    rowBg();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = leftFont;
    ctx.fillText(leftText, PAD + 22, y + ROW_H / 2 + 7, W - PAD * 2 - 160);
    ctx.textAlign = 'right';
    ctx.font = rightFont;
    ctx.fillText(rightText, W - PAD - 22, y + ROW_H / 2 + 7);
    ctx.textAlign = 'left';
  };

  let y = PAD;
  ctx.fillStyle = '#fff';
  ctx.font = `700 32px ${FONT}`;
  ctx.fillText('⛽ Gastos Coche', PAD, y + 32);
  y += 50;
  ctx.font = `500 19px ${FONT}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(`Periodo ${range}`, PAD, y + 19);
  ctx.globalAlpha = 1;
  y += 64;

  ctx.font = `800 68px ${FONT}`;
  ctx.fillText(formatEUR(summary.totalCost), PAD, y + 68);
  y += 92;
  ctx.font = `400 17px ${FONT}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(`${summary.dayCount} día(s) · ${summary.tripCount} trayecto(s)`, PAD, y + 17);
  ctx.globalAlpha = 1;
  y += 56;

  ctx.font = `700 22px ${FONT}`;
  ctx.fillText('Consumo por persona', PAD, y + 22);
  y += 42;
  summary.perPerson.forEach((p) => {
    drawRow(y, p.name, formatEUR(p.share), `600 20px ${FONT}`, `700 20px ${FONT}`);
    y += ROW_H + ROW_GAP;
  });
  y += 18;

  ctx.font = `700 22px ${FONT}`;
  ctx.fillText('Deudas', PAD, y + 22);
  y += 42;
  if ((summary.pairwiseDebts || []).length) {
    summary.pairwiseDebts.forEach((d) => {
      drawRow(y, `${d.from} → ${d.to}`, formatEUR(d.amount), `600 18px ${FONT}`, `700 20px ${FONT}`);
      y += ROW_H + ROW_GAP;
    });
  } else {
    drawRoundedRect(ctx, PAD, y, W - PAD * 2, ROW_H, 14);
    rowBg();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `600 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('Nadie debe nada a nadie 🎉', W / 2, y + ROW_H / 2 + 6);
    ctx.textAlign = 'left';
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Comparte un archivo con la Web Share API; devuelve true tanto si se
// compartió como si el usuario simplemente cerró la bandeja de compartir
// (en ambos casos ya "gestionamos" el intento y no hay que seguir probando
// otros métodos, o el usuario vería un doble comportamiento raro).
async function tryShareFile(file) {
  if (!file || !navigator.canShare || !navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: 'Gastos Coche' });
    return true;
  } catch (e) {
    return e && e.name === 'AbortError';
  }
}

async function tryShareText(text) {
  if (!navigator.share) return false;
  try {
    await navigator.share({ title: 'Gastos Coche', text });
    return true;
  } catch (e) {
    return e && e.name === 'AbortError';
  }
}

async function shareSummary(summary, range) {
  if (summary.tripCount === 0) { showToast('No hay nada que compartir todavía'); return; }

  let blob = null;
  try { blob = await buildShareImageBlob(summary, range); } catch (e) { console.warn('No se pudo generar la imagen para compartir', e); }
  const fileName = `gastos-coche-${range.replace(/[^\p{L}\p{N}]+/gu, '-')}.png`;
  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;

  if (await tryShareFile(file)) return;
  if (await tryShareText(buildShareText(summary, range))) return;

  if (file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Imagen descargada');
    return;
  }

  const text = buildShareText(summary, range);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); showToast('Resumen copiado al portapapeles'); return; } catch (e) { /* sigue al prompt */ }
  }
  window.prompt('Copia el resumen:', text);
}

function closePeriod(summary, range) {
  const doClose = () => {
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
  };

  confirmModal({
    title: 'Cerrar periodo',
    message: summary.tripCount === 0
      ? 'El periodo está vacío. ¿Cerrarlo igualmente y empezar uno nuevo?'
      : `¿Cerrar el periodo (${range}) y guardarlo en el historial? Empezarás uno nuevo vacío.`,
    confirmLabel: 'Cerrar periodo',
    onConfirm: doClose
  });
}

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

function renderHistoryChartHTML() {
  if (state.history.length < 2) return '';

  // El historial se guarda con el más reciente primero (unshift): para el
  // gráfico lo queremos en orden cronológico normal, y solo los últimos N
  // periodos para que las barras no se queden diminutas.
  const chronological = [...state.history].sort((a, b) => (a.startDate || a.closedAt || '').localeCompare(b.startDate || b.closedAt || ''));
  const MAX_BARS = 8;
  const shown = chronological.slice(-MAX_BARS);
  const hiddenCount = chronological.length - shown.length;
  const max = Math.max(...shown.map((e) => e.summary.totalCost || 0), 0.01);

  const bars = shown.map((e) => {
    const cost = e.summary.totalCost || 0;
    const pct = Math.max(4, Math.round((cost / max) * 100));
    return `
      <div class="chart-bar-col" title="${esc(e.range || '')}: ${esc(formatEUR(cost))}">
        <div class="chart-bar-value">${esc(formatEUR(cost))}</div>
        <div class="chart-bar" style="height:${pct}%;"></div>
        <div class="chart-bar-label">${esc(formatDateShort(e.startDate || e.closedAt))}</div>
      </div>`;
  }).join('');

  return `
    <div class="card chart-card">
      <h2>Evolución del gasto</h2>
      ${hiddenCount > 0 ? `<p class="hint" style="margin:0 0 10px;">Mostrando los últimos ${MAX_BARS} periodos (${hiddenCount} más antiguos no se muestran aquí).</p>` : ''}
      <div class="chart-bars">${bars}</div>
    </div>`;
}

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
      ${renderHistoryChartHTML()}
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
  qs('#personSaveBtn').addEventListener('click', (e) => {
    const name = qs('#personNameInput').value.trim();
    if (!name) { showToast('Escribe un nombre'); return; }
    e.target.disabled = true;
    if (person) {
      person.name = name;
    } else {
      state.people.push({ id: uid(), name });
    }
    saveState();
    closeModal();
    renderPeople();
    renderCars();
    renderRegistro(); // por si estábamos en la guía inicial, para avanzar al siguiente paso
    showToast('Guardado');
  });
}

function deletePerson(person) {
  const drivesAnyCar = state.cars.some((c) => c.driverId === person.id);
  if (drivesAnyCar) { showToast('Esta persona conduce un coche. Cambia el conductor antes de borrarla.'); return; }
  confirmModal({
    title: 'Eliminar persona',
    message: `¿Eliminar a ${person.name}? Se quitará de los trayectos y deudas donde apareciera.`,
    confirmLabel: 'Eliminar',
    danger: true,
    onConfirm: () => doDeletePerson(person)
  });
}

function doDeletePerson(person) {
  state.people = state.people.filter((p) => p.id !== person.id);
  // Un trayecto puede tener pasajeros distintos a la ida y a la vuelta, y
  // puede haber pagos registrados entre personas: hay que limpiar las tres
  // referencias, si no dejamos ids "fantasma" apuntando a nadie.
  state.period.days.forEach((day) => day.trips.forEach((t) => {
    t.passengerIds = (t.passengerIds || []).filter((id) => id !== person.id);
    if (t.returnPassengerIds) t.returnPassengerIds = t.returnPassengerIds.filter((id) => id !== person.id);
  }));
  if (Array.isArray(state.period.settlements)) {
    state.period.settlements = state.period.settlements.filter((s) => s.fromId !== person.id && s.toId !== person.id);
  }
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

  qs('#carSaveBtn').addEventListener('click', (e) => {
    const name = qs('#carNameInput').value.trim();
    const driverId = qs('#carDriverSelect').value;
    const consumption = parseFloat(qs('#carConsumptionInput').value);
    const useOwnPrice = qs('#carUseOwnPriceToggle').checked;
    const ownPrice = parseFloat(qs('#carOwnPriceInput').value) || null;
    if (!name) { showToast('Escribe un nombre para el coche'); return; }
    if (!driverId) { showToast('Elige un conductor'); return; }
    if (!consumption || consumption <= 0) { showToast('Introduce un consumo válido'); return; }
    if (useOwnPrice && (!ownPrice || ownPrice <= 0)) { showToast('Introduce un precio propio válido'); return; }
    e.target.disabled = true;

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
  confirmModal({
    title: 'Eliminar coche',
    message: `¿Eliminar el coche "${car.name}"?`,
    confirmLabel: 'Eliminar',
    danger: true,
    onConfirm: () => {
      state.cars = state.cars.filter((c) => c.id !== car.id);
      saveState();
      renderCars();
      renderPeople();
    }
  });
}

/* =====================================================================
   CONFIGURACIÓN: Precio global y opción conductor paga
   ===================================================================== */

function renderConfigMisc() {
  qs('#globalPriceInput').value = state.globalPrice;
  qs('#driverPaysToggle').checked = state.driverPays;
  renderSecurityCard();
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
  qs('#savedSaveBtn').addEventListener('click', (e) => {
    const name = qs('#savedNameInput').value.trim();
    const km = parseFloat(qs('#savedKmInput').value);
    if (!name) { showToast('Escribe un nombre'); return; }
    if (!km || km <= 0) { showToast('Introduce unos km válidos'); return; }
    e.target.disabled = true;
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
  confirmModal({
    title: 'Eliminar trayecto guardado',
    message: `¿Eliminar "${trip.name}"?`,
    confirmLabel: 'Eliminar',
    danger: true,
    onConfirm: () => {
      state.savedTrips = state.savedTrips.filter((s) => s.id !== trip.id);
      saveState();
      renderSavedTrips();
    }
  });
}

/* =====================================================================
   CONFIGURACIÓN: Datos (exportar / importar / borrar)
   ===================================================================== */

qs('#exportDataBtn').addEventListener('click', () => {
  // El PIN no se incluye en la copia de seguridad: si se comparte o se sube
  // a otro sitio, no debería llevarse el candado de este dispositivo consigo.
  const exportState = { ...state, pin: undefined };
  const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: 'application/json' });
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

// Reconstruye un estado válido a partir de un JSON externo, descartando (sin
// romper el resto) cualquier entrada con datos incompletos o referencias a
// ids que no existen (p.ej. un trayecto cuyo coche ya no está en el
// archivo). Devuelve también la lista de avisos para poder informar al
// usuario antes de que confirme el reemplazo.
function sanitizeImportedState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('El archivo no contiene datos de la app (formato no reconocido).');
  }

  const issues = [];

  const people = Array.isArray(raw.people) ? raw.people : [];
  const cleanPeople = [];
  people.forEach((p) => {
    if (p && typeof p.name === 'string' && p.name.trim()) {
      cleanPeople.push({ id: (typeof p.id === 'string' && p.id) ? p.id : uid(), name: p.name.trim() });
    } else {
      issues.push('Una persona sin nombre válido.');
    }
  });
  const peopleIds = new Set(cleanPeople.map((p) => p.id));

  const cars = Array.isArray(raw.cars) ? raw.cars : [];
  const cleanCars = [];
  cars.forEach((c) => {
    const consumption = Number(c && c.consumption);
    if (c && typeof c.name === 'string' && c.name.trim() && peopleIds.has(c && c.driverId) && consumption > 0) {
      cleanCars.push({
        id: (typeof c.id === 'string' && c.id) ? c.id : uid(),
        name: c.name.trim(),
        driverId: c.driverId,
        consumption,
        useOwnPrice: !!c.useOwnPrice,
        ownPrice: (c.useOwnPrice && Number(c.ownPrice) > 0) ? Number(c.ownPrice) : null
      });
    } else {
      issues.push(`El coche "${(c && c.name) || '(sin nombre)'}" (datos incompletos o conductor inválido).`);
    }
  });
  const carIds = new Set(cleanCars.map((c) => c.id));

  const savedTrips = Array.isArray(raw.savedTrips) ? raw.savedTrips : [];
  const cleanSavedTrips = [];
  savedTrips.forEach((s) => {
    const km = Number(s && s.km);
    if (s && typeof s.name === 'string' && s.name.trim() && km > 0) {
      cleanSavedTrips.push({ id: (typeof s.id === 'string' && s.id) ? s.id : uid(), name: s.name.trim(), km });
    } else {
      issues.push('Un trayecto guardado con datos incompletos.');
    }
  });

  const sanitizeTrip = (t) => {
    if (!t || !carIds.has(t.carId)) return null;
    const km = Number(t.km);
    if (!(km > 0)) return null;
    const passengerIds = Array.isArray(t.passengerIds) ? t.passengerIds.filter((id) => peopleIds.has(id)) : [];
    const roundTrip = !!t.roundTrip;
    const returnPassengerIds = roundTrip
      ? (Array.isArray(t.returnPassengerIds) ? t.returnPassengerIds.filter((id) => peopleIds.has(id)) : [...passengerIds])
      : undefined;
    let weights;
    if (t.weights && typeof t.weights === 'object') {
      weights = {};
      Object.keys(t.weights).forEach((pid) => {
        const w = Number(t.weights[pid]);
        if (peopleIds.has(pid) && Number.isInteger(w) && w > 1) weights[pid] = w;
      });
      if (Object.keys(weights).length === 0) weights = undefined;
    }
    return {
      id: (typeof t.id === 'string' && t.id) ? t.id : uid(),
      carId: t.carId,
      km,
      passengerIds,
      savedTripId: (typeof t.savedTripId === 'string' && t.savedTripId) || null,
      roundTrip,
      returnPassengerIds,
      weights
    };
  };

  const sanitizeDays = (days) => (Array.isArray(days) ? days : [])
    .filter((d) => d && typeof d.date === 'string')
    .map((d) => {
      const rawTrips = Array.isArray(d.trips) ? d.trips : [];
      const trips = rawTrips.map(sanitizeTrip).filter(Boolean);
      if (trips.length !== rawTrips.length) issues.push(`${rawTrips.length - trips.length} trayecto(s) con datos incompletos el ${d.date}.`);
      return { id: (typeof d.id === 'string' && d.id) ? d.id : uid(), date: d.date, trips };
    });

  const rawPeriod = (raw.period && typeof raw.period === 'object') ? raw.period : {};
  const rawSettlements = Array.isArray(rawPeriod.settlements) ? rawPeriod.settlements : [];
  const cleanSettlements = rawSettlements.filter((s) => s && peopleIds.has(s.fromId) && peopleIds.has(s.toId) && Number(s.amount) > 0);
  if (cleanSettlements.length !== rawSettlements.length) issues.push('Algún pago registrado hacía referencia a una persona inexistente.');

  const period = {
    id: (typeof rawPeriod.id === 'string' && rawPeriod.id) ? rawPeriod.id : uid(),
    createdAt: (typeof rawPeriod.createdAt === 'string' && rawPeriod.createdAt) ? rawPeriod.createdAt : todayISO(),
    days: sanitizeDays(rawPeriod.days),
    settlements: cleanSettlements
  };

  const rawHistory = Array.isArray(raw.history) ? raw.history : [];
  const history = rawHistory.filter((h) => h && typeof h === 'object' && h.summary && typeof h.summary === 'object');
  if (history.length !== rawHistory.length) issues.push(`${rawHistory.length - history.length} periodo(s) del historial con datos incompletos.`);

  const globalPrice = Number(raw.globalPrice);

  return {
    state: {
      version: 1,
      people: cleanPeople,
      cars: cleanCars,
      globalPrice: globalPrice > 0 ? globalPrice : 1.65,
      savedTrips: cleanSavedTrips,
      driverPays: typeof raw.driverPays === 'boolean' ? raw.driverPays : true,
      period,
      history,
      lastTrip: null,
      theme: ['auto', 'light', 'dark'].includes(raw.theme) ? raw.theme : 'auto',
      // El PIN nunca se restaura desde un archivo importado: si el backup se
      // comparte o se guarda en otro sitio, no queremos propagar (ni
      // bloquear al usuario con) un PIN que no acaba de teclear él mismo.
      pin: null
    },
    issues
  };
}

qs('#importFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (err) {
      showToast('El archivo no es un JSON válido');
      return;
    }

    let sanitized;
    try {
      sanitized = sanitizeImportedState(parsed);
    } catch (err) {
      showToast(err.message || 'El archivo no es válido');
      return;
    }

    const { state: importedState, issues } = sanitized;
    const summaryLine = `Se importarán ${importedState.people.length} persona(s), ${importedState.cars.length} coche(s) y ${importedState.history.length} periodo(s) cerrado(s). Esto reemplazará todos los datos actuales.`;
    const issuesLine = issues.length
      ? `\n\nSe han ignorado ${issues.length} elemento(s) con datos incompletos o referencias rotas (detalle en la consola).`
      : '';

    confirmModal({
      title: 'Importar datos',
      message: summaryLine + issuesLine,
      confirmLabel: 'Reemplazar datos',
      danger: true,
      onConfirm: () => {
        state = importedState;
        saveState();
        renderAll();
        updateLockButtonVisibility();
        switchTab('registro');
        showToast('Datos importados');
        if (issues.length) console.warn('Avisos al importar datos:', issues);
      }
    });
  };
  reader.readAsText(file);
  e.target.value = '';
});

qs('#resetDataBtn').addEventListener('click', () => {
  confirmModal({
    title: 'Borrar todos los datos',
    message: '¿Borrar TODOS los datos (personas, coches, periodo actual e historial)? Esta acción no se puede deshacer.',
    confirmLabel: 'Borrar todo',
    danger: true,
    onConfirm: () => {
      state = createDefaultState();
      saveState();
      renderAll();
      updateLockButtonVisibility();
      switchTab('registro');
      showToast('Datos borrados');
    }
  });
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
   Bloqueo con PIN (candado local, no es cifrado real de los datos: solo
   evita que alguien abra la app sin más en este dispositivo)
   ===================================================================== */

function renderSecurityCard() {
  const el = qs('#securityPinStatus');
  if (state.pin) {
    el.innerHTML = `
      <p class="hint" style="margin:0 0 10px;">La app pide un PIN de 4 dígitos al abrirla en este dispositivo.</p>
      <button type="button" class="btn btn-secondary btn-block" id="changePinBtn">Cambiar PIN</button>
      <button type="button" class="btn btn-danger" id="removePinBtn">Quitar PIN</button>`;
    qs('#changePinBtn').addEventListener('click', () => openSetPinModal());
    qs('#removePinBtn').addEventListener('click', () => openRemovePinModal());
  } else {
    el.innerHTML = `
      <p class="hint" style="margin:0 0 10px;">Añade un PIN de 4 dígitos para que nadie abra la app sin más. Se guarda solo en este dispositivo (no viaja en las copias de seguridad) y no es un cifrado real de los datos.</p>
      <button type="button" class="btn btn-primary" id="setPinBtn">Activar PIN</button>`;
    qs('#setPinBtn').addEventListener('click', () => openSetPinModal());
  }
}

function openSetPinModal() {
  const html = `
    <label class="field">
      <span>Elige un PIN de 4 dígitos</span>
      <input type="password" id="newPinInput1" class="input" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="••••">
    </label>
    <label class="field">
      <span>Repite el PIN</span>
      <input type="password" id="newPinInput2" class="input" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="••••">
    </label>
    <button type="button" class="btn btn-primary btn-block" id="newPinSaveBtn">${state.pin ? 'Cambiar PIN' : 'Activar PIN'}</button>
  `;
  openModal(state.pin ? 'Cambiar PIN' : 'Activar PIN', html);
  qs('#newPinSaveBtn').addEventListener('click', (e) => {
    const p1 = qs('#newPinInput1').value.trim();
    const p2 = qs('#newPinInput2').value.trim();
    if (!/^\d{4}$/.test(p1)) { showToast('El PIN debe tener 4 dígitos'); return; }
    if (p1 !== p2) { showToast('Los dos PIN no coinciden'); return; }
    e.target.disabled = true;
    state.pin = p1;
    saveState();
    closeModal();
    renderSecurityCard();
    updateLockButtonVisibility();
    showToast('PIN guardado');
  });
}

function openRemovePinModal() {
  confirmModal({
    title: 'Quitar PIN',
    message: 'La app dejará de pedir un PIN al abrirla en este dispositivo. ¿Continuar?',
    confirmLabel: 'Quitar PIN',
    danger: true,
    onConfirm: () => {
      state.pin = null;
      saveState();
      renderSecurityCard();
      updateLockButtonVisibility();
      showToast('PIN desactivado');
    }
  });
}

function updateLockButtonVisibility() {
  qs('#lockNowBtn').classList.toggle('hidden', !state.pin);
}

// Con la pantalla de bloqueo solo tapada por CSS, alguien con teclado podría
// tabular "a través" de ella hasta los botones de la app de detrás (el
// z-index no afecta el orden de tabulación). `inert` los saca del todo del
// alcance del teclado (y del resto de interacción) mientras está bloqueada.
function setAppInert(isInert) {
  [qs('#mainContent'), qs('#tabbar'), qs('.app-header')].forEach((el) => {
    if (!el) return;
    if (isInert) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  });
}

function showLockScreen() {
  closeModal();
  setAppInert(true);
  const screen = qs('#lockScreen');
  const input = qs('#lockPinInput');
  qs('#lockError').classList.add('hidden');
  input.value = '';
  screen.classList.remove('hidden');
  setTimeout(() => input.focus(), 50);
}

function attemptUnlock() {
  const input = qs('#lockPinInput');
  if (input.value === state.pin) {
    qs('#lockScreen').classList.add('hidden');
    input.value = '';
    setAppInert(false);
    return;
  }
  const box = qs('.lock-box');
  qs('#lockError').classList.remove('hidden');
  box.classList.remove('shake');
  void box.offsetWidth; // reinicia la animación si ya se había disparado
  box.classList.add('shake');
  input.value = '';
  input.focus();
}

function setupLockScreen() {
  updateLockButtonVisibility();
  if (state.pin) showLockScreen();
  qs('#lockUnlockBtn').addEventListener('click', attemptUnlock);
  qs('#lockPinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptUnlock(); });
  qs('#lockNowBtn').addEventListener('click', showLockScreen);
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
setupLockScreen();
registerServiceWorker();
