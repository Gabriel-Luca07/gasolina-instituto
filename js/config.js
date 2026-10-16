'use strict';

/* Pestaña Configuración: personas, coches, precio, repostajes, trayectos guardados y datos. */

// Tras cambiar el precio o el consumo, pregunta si se aplica también a los
// trayectos ya apuntados en el periodo (por defecto solo afecta a los nuevos).
function offerRepriceTrips(carIds) {
  const affected = [];
  state.period.days.forEach((day) => day.trips.forEach((t) => {
    if (!carIds.includes(t.carId)) return;
    const car = state.cars.find((c) => c.id === t.carId);
    const now = tripRatesFromCar(car);
    if (t.consumption !== now.consumption || t.pricePerL !== now.pricePerL) affected.push([t, now]);
  }));
  if (affected.length === 0) return;
  confirmModal({
    title: 'Trayectos ya apuntados',
    message: `Hay ${affected.length} trayecto(s) en este periodo calculados con el valor anterior. ¿Recalcularlos también con el nuevo?`,
    confirmLabel: 'Recalcular todos',
    cancelLabel: 'Solo los nuevos',
    onConfirm: () => {
      affected.forEach(([t, now]) => Object.assign(t, now));
      saveState();
      renderRegistro();
      showToast(`${affected.length} trayecto(s) recalculado(s)`);
    }
  });
}

// Tras cualquier cambio en personas o coches (añadir, editar, eliminar,
// restaurar): todo lo que muestra nombres, conductores o consumos.
function renderRoster() {
  renderPeople();
  renderCars();
  renderRefuels();
  renderRegistro();
}

/* =====================================================================
   CONFIGURACIÓN: Personas
   ===================================================================== */

function renderPeople() {
  const list = qs('#peopleList');
  const people = activePeople();
  qs('#peopleEmptyState').classList.toggle('hidden', people.length > 0);
  list.innerHTML = people.map((p) => {
    const drivesCarNames = activeCars().filter((c) => c.driverId === p.id).map((c) => c.name);
    return `
    <div class="item-row" data-id="${p.id}">
      <div class="item-row-main">
        <div class="item-row-title">${esc(p.name)}</div>
        ${drivesCarNames.length ? `<div class="item-row-sub">Conduce: ${esc(drivesCarNames.join(', '))}</div>` : ''}
      </div>
      <div class="item-row-actions">
        <button type="button" class="icon-btn" data-action="edit-person" aria-label="Editar persona">${icon('pencil')}</button>
        <button type="button" class="icon-btn danger" data-action="delete-person" aria-label="Eliminar persona">${icon('trash')}</button>
      </div>
    </div>`;
  }).join('');
  renderArchivedSection('#archivedPeople', state.people.filter((p) => p.archived), 'Personas eliminadas', (p) => esc(p.name));
}

// Lista plegable con lo archivado (personas o coches) y un botón para
// recuperarlo. Se oculta si no hay nada archivado.
function renderArchivedSection(selector, items, label, titleFn) {
  const el = qs(selector);
  el.classList.toggle('hidden', items.length === 0);
  el.innerHTML = items.length ? `
    <details class="archived-section">
      <summary>${esc(label)} (${items.length})</summary>
      <p class="hint" style="margin:8px 0;">Siguen contando en los trayectos y deudas de este periodo. Al cerrarlo se borran del todo (el historial conserva sus nombres).</p>
      <div class="item-list">
        ${items.map((x) => `
          <div class="item-row" data-id="${x.id}">
            <div class="item-row-main"><div class="item-row-title">${titleFn(x)}</div></div>
            <button type="button" class="btn btn-secondary btn-sm" data-action="restore">Restaurar</button>
          </div>`).join('')}
      </div>
    </details>` : '';
}

qs('#archivedPeople').addEventListener('click', (e) => {
  if (!e.target.closest('[data-action="restore"]')) return;
  const person = state.people.find((p) => p.id === e.target.closest('.item-row').dataset.id);
  if (person) restorePerson(person);
});

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
    renderRoster(); // también avanza la guía inicial si estábamos en ella
    showToast('Guardado');
  });
}

function restorePerson(person) {
  delete person.archived;
  saveState();
  renderRoster();
  showToast(`${person.name} restaurado/a`);
}

