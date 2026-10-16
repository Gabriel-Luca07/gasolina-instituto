'use strict';

/* Pestaña Registro: días, trayectos, selección múltiple y asistente de trayecto. */

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
  qs('#toggleMultiSelectBtn').innerHTML = multiSelectMode
    ? `${icon('x')} Cancelar selección múltiple`
    : `${icon('check-square')} Seleccionar varios días para el mismo trayecto`;
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

  const sourceDays = state.period.days.filter((d) => prevWeekDates.includes(d.date) && d.trips.some(isCopyableTrip));
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
    const cloned = day.trips.filter(isCopyableTrip).map((t) => cloneTrip(t));
    target.trips.push(...cloned);
    cloned.forEach((t) => noteHabit(t, target.date));
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
  if (!prev.trips.some(isCopyableTrip)) { showToast('El día anterior no tiene trayectos que copiar'); return; }
  const target = state.period.days.find((d) => d.id === dayId);
  const doCopy = () => {
    const cloned = prev.trips.filter(isCopyableTrip).map((t) => cloneTrip(t));
    target.trips.push(...cloned);
    cloned.forEach((t) => noteHabit(t, target.date));
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

  const topDebt = debtsOf(summary)[0];
  const OPEN_PERIOD_WARN_DAYS = 10;
  const daysOpen = Math.round((parseISODate(todayISO()) - parseISODate(state.period.createdAt)) / 86400000);
  const staleWarning = daysOpen >= OPEN_PERIOD_WARN_DAYS
    ? `<div class="dashboard-stale-notice">${icon('hourglass')} Llevas ${daysOpen} días con este periodo abierto. Considera cerrarlo desde Resumen para no acumular demasiado.</div>`
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
  const needsPerson = activePeople().length === 0;
  const needsCar = !needsPerson && activeCars().length === 0;
  const show = needsPerson || needsCar;

  card.classList.toggle('hidden', !show);
  qs('#registroDashboard').classList.toggle('hidden', show);
  qs('#addDayCard').classList.toggle('hidden', show);
  qs('#dayList').classList.toggle('hidden', show);
  if (show) qs('#registroEmptyState').classList.add('hidden');
  if (!show) return false;

  qs('#onboardingSteps').innerHTML = needsPerson ? `
    <p class="hint" style="margin:0 0 14px;">Para repartir gastos hacen falta al menos una persona y un coche. Empieza añadiendo a las personas del grupo (tú incluido/a).</p>
    <button type="button" class="btn btn-primary btn-block" id="onboardingAddPersonBtn"><span class="step-num">1</span> Añadir primera persona</button>
  ` : `
    <p class="hint" style="margin:0 0 14px;">Ya tienes gente en el grupo. Ahora añade el coche que vais a compartir (y quién lo conduce).</p>
    <button type="button" class="btn btn-primary btn-block" id="onboardingAddCarBtn"><span class="step-num">2</span> Añadir primer coche</button>
  `;
  if (needsPerson) {
    qs('#onboardingAddPersonBtn').addEventListener('click', () => openPersonModal(null));
  } else {
    qs('#onboardingAddCarBtn').addEventListener('click', () => openCarModal(null));
  }
  return true;
}

function renderCloseReminder() {
  const card = qs('#closeReminderCard');
  const show = shouldRemindClosePeriod(todayISO());
  card.classList.toggle('hidden', !show);
  if (show) qs('#closeReminderText').textContent = `El periodo lleva ${periodAgeDays(state.period, todayISO())} días abierto. ¿Repasáis las cuentas y lo cerráis?`;
}

qs('#closeReminderGoBtn').addEventListener('click', () => switchTab('resumen'));
qs('#closeReminderLaterBtn').addEventListener('click', () => {
  state.closeReminderSnoozedUntil = addDaysISO(todayISO(), 7);
  saveState();
  renderCloseReminder();
  showToast('Te lo recordaré en una semana');
});

