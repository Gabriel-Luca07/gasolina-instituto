'use strict';

/* Pruebas de js/calc.js. Se abren con tests.html en el navegador (servido
   desde un servidor local, igual que la app). Cada prueba monta su propio
   estado con makeState(): nunca se lee ni se guarda el de la app. */

// Las pruebas no deben escribir en localStorage.
saveState = () => {};

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
  }
}

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ? msg + ': ' : ''}esperaba ${b}, salió ${a}`);
}

function assertClose(actual, expected, msg) {
  if (typeof actual !== 'number' || Math.abs(actual - expected) > 0.005) {
    throw new Error(`${msg ? msg + ': ' : ''}esperaba ${expected}, salió ${actual}`);
  }
}

/* ------------------------------- Datos -------------------------------- */

// Ana conduce el c1 (6 L/100km); Luis y Marta van de pasajeros. Precio 1,50.
function makeState(overrides) {
  return Object.assign(createDefaultState(), {
    people: [{ id: 'ana', name: 'Ana' }, { id: 'luis', name: 'Luis' }, { id: 'marta', name: 'Marta' }],
    cars: [{ id: 'c1', name: 'Coche de Ana', driverId: 'ana', consumption: 6 }],
    globalPrice: 1.5
  }, overrides);
}

function period(days, settlements) {
  return { id: 'p', createdAt: '2026-09-01', days, settlements: settlements || [] };
}

function day(date, trips) {
  return { id: `d-${date}`, date, trips };
}

function trip(props) {
  return Object.assign({ id: Math.random().toString(36).slice(2), carId: 'c1', km: 100, passengerIds: [] }, props);
}

const debt = (s, from, to) => s.pairwiseDebts.find((d) => d.fromId === from && d.toId === to);
const share = (s, id) => (s.perPerson.find((p) => p.personId === id) || { share: 0 }).share;

/* -------------------------- Coste de un trayecto ----------------------- */

test('coste = km × consumo / 100 × precio', () => {
  state = makeState();
  assertClose(computeTripCost(trip({}), state.cars[0]), 9); // 100 × 6 / 100 × 1,5
});

test('el precio propio del coche tiene prioridad sobre el general', () => {
  state = makeState();
  state.cars[0].useOwnPrice = true;
  state.cars[0].ownPrice = 2;
  assertClose(effectivePrice(state.cars[0]), 2);
});

test('un trayecto con precio fijado no cambia al subir el precio', () => {
  state = makeState();
  const t = trip({ ...tripRatesFromCar(state.cars[0]) });
  state.globalPrice = 3;
  state.cars[0].consumption = 10;
  assertClose(computeTripCost(t, state.cars[0]), 9);
});

test('un trayecto antiguo sin precio fijado usa el del coche', () => {
  state = makeState();
  state.globalPrice = 2;
  assertClose(computeTripCost(trip({}), state.cars[0]), 12);
});

test('ida y vuelta cuenta el coste dos veces', () => {
  state = makeState();
  assertClose(computeTripDisplayCost(trip({ roundTrip: true })), 18);
});

test('freezeUnratedTrips fija precio y consumo en los trayectos que no los tienen', () => {
  state = makeState({ period: period([day('2026-09-02', [trip({ id: 'x' })])]) });
  freezeUnratedTrips();
  const t = state.period.days[0].trips[0];
  assertEq([t.consumption, t.pricePerL], [6, 1.5]);
});

/* ------------------------------ Reparto ------------------------------- */

test('a partes iguales entre conductor y pasajeros', () => {
  state = makeState({ period: period([day('2026-09-02', [trip({ passengerIds: ['luis', 'marta'] })])]) });
  const s = computePeriodSummary(state.period);
  assertClose(s.totalCost, 9);
  ['ana', 'luis', 'marta'].forEach((id) => assertClose(share(s, id), 3, id));
  assertClose(debt(s, 'luis', 'ana').amount, 3);
  assertClose(debt(s, 'marta', 'ana').amount, 3);
});

test('si el conductor no paga, se reparte solo entre los pasajeros', () => {
  state = makeState({ driverPays: false, period: period([day('2026-09-02', [trip({ passengerIds: ['luis', 'marta'] })])]) });
  const s = computePeriodSummary(state.period);
  assertClose(share(s, 'ana'), 0);
  assertClose(share(s, 'luis'), 4.5);
  assertClose(debt(s, 'marta', 'ana').amount, 4.5);
});

test('sin pasajeros y sin pagar el conductor, lo paga el conductor y nadie debe nada', () => {
  state = makeState({ driverPays: false, period: period([day('2026-09-02', [trip({})])]) });
  const s = computePeriodSummary(state.period);
  assertClose(share(s, 'ana'), 9);
  assertEq(s.pairwiseDebts.length, 0);
});

test('ida y vuelta con pasajeros distintos en cada tramo', () => {
  state = makeState({ period: period([day('2026-09-02', [trip({ roundTrip: true, passengerIds: ['luis'], returnPassengerIds: ['luis', 'marta'] })])]) });
  const s = computePeriodSummary(state.period);
  // Ida 9 € entre Ana y Luis (4,5 c/u); vuelta 9 € entre los tres (3 c/u).
  assertClose(share(s, 'luis'), 7.5);
  assertClose(share(s, 'marta'), 3);
  assertClose(share(s, 'ana'), 7.5);
  assertEq(s.tripCount, 2);
});

test('reparto por partes: quien tiene peso 2 paga el doble', () => {
  state = makeState({ period: period([day('2026-09-02', [trip({ passengerIds: ['luis', 'marta'], weights: { luis: 2 } })])]) });
  const s = computePeriodSummary(state.period);
  // 4 partes de 2,25 €: Ana 1, Luis 2, Marta 1.
  assertClose(share(s, 'luis'), 4.5);
  assertClose(share(s, 'marta'), 2.25);
  assertClose(share(s, 'ana'), 2.25);
});

test('las deudas mutuas entre dos conductores se netean', () => {
  state = makeState({
    cars: [
      { id: 'c1', name: 'Coche de Ana', driverId: 'ana', consumption: 6 },
      { id: 'c2', name: 'Coche de Luis', driverId: 'luis', consumption: 6 }
    ],
    period: period([day('2026-09-02', [
      trip({ carId: 'c1', passengerIds: ['luis'] }), // Luis debe 4,5 a Ana
      trip({ carId: 'c2', km: 50, passengerIds: ['ana'] }) // Ana debe 2,25 a Luis
    ])])
  });
  const s = computePeriodSummary(state.period);
  assertEq(s.pairwiseDebts.length, 1);
  assertClose(debt(s, 'luis', 'ana').amount, 2.25);
});

test('un pago registrado resta de la deuda', () => {
  state = makeState({ period: period([day('2026-09-02', [trip({ passengerIds: ['luis'] })])], [{ id: 's', fromId: 'luis', toId: 'ana', amount: 1.5 }]) });
  const s = computePeriodSummary(state.period);
  assertClose(debt(s, 'luis', 'ana').amount, 3);
});

test('pagar la deuda entera la hace desaparecer', () => {
  state = makeState({ period: period([day('2026-09-02', [trip({ passengerIds: ['luis'] })])], [{ id: 's', fromId: 'luis', toId: 'ana', amount: 4.5 }]) });
  assertEq(computePeriodSummary(state.period).pairwiseDebts.length, 0);
});

test('una persona archivada sigue contando en el periodo', () => {
  state = makeState({ period: period([day('2026-09-02', [trip({ passengerIds: ['luis', 'marta'] })])]) });
  state.people.find((p) => p.id === 'marta').archived = true;
  const s = computePeriodSummary(state.period);
  assertClose(share(s, 'marta'), 3);
  assertClose(debt(s, 'marta', 'ana').amount, 3);
  assertEq(activePeople().map((p) => p.id), ['ana', 'luis']);
});

test('un coche archivado sigue sumando sus trayectos', () => {
  state = makeState({ period: period([day('2026-09-02', [trip({ passengerIds: ['luis'] })])]) });
  state.cars[0].archived = true;
  assertClose(computePeriodSummary(state.period).totalCost, 9);
  assertEq(activeCars().length, 0);
});

/* ------------------------------ Historial ----------------------------- */

test('el acumulado del historial suma los periodos', () => {
  state = makeState({ period: period([day('2026-09-02', [trip({ passengerIds: ['luis'] })])]) });
  const summary = computePeriodSummary(state.period);
  state.history = [{ id: 'h1', summary }, { id: 'h2', summary }];
  const agg = computeHistoryAggregate();
  assertClose(agg.totalCost, 18);
  assertEq(agg.tripCount, 2);
  assertClose(agg.perPerson.find((p) => p.personId === 'luis').share, 9);
  assertClose(agg.pairwiseDebts[0].amount, 9);
});

/* ---------------------------- Consumo real ---------------------------- */

function refuel(date, liters) {
  return { id: date, carId: 'c1', date, liters, amount: liters * 1.5 };
}

test('consumo real: litros de los repostajes (menos el primero) entre los km recorridos', () => {
  state = makeState({
    refuels: [refuel('2026-09-01', 40), refuel('2026-09-10', 14)],
    period: period([day('2026-09-02', [trip({ km: 100 })]), day('2026-09-05', [trip({ km: 50, roundTrip: true })])])
  });
  const real = computeRealConsumption('c1');
  assertClose(real.km, 200);
  assertClose(real.consumption, 7); // 14 L / 200 km
});

test('consumo real: los trayectos del día del último repostaje no cuentan', () => {
  state = makeState({
    refuels: [refuel('2026-09-01', 40), refuel('2026-09-10', 7)],
    period: period([day('2026-09-02', [trip({ km: 100 })]), day('2026-09-10', [trip({ km: 300 })])])
  });
  assertClose(computeRealConsumption('c1').km, 100);
});

test('consumo real: suma los km de periodos cerrados dentro del intervalo', () => {
  state = makeState({
    refuels: [refuel('2026-09-01', 40), refuel('2026-09-20', 12)],
    history: [{ id: 'h', startDate: '2026-09-02', endDate: '2026-09-08', summary: { perCar: [{ carId: 'c1', totalKm: 100 }] } }],
    period: period([day('2026-09-15', [trip({ km: 100 })])])
  });
  const real = computeRealConsumption('c1');
  assertClose(real.km, 200);
  assertClose(real.consumption, 6);
});

test('consumo real: null con menos de dos repostajes o muy pocos km', () => {
  state = makeState({ refuels: [refuel('2026-09-01', 40)], period: period([day('2026-09-02', [trip({})])]) });
  assertEq(computeRealConsumption('c1'), null);
  state = makeState({ refuels: [refuel('2026-09-01', 40), refuel('2026-09-10', 2)], period: period([day('2026-09-02', [trip({ km: 20 })])]) });
  assertEq(computeRealConsumption('c1'), null);
});

/* ----------------------- Recordatorio de cierre ----------------------- */

test('antigüedad del periodo desde su primer día con trayectos', () => {
  const p = period([day('2026-09-01', []), day('2026-09-05', [trip({})])]);
  assertEq(periodAgeDays(p, '2026-09-15'), 10);
  assertEq(periodAgeDays(period([day('2026-09-01', [])]), '2026-09-15'), null);
});

test('recordar cerrar: cuando se pasa del plazo, salvo pospuesto o desactivado', () => {
  state = makeState({ closeReminderDays: 7, period: period([day('2026-09-01', [trip({})])]) });
  assertEq(shouldRemindClosePeriod('2026-09-07'), false);
  assertEq(shouldRemindClosePeriod('2026-09-08'), true);
  state.closeReminderSnoozedUntil = '2026-09-10';
  assertEq(shouldRemindClosePeriod('2026-09-09'), false);
  assertEq(shouldRemindClosePeriod('2026-09-10'), true);
  state.closeReminderDays = 0;
  assertEq(shouldRemindClosePeriod('2026-12-01'), false);
});

test('addDaysISO y daysBetween cruzan meses y años', () => {
  assertEq(addDaysISO('2026-12-30', 3), '2027-01-02');
  assertEq(daysBetween('2026-02-27', '2026-03-02'), 3);
});

/* ----------------------------- Importación ---------------------------- */

test('importar: descarta trayectos de coches inexistentes y avisa', () => {
  const raw = makeState({ period: period([day('2026-09-02', [trip({}), trip({ carId: 'nope' })])]) });
  const { state: imp, issues } = sanitizeImportedState(JSON.parse(JSON.stringify(raw)));
  assertEq(imp.period.days[0].trips.length, 1);
  assertEq(issues.length, 1);
});

test('importar: conserva archivados, precios fijados, pagos y repostajes', () => {
  const raw = makeState({
    refuels: [refuel('2026-09-01', 40)],
    period: period([day('2026-09-02', [trip({ passengerIds: ['marta'], consumption: 5, pricePerL: 1.7 })])], [{ id: 's', fromId: 'marta', toId: 'ana', amount: 1, date: '2026-09-03' }])
  });
  raw.people[2].archived = true;
  raw.cars[0].archived = true;
  const { state: imp, issues } = sanitizeImportedState(JSON.parse(JSON.stringify(raw)));
  assertEq(issues, []);
  assertEq(imp.people[2].archived, true);
  assertEq(imp.cars[0].archived, true);
  const t = imp.period.days[0].trips[0];
  assertEq([t.consumption, t.pricePerL], [5, 1.7]);
  assertEq(imp.period.settlements.length, 1);
  assertEq(imp.refuels.length, 1);
});

test('importar: rechaza lo que no es un objeto de la app', () => {
  let threw = false;
  try { sanitizeImportedState([1, 2, 3]); } catch (e) { threw = true; }
  assertEq(threw, true);
});

test('importar: nunca restaura el PIN', () => {
  const raw = makeState({ pin: '1234' });
  assertEq(sanitizeImportedState(JSON.parse(JSON.stringify(raw))).state.pin, null);
});

test('importar: reactiva al conductor archivado de un coche activo', () => {
  const raw = makeState();
  raw.people[0].archived = true; // Ana conduce c1, que sigue activo
  const { state: imp } = sanitizeImportedState(JSON.parse(JSON.stringify(raw)));
  assertEq(imp.people[0].archived, undefined);
});

/* --------------------------- Copiar trayectos ------------------------- */

test('copiar un trayecto quita a las personas eliminadas (y sus pesos)', () => {
  state = makeState();
  state.people.find((p) => p.id === 'marta').archived = true;
  const copy = cloneTrip(trip({ roundTrip: true, passengerIds: ['luis', 'marta'], returnPassengerIds: ['marta'], weights: { marta: 2 } }));
  assertEq(copy.passengerIds, ['luis']);
  assertEq(copy.returnPassengerIds, []);
  assertEq(copy.weights, undefined);
});

test('copiar un trayecto usa el precio de hoy, no el del original', () => {
  state = makeState();
  const copy = cloneTrip(trip({ consumption: 5, pricePerL: 1.2 }));
  assertEq([copy.consumption, copy.pricePerL], [6, 1.5]);
});

test('los trayectos de un coche eliminado no se pueden copiar', () => {
  state = makeState();
  assertEq(isCopyableTrip(trip({})), true);
  state.cars[0].archived = true;
  assertEq(isCopyableTrip(trip({})), false);
});

/* ------------------------------ Resultado ----------------------------- */

(function render() {
  const failed = results.filter((r) => !r.ok);
  const summary = document.getElementById('summary');
  summary.className = failed.length ? 'fail' : 'ok';
  summary.textContent = failed.length
    ? `✗ ${failed.length} de ${results.length} pruebas fallan`
    : `✓ ${results.length} pruebas correctas`;
  document.getElementById('results').innerHTML = results.map((r) => `
    <li class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✓' : '✗'} ${esc(r.name)}${r.ok ? '' : `<pre>${esc(r.error)}</pre>`}</li>`).join('');
  // Para poder leer el resultado desde la consola o una herramienta.
  window.testResults = { total: results.length, failed: failed.map((r) => `${r.name}: ${r.error}`) };
})();