function deletePerson(person) {
  const drivesAnyCar = activeCars().some((c) => c.driverId === person.id);
  if (drivesAnyCar) { showToast('Esta persona conduce un coche. Cambia el conductor antes de borrarla.'); return; }
  confirmModal({
    title: 'Eliminar persona',
    message: `¿Eliminar a ${person.name}? Sus trayectos y deudas de este periodo se conservan, igual que el historial.`,
    confirmLabel: 'Eliminar',
    danger: true,
    onConfirm: () => doDeletePerson(person)
  });
}

function doDeletePerson(person) {
  person.archived = true;
  saveState();
  renderRoster();
  showUndoToast(`${person.name} eliminado/a`, () => restorePerson(person));
}

/* =====================================================================
   CONFIGURACIÓN: Coches
   ===================================================================== */

function renderCars() {
  const list = qs('#carsList');
  const cars = activeCars();
  qs('#carsEmptyState').classList.toggle('hidden', cars.length > 0);
  renderArchivedSection('#archivedCars', state.cars.filter((c) => c.archived), 'Coches eliminados', (c) => `${icon('car')} ${esc(c.name)}`);
  list.innerHTML = cars.map((c) => {
    const driver = state.people.find((p) => p.id === c.driverId);
    const priceLabel = c.useOwnPrice && c.ownPrice ? `${formatPricePerL(c.ownPrice)} propio` : 'precio general';
    return `
    <div class="item-row" data-id="${c.id}">
      <div class="item-row-main">
        <div class="item-row-title">${icon('car')} ${esc(c.name)}</div>
        <div class="item-row-sub">Conductor: ${esc(driver ? driver.name : '—')} · ${c.consumption} L/100km · ${esc(priceLabel)}</div>
      </div>
      <div class="item-row-actions">
        <button type="button" class="icon-btn" data-action="edit-car" aria-label="Editar coche">${icon('pencil')}</button>
        <button type="button" class="icon-btn danger" data-action="delete-car" aria-label="Eliminar coche">${icon('trash')}</button>
      </div>
    </div>`;
  }).join('');
}