function renderRegistro() {
  if (renderOnboarding()) { qs('#closeReminderCard').classList.add('hidden'); return; }
  renderCloseReminder();
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
            ${idx > 0 ? `<button type="button" class="icon-btn" data-action="copy-day" aria-label="Copiar día anterior" title="Copiar día anterior">${icon('copy')}</button>` : ''}
            <button type="button" class="icon-btn danger" data-action="remove-day" aria-label="Eliminar día" title="Eliminar día">${icon('trash')}</button>
          </div>
        </div>
        <div class="day-card-body">
          ${tripsHTML}
          ${suggestionsHTML(day)}
          <button type="button" class="btn btn-secondary btn-block add-trip-btn" data-action="add-trip">+ Añadir trayecto</button>
        </div>
      </div>`;
  }).join('');
}

function renderTripRow(day, trip, idx) {
  const car = state.cars.find((c) => c.id === trip.carId);
  if (!car) {
    return `<div class="trip-row"><em class="hint">Coche eliminado. <button type="button" class="icon-btn danger" data-action="remove-trip" aria-label="Eliminar trayecto" data-trip-id="${trip.id}">${icon('trash')}</button></em></div>`;
  }
  const driver = state.people.find((p) => p.id === car.driverId);
  const cost = computeTripDisplayCost(trip);
  // Devuelve HTML ya escapado (el nombre más la etiqueta "de baja" si toca).
  const nameWithWeight = (id) => {
    const name = (state.people.find((p) => p.id === id) || {}).name;
    if (!name) return null;
    const w = trip.weights && trip.weights[id];
    return esc(w && w > 1 ? `${name} (×${w})` : name) + archivedTagHTML(state.people, id);
  };
  const outboundNames = (trip.passengerIds || []).map(nameWithWeight).filter(Boolean);
  const driverSuffix = state.driverPays ? ` + ${esc(driver ? driver.name : 'conductor')} (conductor)` : '';

  let peopleHTML;
  if (trip.roundTrip) {
    const returnIds = trip.returnPassengerIds || trip.passengerIds || [];
    const returnNames = returnIds.map(nameWithWeight).filter(Boolean);
    const sameBothWays = JSON.stringify([...(trip.passengerIds || [])].sort()) === JSON.stringify([...returnIds].sort());
    peopleHTML = sameBothWays
      ? `<strong>Con:</strong> ${outboundNames.length ? outboundNames.join(', ') : 'nadie más marcado'}${driverSuffix} (ida y vuelta)`
      : `<strong>Ida:</strong> ${outboundNames.length ? outboundNames.join(', ') : 'nadie más marcado'}${driverSuffix}<br>
         <strong>Vuelta:</strong> ${returnNames.length ? returnNames.join(', ') : 'nadie más marcado'}${driverSuffix}`;
  } else {
    peopleHTML = `<strong>Con:</strong> ${outboundNames.length ? outboundNames.join(', ') : 'nadie más marcado'}${driverSuffix}`;
  }

  const metaKm = trip.roundTrip ? `${formatKm(trip.km)} × 2 (ida y vuelta)` : formatKm(trip.km);
  const metaPrice = formatPricePerL(tripRates(trip, car).pricePerL);

  return `
    <div class="trip-row" data-trip-id="${trip.id}">
      <div class="trip-row-top">
        <div>
          <div class="trip-row-car">${icon('car')} ${esc(car.name)}${archivedTagHTML(state.cars, car.id)}</div>
          <div class="trip-row-meta">${esc(metaKm)} · ${esc(metaPrice)} · conduce ${esc(driver ? driver.name : '—')}</div>
        </div>
        <div class="trip-row-cost">${esc(formatEUR(cost))}</div>
      </div>
      <div class="trip-row-people">${peopleHTML}</div>
      <div class="trip-row-buttons">
        ${day.trips.length > 1 ? `
          <button type="button" class="icon-btn reorder-btn" data-action="move-trip-up" aria-label="Subir trayecto" ${idx === 0 ? 'disabled' : ''} title="Subir">${icon('chevron-up')}</button>
          <button type="button" class="icon-btn reorder-btn" data-action="move-trip-down" aria-label="Bajar trayecto" ${idx === day.trips.length - 1 ? 'disabled' : ''} title="Bajar">${icon('chevron-down')}</button>
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
  if (action === 'add-suggested') return addSuggestedTrip(dayId, e.target.closest('[data-habit-key]').dataset.habitKey);
  if (action === 'edit-trip') return openTripModal(dayId, e.target.closest('.trip-row').dataset.tripId);
  if (action === 'duplicate-trip') return duplicateTrip(dayId, e.target.closest('.trip-row').dataset.tripId);
  if (action === 'remove-trip') return removeTrip(dayId, e.target.closest('.trip-row')?.dataset.tripId || e.target.dataset.tripId);
  if (action === 'move-trip-up') return moveTrip(dayId, e.target.closest('.trip-row').dataset.tripId, -1);
  if (action === 'move-trip-down') return moveTrip(dayId, e.target.closest('.trip-row').dataset.tripId, 1);
});

function duplicateTrip(dayId, tripId) {
  const day = state.period.days.find((d) => d.id === dayId);
  const trip = day.trips.find((t) => t.id === tripId);
  if (!trip) return;
  if (!isCopyableTrip(trip)) { showToast('El coche de este trayecto está eliminado'); return; }
  const clone = cloneTrip(trip);
  const idx = day.trips.indexOf(trip);
  day.trips.splice(idx + 1, 0, clone);
  noteHabit(clone, day.date);
  saveState();
  renderRegistro();
  showToast('Trayecto duplicado');
}

// Anota el trayecto como hábito (alimenta las sugerencias y los atajos de km).
function noteHabit(trip, date) {
  if (!Array.isArray(state.tripHabits)) state.tripHabits = [];
  recordHabit(state.tripHabits, trip, date);
}

// "Lo de siempre": un toque apunta el trayecto sugerido en ese día.
function addSuggestedTrip(dayId, key) {
  const day = state.period.days.find((d) => d.id === dayId);
  const habit = (state.tripHabits || []).find((h) => habitKey(h) === key);
  if (!day || !habit) return;
  const habitsBefore = JSON.stringify(state.tripHabits);
  const lastTripBefore = state.lastTrip;
  const trip = tripFromHabit(habit);
  day.trips.push(trip);
  state.lastTrip = {
    carId: trip.carId, savedTripId: null, km: trip.km, passengerIds: [...trip.passengerIds],
    roundTrip: trip.roundTrip, returnPassengerIds: trip.returnPassengerIds || [], weights: undefined
  };
  noteHabit(trip, day.date);
  saveState();
  renderRegistro();
  updatePeriodBadge();
  showUndoToast('Trayecto añadido', () => {
    day.trips = day.trips.filter((t) => t.id !== trip.id);
    state.tripHabits = JSON.parse(habitsBefore);
    state.lastTrip = lastTripBefore;
    saveState();
    renderRegistro();
    updatePeriodBadge();
  });
}

function suggestionsHTML(day) {
  const suggestions = suggestTrips(state.tripHabits || [], day.date, day.trips, 3);
  if (suggestions.length === 0) return '';
  const nameOf = (id) => (state.people.find((p) => p.id === id) || {}).name || '?';
  return `
    <div class="suggest-block">
      <div class="suggest-label">Lo de siempre · toca para añadir</div>
      <div class="suggest-row">
        ${suggestions.map((h) => {
          const car = state.cars.find((c) => c.id === h.carId);
          const who = h.passengerIds.length ? h.passengerIds.map(nameOf).join(', ') : 'sin pasajeros';
          return `
          <button type="button" class="suggest-chip" data-action="add-suggested" data-habit-key="${esc(habitKey(h))}">
            <span class="suggest-chip-title">${esc(car.name)} · ${esc(formatKm(h.km))}${h.roundTrip ? ' · ida y vuelta' : ''}</span>
            <span class="suggest-chip-sub">${esc(who)}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
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
  const day = dayId ? state.period.days.find((d) => d.id === dayId) : null;
  const editing = (!batchDates && tripId) ? day.trips.find((t) => t.id === tripId) : null;
  if (!editing && activeCars().length === 0) { showToast('Añade primero un coche en Configuración'); return; }
  // Los coches eliminados no se ofrecen, salvo el del trayecto que se edita.
  const carChoices = state.cars.filter((c) => !c.archived || (editing && editing.carId === c.id));

  // Al añadir un trayecto nuevo (no al editar uno existente), precargamos el
  // último coche/trayecto/pasajeros que se usaron: casi siempre es el mismo
  // grupo de gente día tras día.
  const lastTrip = state.lastTrip;
  const validLastPassengers = (ids) => (Array.isArray(ids) ? ids.filter((id) => activePeople().some((p) => p.id === id)) : []);
  const selection = {
    carId: editing ? editing.carId
      : (lastTrip && activeCars().some((c) => c.id === lastTrip.carId) ? lastTrip.carId : activeCars()[0].id),
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
  // Firma del trayecto duplicado ya avisado (ver commitTrip). Debe declararse
  // antes del primer renderQuick()/renderStep(), que la reinician.
  let ackedDuplicate = null;

  modalReturnFocusEl = document.activeElement;
  qs('#modalOverlay').classList.remove('hidden');
  // Un trayecto nuevo se apunta en una sola pantalla; editar usa los pasos.
  if (editing) renderStep(); else renderQuick();

  // Guarda lo elegido (paso 3 del asistente o formulario rápido). Devuelve
  // false, sin guardar, si avisa de que ya hay un trayecto igual ese día: se
  // guarda al volver a pulsar el botón.
  function commitTrip(passengerIds, returnPassengerIds, weights) {
    // Al editar sin cambiar de coche se conservan el precio y consumo con
    // los que se apuntó; si es nuevo o cambia el coche, se toman los de hoy.
    const selectedCar = state.cars.find((c) => c.id === selection.carId);
    const rates = (editing && editing.carId === selection.carId && editing.pricePerL > 0)
      ? { consumption: editing.consumption, pricePerL: editing.pricePerL }
      : tripRatesFromCar(selectedCar);

    const tripData = {
      ...rates,
      carId: selection.carId,
      km: selection.km,
      passengerIds,
      savedTripId: selection.savedTripId,
      roundTrip: selection.roundTrip,
      returnPassengerIds,
      weights
    };

    const targetDays = batchDates && batchDates.length
      ? batchDates.map((date) => state.period.days.find((dd) => dd.date === date)).filter(Boolean)
      : (day ? [day] : []);
    const dupDays = editing ? [] : targetDays.filter((d) => d.trips.some((t) => isSameTrip(t, tripData)));
    const signature = JSON.stringify([habitKey(tripData), tripData.weights || null]);
    if (dupDays.length && ackedDuplicate !== signature) {
      ackedDuplicate = signature;
      showDuplicateWarning(dupDays.length, batchDates && batchDates.length ? batchDates.length : 1);
      return false;
    }

    state.lastTrip = {
      carId: selection.carId,
      savedTripId: selection.savedTripId,
      km: selection.km,
      passengerIds,
      roundTrip: selection.roundTrip,
      returnPassengerIds: returnPassengerIds || [],
      weights
    };

    if (batchDates && batchDates.length) {
      batchDates.forEach((date) => {
        let d = state.period.days.find((dd) => dd.date === date);
        if (!d) { d = { id: uid(), date, trips: [] }; state.period.days.push(d); }
        d.trips.push({ id: uid(), ...tripData });
        noteHabit(tripData, date);
      });
      saveState();
      closeModal();
      exitMultiSelect();
      renderRegistro();
      updatePeriodBadge();
      showToast(`Trayecto añadido a ${batchDates.length} día(s)`);
      return true;
    }

    if (editing) {
      Object.assign(editing, tripData);
    } else {
      day.trips.push({ id: uid(), ...tripData });
      noteHabit(tripData, day.date);
    }
    saveState();
    closeModal();
    renderRegistro();
    showToast('Trayecto guardado');
    return true;
  }

  function showDuplicateWarning(dupCount, dayCount) {
    const text = dayCount > 1
      ? `En ${dupCount} de los ${dayCount} días ya hay un trayecto igual (mismo coche, km y personas). Pulsa otra vez para añadirlo igualmente.`
      : 'Ya hay un trayecto igual este día (mismo coche, km y personas). Pulsa otra vez para añadirlo igualmente.';
    let warn = qs('#tripDupWarning');
    if (!warn) {
      warn = document.createElement('p');
      warn.id = 'tripDupWarning';
      warn.className = 'dup-warning';
      warn.setAttribute('role', 'alert');
      qs('#wizardSaveBtn, #quickSaveBtn').before(warn);
    }
    warn.textContent = text;
    const btn = qs('#wizardSaveBtn, #quickSaveBtn');
    btn.textContent = 'Añadir igualmente';
    btn.classList.add('btn-warning');
  }

  /* ---- Formulario rápido: coche, km y pasajeros en una sola pantalla ---- */

  // Pasa lo escrito/marcado en pantalla a `selection` (antes de redibujar o guardar).
  function captureQuick() {
    const kmInput = qs('#quickKmInput');
    const km = kmInput ? parseFloat(kmInput.value) : NaN;
    selection.km = km > 0 ? km : null;
    if (kmInput) selection.savedTripId = null;
    const roundTripEl = qs('#quickRoundTrip');
    if (roundTripEl) selection.roundTrip = roundTripEl.checked;
    selection.passengerIds = qsa('#quickPassengers input[type="checkbox"]:checked').map((cb) => cb.value);
  }

  function quickReturnIds() {
    const car = state.cars.find((c) => c.id === selection.carId);
    const active = (id) => activePeople().some((p) => p.id === id) && id !== (car && car.driverId);
    return sameReturnUI ? [...selection.passengerIds] : selection.returnPassengerIds.filter(active);
  }

  function renderQuick() {
    ackedDuplicate = null;
    qs('#modalTitle').textContent = batchDates ? `Añadir trayecto a ${batchDates.length} día(s)` : 'Añadir trayecto';
    const cars = activeCars();
    const car = state.cars.find((c) => c.id === selection.carId);
    const driver = car ? state.people.find((p) => p.id === car.driverId) : null;
    const candidates = activePeople().filter((p) => p.id !== (car ? car.driverId : null));
    const kmChips = frequentKm(state.tripHabits || [], selection.carId, 4);

    const carHTML = cars.length > 1
      ? `<div class="wizard-chip-row">${cars.map((c) => `
          <button type="button" class="wizard-chip ${selection.carId === c.id ? 'selected' : ''}" data-quick-car="${c.id}">${esc(c.name)}</button>`).join('')}</div>`
      : '';

    qs('#modalBody').innerHTML = `
      <div class="quick-form">
        <p class="quick-label">Coche</p>
        ${carHTML}
        <p class="hint" style="margin:${cars.length > 1 ? '6px' : '0'} 0 14px;">${car ? `${icon('car')} ${esc(car.name)} · conduce ${esc(driver ? driver.name : '—')}` : ''}</p>

        <p class="quick-label">Km <span class="quick-label-hint">(de un solo sentido)</span></p>
        <input type="number" id="quickKmInput" class="input quick-km" inputmode="decimal" step="0.1" min="0" value="${selection.km || ''}" placeholder="15" enterkeyhint="done">
        <div class="wizard-chip-row quick-km-chips" id="quickKmChips">
          ${kmChips.map((k) => `<button type="button" class="wizard-chip" data-km="${k}">${esc(String(k).replace('.', ','))} km</button>`).join('')}
          ${[1, 5, 10].map((n) => `<button type="button" class="wizard-chip chip-step" data-km-add="${n}" aria-label="Sumar ${n} km">+${n}</button>`).join('')}
        </div>

        <label class="field-toggle" style="margin:14px 0 4px;">
          <input type="checkbox" id="quickRoundTrip" ${selection.roundTrip ? 'checked' : ''}>
          <span>${icon('repeat')} Es de ida y vuelta</span>
        </label>
        ${selection.roundTrip && !sameReturnUI ? `<p class="hint" style="margin:0 0 6px;">La vuelta lleva a otras personas, como en el último trayecto. Cámbialo en «Más opciones».</p>` : ''}

        <p class="quick-label" style="margin-top:14px;">¿Quién iba? <span class="quick-label-hint">(aparte del conductor)</span></p>
        <div class="checkbox-grid" id="quickPassengers">
          ${candidates.length ? candidates.map((p) => `
            <label class="checkbox-row">
              <input type="checkbox" value="${p.id}" ${selection.passengerIds.includes(p.id) ? 'checked' : ''}>
              <span>${esc(p.name)}</span>
            </label>`).join('') : '<p class="hint">No hay más personas que el conductor. Añade personas en Configuración.</p>'}
        </div>

        <button type="button" class="btn btn-primary btn-block mt-8" id="quickSaveBtn">${batchDates ? `Añadir a ${batchDates.length} día(s)` : 'Guardar trayecto'}</button>
        <button type="button" class="btn btn-secondary btn-block mt-8" id="quickMoreBtn">Más opciones (vuelta distinta, partes…)</button>
      </div>`;

    const modalBodyEl = qs('#modalBody');
    modalBodyEl.classList.remove('step-anim');
    void modalBodyEl.offsetWidth;
    modalBodyEl.classList.add('step-anim');

    const kmInput = qs('#quickKmInput');
    const syncKmChips = () => {
      const v = parseFloat(kmInput.value);
      qsa('#quickKmChips [data-km]').forEach((b) => b.classList.toggle('selected', Number(b.dataset.km) === v));
    };
    syncKmChips();

    qsa('[data-quick-car]').forEach((btn) => btn.addEventListener('click', () => {
      captureQuick();
      selection.carId = btn.dataset.quickCar;
      const newCar = state.cars.find((c) => c.id === selection.carId);
      selection.passengerIds = selection.passengerIds.filter((id) => id !== newCar.driverId);
      selection.returnPassengerIds = selection.returnPassengerIds.filter((id) => id !== newCar.driverId);
      renderQuick();
    }));
    qsa('#quickKmChips [data-km]').forEach((btn) => btn.addEventListener('click', () => {
      kmInput.value = btn.dataset.km;
      syncKmChips();
      kmInput.focus();
    }));
    qsa('#quickKmChips [data-km-add]').forEach((btn) => btn.addEventListener('click', () => {
      const next = Math.round(((parseFloat(kmInput.value) || 0) + Number(btn.dataset.kmAdd)) * 10) / 10;
      kmInput.value = next;
      syncKmChips();
      kmInput.focus();
    }));
    kmInput.addEventListener('input', syncKmChips);
    kmInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); qs('#quickSaveBtn').click(); } });
    qs('#quickRoundTrip').addEventListener('change', () => { captureQuick(); renderQuick(); });

    qs('#quickMoreBtn').addEventListener('click', () => {
      captureQuick();
      if (selection.roundTrip && sameReturnUI) selection.returnPassengerIds = [...selection.passengerIds];
      step = selection.km ? 3 : 2;
      renderStep();
    });

    qs('#quickSaveBtn').addEventListener('click', (e) => {
      captureQuick();
      if (!selection.km) { showToast('Introduce unos km válidos'); kmInput.focus(); return; }
      // Solo se deshabilita una vez pasa la validación (igual que en el
      // asistente): así un doble toque no crea el trayecto dos veces.
      e.target.disabled = true;
      const passengerIds = [...selection.passengerIds];
      const returnPassengerIds = selection.roundTrip ? quickReturnIds() : undefined;
      if (!commitTrip(passengerIds, returnPassengerIds, undefined)) e.target.disabled = false;
    });

    kmInput.focus();
    if (selection.km) kmInput.select();
  }

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
    ackedDuplicate = null;
    qs('#modalTitle').textContent = batchDates ? `Añadir trayecto a ${batchDates.length} día(s)` : (editing ? 'Editar trayecto' : 'Añadir trayecto');

    const stepsHtml = `<div class="wizard-steps">${[1, 2, 3].map((n) => `
      <button type="button" class="wizard-dot ${step === n ? 'active' : ''} ${step !== n && stepDone(n) ? 'done' : ''}" data-step="${n}">${n}</button>
    `).join('')}</div>`;

    let bodyHtml;
    if (step === 1) {
      bodyHtml = `
        <h3 class="wizard-title">Paso 1 de 3 · ¿Qué coche?</h3>
        <div class="wizard-options">
          ${carChoices.map((c) => {
            const driver = state.people.find((p) => p.id === c.driverId);
            return `
            <button type="button" class="wizard-option ${selection.carId === c.id ? 'selected' : ''}" data-car-id="${c.id}">
              <span class="wizard-option-title">${icon('car')} ${esc(c.name)}${archivedTagHTML(state.cars, c.id)}</span>
              <span class="wizard-option-sub">Conduce ${esc(driver ? driver.name : '—')} · ${c.consumption} L/100km</span>
            </button>`;
          }).join('')}
        </div>`;
    } else if (step === 2) {
      bodyHtml = `
        <h3 class="wizard-title">Paso 2 de 3 · ¿Cuántos km?</h3>
        <label class="field-toggle" style="margin-bottom:14px;">
          <input type="checkbox" id="roundTripToggle" ${selection.roundTrip ? 'checked' : ''}>
          <span>${icon('repeat')} Es de ida y vuelta</span>
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
      // Las personas eliminadas no se ofrecen, salvo que ya fueran en el
      // trayecto que se edita: si no, al guardarlo se perderían de él.
      const editingIds = editing ? [...(editing.passengerIds || []), ...(editing.returnPassengerIds || [])] : [];
      const passengerCandidates = state.people.filter((p) => p.id !== (car ? car.driverId : null) && (!p.archived || editingIds.includes(p.id)));

      const renderPassengerCheckboxes = (checkedIds, containerKind) => passengerCandidates.length
        ? passengerCandidates.map((p) => `
            <label class="checkbox-row ${selection.useWeights ? 'weight-checkbox-row' : ''}">
              <input type="checkbox" value="${p.id}" ${checkedIds.includes(p.id) ? 'checked' : ''}>
              <span>${esc(p.name)}${archivedTagHTML(state.people, p.id)}</span>
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
            <span>${icon('scale')} Repartir en partes distintas (no a partes iguales)</span>
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

        if (!commitTrip(passengerIds, returnPassengerIds, weights)) e.target.disabled = false;
      });
    }

    if (step > 1) {
      qs('#wizardBackBtn').addEventListener('click', () => { step -= 1; renderStep(); });
    }
  }
}