qs('#addCarBtn').addEventListener('click', () => {
  if (activePeople().length === 0) { showToast('Añade primero alguna persona'); return; }
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
  const peopleOptions = activePeople().map((p) => `<option value="${p.id}" ${car && car.driverId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
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

    let ratesChanged = false;
    if (car) {
      const before = tripRatesFromCar(car);
      Object.assign(car, { name, driverId, consumption, useOwnPrice, ownPrice: useOwnPrice ? ownPrice : null });
      const after = tripRatesFromCar(car);
      ratesChanged = before.consumption !== after.consumption || before.pricePerL !== after.pricePerL;
    } else {
      state.cars.push({ id: uid(), name, driverId, consumption, useOwnPrice, ownPrice: useOwnPrice ? ownPrice : null });
    }
    saveState();
    closeModal();
    renderRoster();
    showToast('Guardado');
    if (ratesChanged) offerRepriceTrips([car.id]);
  });
}

// Igual que con las personas, eliminar un coche solo lo archiva: sus
// trayectos del periodo siguen sumando con el precio con que se apuntaron.
function deleteCar(car) {
  confirmModal({
    title: 'Eliminar coche',
    message: `¿Eliminar el coche "${car.name}"? Sus trayectos de este periodo se conservan, igual que el historial.`,
    confirmLabel: 'Eliminar',
    danger: true,
    onConfirm: () => {
      car.archived = true;
      saveState();
      renderRoster();
      showUndoToast(`Coche "${car.name}" eliminado`, () => restoreCar(car));
    }
  });
}

function restoreCar(car) {
  delete car.archived;
  // Un coche no puede volver sin su conductor.
  const driver = state.people.find((p) => p.id === car.driverId);
  if (driver) delete driver.archived;
  saveState();
  renderRoster();
  showToast(`Coche "${car.name}" restaurado`);
}

qs('#archivedCars').addEventListener('click', (e) => {
  if (!e.target.closest('[data-action="restore"]')) return;
  const car = state.cars.find((c) => c.id === e.target.closest('.item-row').dataset.id);
  if (car) restoreCar(car);
});

/* =====================================================================
   CONFIGURACIÓN: Precio global y opción conductor paga
   ===================================================================== */

function renderConfigMisc() {
  qs('#globalPriceInput').value = state.globalPrice;
  qs('#driverPaysToggle').checked = state.driverPays;
  qs('#closeReminderSelect').value = String(state.closeReminderDays);
  qs('#settleModeSelect').value = state.settleMode;
  renderSecurityCard();
}

qs('#globalPriceInput').addEventListener('change', (e) => {
  const val = parseFloat(e.target.value);
  state.globalPrice = (val && val > 0) ? val : 0;
  saveState();
  renderRegistro();
  offerRepriceTrips(state.cars.filter((c) => !(c.useOwnPrice && c.ownPrice > 0)).map((c) => c.id));
});

qs('#driverPaysToggle').addEventListener('change', (e) => {
  state.driverPays = e.target.checked;
  saveState();
  renderRegistro();
});

qs('#settleModeSelect').addEventListener('change', (e) => {
  state.settleMode = e.target.value === 'simplified' ? 'simplified' : 'pairwise';
  saveState();
  renderRegistro();
  renderResumen();
});

qs('#closeReminderSelect').addEventListener('change', (e) => {
  state.closeReminderDays = Number(e.target.value);
  state.closeReminderSnoozedUntil = null;
  saveState();
  renderRegistro();
});

/* =====================================================================
   CONFIGURACIÓN: Repostajes (tickets reales de gasolinera)
   ===================================================================== */


function renderRefuels() {
  const list = qs('#refuelsList');
  const refuels = [...state.refuels].sort((a, b) => b.date.localeCompare(a.date));
  qs('#refuelsEmptyState').classList.toggle('hidden', refuels.length > 0);
  list.innerHTML = refuels.slice(0, 10).map((r) => {
    const car = state.cars.find((c) => c.id === r.carId);
    return `
    <div class="item-row" data-id="${r.id}">
      <div class="item-row-main">
        <div class="item-row-title">${icon('car')} ${esc(car ? car.name : 'Coche eliminado')} · ${esc(formatEUR(r.amount))}</div>
        <div class="item-row-sub">${esc(formatDateShort(r.date))} · ${esc(formatLiters(r.liters))} ·${esc(formatPricePerL(r.amount / r.liters))}</div>
      </div>
      <div class="item-row-actions">
        ${car ? `<button type="button" class="icon-btn" data-action="edit-refuel" aria-label="Editar repostaje">${icon('pencil')}</button>` : ''}
        <button type="button" class="icon-btn danger" data-action="delete-refuel" aria-label="Eliminar repostaje">${icon('trash')}</button>
      </div>
    </div>`;
  }).join('') + (refuels.length > 10 ? `<p class="hint" style="margin:4px 0 0;">Mostrando los 10 más recientes de ${refuels.length}.</p>` : '');

  const estimates = activeCars()
    .map((car) => ({ car, real: computeRealConsumption(car.id) }))
    .filter((x) => x.real);
  const box = qs('#realConsumption');
  box.classList.toggle('hidden', estimates.length === 0);
  box.innerHTML = estimates.length ? `
    <h3 class="subheading">Consumo real estimado</h3>
    <div class="item-list">
      ${estimates.map(({ car, real }) => {
        const differs = Math.abs(real.consumption - car.consumption) >= 0.2;
        return `
        <div class="item-row" data-car-id="${car.id}">
          <div class="item-row-main">
            <div class="item-row-title">${icon('car')} ${esc(car.name)}: ${esc(formatConsumption(real.consumption))}</div>
            <div class="item-row-sub">${esc(formatLiters(real.liters))} en${esc(formatKm(real.km))} · tienes puesto ${esc(formatConsumption(car.consumption))}</div>
          </div>
          ${differs ? '<button type="button" class="btn btn-secondary btn-sm" data-action="use-real-consumption">Usar este</button>' : ''}
        </div>`;
      }).join('')}
    </div>
    <p class="hint" style="margin:8px 0 0;">Calculado suponiendo que llenáis el depósito en cada repostaje. Cuantos más tickets, más fiable.</p>` : '';
}

qs('#addRefuelBtn').addEventListener('click', () => {
  if (activeCars().length === 0) { showToast('Añade primero un coche'); return; }
  openRefuelModal(null);
});

qs('#refuelsList').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  const id = e.target.closest('.item-row').dataset.id;
  const idx = state.refuels.findIndex((r) => r.id === id);
  if (idx === -1) return;
  if (action === 'edit-refuel') { openRefuelModal(state.refuels[idx]); return; }
  if (action !== 'delete-refuel') return;
  const [removed] = state.refuels.splice(idx, 1);
  saveState();
  renderRefuels();
  showUndoToast('Repostaje eliminado', () => {
    state.refuels.splice(idx, 0, removed);
    saveState();
    renderRefuels();
  });
});

qs('#realConsumption').addEventListener('click', (e) => {
  if (!e.target.closest('[data-action="use-real-consumption"]')) return;
  const car = state.cars.find((c) => c.id === e.target.closest('[data-car-id]').dataset.carId);
  const real = car && computeRealConsumption(car.id);
  if (!real) return;
  car.consumption = Math.round(real.consumption * 10) / 10;
  saveState();
  renderRoster();
  showToast(`${car.name}: consumo actualizado a ${formatConsumption(car.consumption)}`);
  offerRepriceTrips([car.id]);
});

function openRefuelModal(refuel) {
  const cars = state.cars.filter((c) => !c.archived || (refuel && refuel.carId === c.id));
  const selectedCarId = refuel ? refuel.carId
    : (state.lastTrip && activeCars().some((c) => c.id === state.lastTrip.carId) ? state.lastTrip.carId : activeCars()[0].id);
  const html = `
    <label class="field">
      <span>Coche</span>
      <select id="refuelCarSelect" class="input">${cars.map((c) => `<option value="${c.id}" ${c.id === selectedCarId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    </label>
    <label class="field">
      <span>Fecha</span>
      <input type="date" id="refuelDateInput" class="input" value="${refuel ? refuel.date : todayISO()}">
    </label>
    <div class="row-inline">
      <label class="field" style="flex:1;">
        <span>Litros</span>
        <input type="number" id="refuelLitersInput" class="input" inputmode="decimal" step="0.01" min="0" placeholder="40" value="${refuel ? refuel.liters : ''}">
      </label>
      <label class="field" style="flex:1;">
        <span>Importe (€)</span>
        <input type="number" id="refuelAmountInput" class="input" inputmode="decimal" step="0.01" min="0" placeholder="66.00" value="${refuel ? refuel.amount : ''}">
      </label>
    </div>
    <p class="hint" id="refuelPricePreview" style="margin:0 0 10px;">Precio por litro: —</p>
    <label class="field-toggle" style="margin-bottom:12px;">
      <input type="checkbox" id="refuelApplyToggle" ${refuel ? '' : 'checked'}>
      <span>Usar este precio en los trayectos nuevos de este coche</span>
    </label>
    <button type="button" class="btn btn-primary btn-block" id="refuelSaveBtn">${refuel ? 'Guardar cambios' : 'Guardar repostaje'}</button>
  `;
  openModal(refuel ? 'Editar repostaje' : 'Añadir repostaje', html);

  const readValues = () => ({
    liters: parseFloat(qs('#refuelLitersInput').value),
    amount: parseFloat(qs('#refuelAmountInput').value)
  });
  const updatePreview = () => {
    const { liters, amount } = readValues();
    qs('#refuelPricePreview').textContent = `Precio por litro: ${liters > 0 && amount > 0 ? formatPricePerL(amount / liters) : '—'}`;
  };
  qs('#refuelLitersInput').addEventListener('input', updatePreview);
  qs('#refuelAmountInput').addEventListener('input', updatePreview);
  updatePreview();

  qs('#refuelSaveBtn').addEventListener('click', (e) => {
    const carId = qs('#refuelCarSelect').value;
    const date = qs('#refuelDateInput').value || todayISO();
    const { liters, amount } = readValues();
    if (!(liters > 0)) { showToast('Introduce los litros'); return; }
    if (!(amount > 0)) { showToast('Introduce el importe'); return; }
    e.target.disabled = true;

    if (refuel) {
      Object.assign(refuel, { carId, date, liters, amount });
    } else {
      state.refuels.push({ id: uid(), carId, date, liters, amount });
    }
    const car = state.cars.find((c) => c.id === carId);
    const apply = qs('#refuelApplyToggle').checked && car;
    if (apply) {
      car.useOwnPrice = true;
      car.ownPrice = Math.round((amount / liters) * 1000) / 1000;
    }
    saveState();
    closeModal();
    renderRoster();
    showToast(apply ? `Guardado · ${car.name} usará ${formatPricePerL(car.ownPrice)}` : 'Repostaje guardado');
    if (apply) offerRepriceTrips([car.id]);
  });
}

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
        <button type="button" class="icon-btn" data-action="edit-saved" aria-label="Editar trayecto guardado">${icon('pencil')}</button>
        <button type="button" class="icon-btn danger" data-action="delete-saved" aria-label="Eliminar trayecto guardado">${icon('trash')}</button>
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

qs('#exportDataBtn').addEventListener('click', () => exportBackup());

// Descarga un archivo de texto (o lo comparte con la bandeja del móvil si
// puede: ahí se puede guardar en Archivos/iCloud o mandar por WhatsApp).
// Devuelve 'shared' o 'downloaded'.
async function saveOrShareTextFile(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const file = new File([blob], fileName, { type: mimeType });
  if (await tryShareFile(file)) return 'shared';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return 'downloaded';
}

// quiet: no muestra el aviso "Exportado" (para no tapar otros avisos, como el
// "Deshacer" de cerrar periodo).
async function exportBackup({ quiet = false } = {}) {
  state.lastBackupAt = todayISO();
  state.backupReminderFrom = state.lastBackupAt;
  saveState();
  renderBackupInfo();
  // El PIN no se incluye en la copia de seguridad: si se comparte o se sube
  // a otro sitio, no debería llevarse el candado de este dispositivo consigo.
  const exportState = { ...state, pin: undefined };
  const how = await saveOrShareTextFile(`gasolina-backup-${todayISO()}.json`, JSON.stringify(exportState, null, 2), 'application/json');
  if (!quiet) showToast(how === 'shared' ? 'Copia lista' : 'Copia descargada');
}

/* -------- Recordatorio de copia de seguridad -------- */

// Todo vive solo en el localStorage del móvil: si se borra el navegador o se
// pierde el teléfono, se pierde todo. Cada BACKUP_REMINDER_DAYS sin exportar
// (y si hay algo que perder) se muestra un aviso, que se puede posponer.
const BACKUP_REMINDER_DAYS = 14;

// Muestra la fecha de la última copia y, si toca, el aviso de arriba. Se
// llama en cada renderAll(), así que también se actualiza al importar o
// borrar los datos.
function renderBackupInfo() {
  const days = state.lastBackupAt ? daysBetween(state.lastBackupAt, todayISO()) : null;
  qs('#lastBackupInfo').textContent = state.lastBackupAt
    ? `Última copia: ${formatDateShort(state.lastBackupAt)} (${days === 0 ? 'hoy' : `hace ${days} día(s)`}).`
    : 'Todavía no has exportado ninguna copia.';

  const hasData = state.history.length > 0 || state.period.days.some((d) => d.trips.length > 0);
  const due = daysBetween(state.backupReminderFrom, todayISO()) >= BACKUP_REMINDER_DAYS;
  qs('#backupBanner').classList.toggle('hidden', !(hasData && due));
  qs('#backupBannerText').textContent = state.lastBackupAt
    ? `Hace ${days} días que no haces una copia de seguridad.`
    : 'Aún no has hecho ninguna copia de seguridad de tus datos.';
}

qs('#backupNowBtn').addEventListener('click', () => exportBackup());
qs('#backupLaterBtn').addEventListener('click', () => {
  // Posponer: vuelve a avisar dentro de una semana.
  state.backupReminderFrom = addDaysISO(todayISO(), -(BACKUP_REMINDER_DAYS - 7));
  saveState();
  renderBackupInfo();
});

qs('#importDataBtn').addEventListener('click', () => qs('#importFileInput').click());

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
    const summaryLine = `Se importarán ${importedState.people.filter((p) => !p.archived).length} persona(s), ${importedState.cars.filter((c) => !c.archived).length} coche(s) y ${importedState.history.length} periodo(s) cerrado(s). Esto reemplazará todos los datos actuales.`;
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
        freezeUnratedTrips();
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

