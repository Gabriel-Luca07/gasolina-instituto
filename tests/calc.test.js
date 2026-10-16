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

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'la condición no se cumple');
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

// Luis debe 4,5 a Ana (va en su coche) y Marta debe 4,5 a Luis (va en el suyo).
function chainState(settleMode, settlements) {
  return makeState({
    settleMode,
    cars: [
      { id: 'c1', name: 'Coche de Ana', driverId: 'ana', consumption: 6 },
      { id: 'c2', name: 'Coche de Luis', driverId: 'luis', consumption: 6 }
    ],
    period: period([day('2026-09-02', [
      trip({ carId: 'c1', passengerIds: ['luis'] }),
      trip({ carId: 'c2', passengerIds: ['marta'] })
    ])], settlements)
  });
}

test('modo persona a persona: cada pareja salda por separado', () => {
  state = chainState('pairwise');
  const s = computePeriodSummary(state.period);
  assertEq(s.debts.length, 2);
  assertClose(debt(s, 'luis', 'ana').amount, 4.5);
  assertClose(debt(s, 'marta', 'luis').amount, 4.5);
});

test('modo simplificado: Marta paga directamente a Ana y Luis no paga nada', () => {
  state = chainState('simplified');
  const s = computePeriodSummary(state.period);
  assertEq(s.debts.length, 1);
  assertEq([s.debts[0].fromId, s.debts[0].toId], ['marta', 'ana']);
  assertClose(s.debts[0].amount, 4.5);
});

test('modo simplificado: un pago registrado se descuenta del saldo', () => {
  state = chainState('simplified', [{ id: 's', fromId: 'marta', toId: 'luis', amount: 4.5 }]);
  const s = computePeriodSummary(state.period);
  // Marta ya le dio 4,5 a Luis: ahora es Luis quien le debe 4,5 a Ana, y Marta nada.
  assertEq(s.debts.length, 1);
  assertEq([s.debts[0].fromId, s.debts[0].toId], ['luis', 'ana']);
  assertClose(s.debts[0].amount, 4.5);
});

test('modo simplificado: el total que se paga cuadra con lo que se cobra', () => {
  state = makeState({
    settleMode: 'simplified',
    cars: [
      { id: 'c1', name: 'Coche de Ana', driverId: 'ana', consumption: 6 },
      { id: 'c2', name: 'Coche de Luis', driverId: 'luis', consumption: 8, useOwnPrice: true, ownPrice: 2 }
    ],
    period: period([day('2026-09-02', [
      trip({ carId: 'c1', passengerIds: ['luis', 'marta'] }),
      trip({ carId: 'c2', km: 60, passengerIds: ['ana', 'marta'] })
    ])])
  });
  const s = computePeriodSummary(state.period);
  const net = {};
  s.debts.forEach((d) => { net[d.fromId] = (net[d.fromId] || 0) - d.amount; net[d.toId] = (net[d.toId] || 0) + d.amount; });
  const expected = {};
  s.pairwiseDebts.forEach((d) => { expected[d.fromId] = (expected[d.fromId] || 0) - d.amount; expected[d.toId] = (expected[d.toId] || 0) + d.amount; });
  ['ana', 'luis', 'marta'].forEach((id) => assertClose(net[id] || 0, expected[id] || 0, id));
  if (s.debts.length > s.pairwiseDebts.length) throw new Error('simplificar no debería dar más pagos');
});

test('agrupar por pagador: cada persona sale una sola vez con su total', () => {
  const g = groupDebtsByPayer([
    { from: 'Marta', to: 'Ana', amount: 4 },
    { from: 'Luis', to: 'Ana', amount: 1 },
    { from: 'Marta', to: 'Luis', amount: 2 }
  ]);
  assertEq(g.map((x) => x.from), ['Marta', 'Luis']);
  assertClose(g[0].total, 6);
  assertEq(g[0].items.map((i) => i.to), ['Ana', 'Luis']);
});

test('detalle de trayectos: coste y reparto por persona, y por tramo si es ida y vuelta', () => {
  state = makeState({
    period: period([
      day('2026-09-03', [trip({ roundTrip: true, passengerIds: ['luis'], returnPassengerIds: ['marta'] })]),
      day('2026-09-02', [trip({ passengerIds: ['luis'] })])
    ])
  });
  const d = buildTripDetails(state.period);
  assertEq(d.map((x) => x.date), ['2026-09-02', '2026-09-03']);
  assertClose(d[0].trips[0].cost, 9);
  assertEq(d[0].trips[0].legs[0].shares.map((s) => s.name), ['Luis', 'Ana']);
  assertClose(d[0].trips[0].legs[0].shares[0].share, 4.5);
  assertEq(d[1].trips[0].legs.length, 2);
  assertClose(d[1].trips[0].cost, 18);
  assertEq(d[1].trips[0].legs[1].shares.map((s) => s.name), ['Marta', 'Ana']);
});

/* ------------------- Hábitos: sugerencias, km, duplicados ------------------ */

const habitTrip = (props) => Object.assign({ carId: 'c1', km: 15, roundTrip: false, passengerIds: ['luis'] }, props);

test('trayecto repetido: el orden de los pasajeros no importa, los km y los pesos sí', () => {
  assert(isSameTrip(habitTrip({ passengerIds: ['luis', 'marta'] }), habitTrip({ passengerIds: ['marta', 'luis'] })));
  assert(!isSameTrip(habitTrip(), habitTrip({ km: 16 })));
  assert(!isSameTrip(habitTrip(), habitTrip({ passengerIds: [] })));
  assert(!isSameTrip(habitTrip(), habitTrip({ weights: { luis: 2 } })));
  assert(!isSameTrip(habitTrip({ roundTrip: true }), habitTrip()));
});

test('ida y vuelta con distintos pasajeros en la vuelta no es el mismo trayecto', () => {
  const a = habitTrip({ roundTrip: true, passengerIds: ['luis'], returnPassengerIds: ['luis'] });
  const b = habitTrip({ roundTrip: true, passengerIds: ['luis'], returnPassengerIds: ['marta'] });
  assert(!isSameTrip(a, b));
});

test('anotar hábitos: cuenta repeticiones y días de la semana, y no anota repartos con partes', () => {
  const habits = [];
  recordHabit(habits, habitTrip(), '2026-09-14'); // lunes
  recordHabit(habits, habitTrip(), '2026-09-21'); // lunes
  recordHabit(habits, habitTrip(), '2026-09-16'); // miércoles
  recordHabit(habits, habitTrip({ weights: { luis: 2 } }), '2026-09-16');
  assertEq(habits.length, 1);
  assertEq(habits[0].count, 3);
  assertEq(habits[0].dows, [0, 2, 0, 1, 0, 0, 0]);
  assertEq(habits[0].lastUsed, '2026-09-21');
});

test('los hábitos no pasan del máximo y se queda lo más usado', () => {
  const habits = [];
  for (let km = 1; km <= MAX_HABITS + 5; km++) recordHabit(habits, habitTrip({ km }), '2026-09-14');
  recordHabit(habits, habitTrip({ km: 7 }), '2026-09-15');
  assertEq(habits.length, MAX_HABITS);
  assert(habits.some((h) => h.km === 7), 'el más repetido debería seguir');
});

test('sugerencias: primero lo más habitual y de ese día de la semana; no repite lo ya apuntado', () => {
  state = makeState({
    cars: [
      { id: 'c1', name: 'Coche de Ana', driverId: 'ana', consumption: 6 },
      { id: 'c2', name: 'Coche de Luis', driverId: 'luis', consumption: 6 }
    ]
  });
  const habits = [];
  for (let i = 0; i < 3; i++) recordHabit(habits, habitTrip({ km: 10 }), '2026-09-15'); // 3 martes
  for (let i = 0; i < 2; i++) recordHabit(habits, habitTrip({ km: 20, passengerIds: ['marta'] }), '2026-09-14'); // 2 lunes
  recordHabit(habits, habitTrip({ km: 30, carId: 'c2', passengerIds: ['marta'] }), '2026-09-20'); // 1 domingo
  const kms = (list) => list.map((h) => h.km);

  // Un lunes pesan más los de los lunes, aunque haya uno más repetido en total.
  assertEq(kms(suggestTrips(habits, '2026-09-28', [])), [20, 10, 30]);
  // Un martes, el de los martes.
  assertEq(kms(suggestTrips(habits, '2026-09-29', []))[0], 10);
  // Lo que ya está apuntado ese día no se vuelve a sugerir.
  assertEq(kms(suggestTrips(habits, '2026-09-28', [habitTrip({ km: 20, passengerIds: ['marta'] })])), [10, 30]);
  // Con límite.
  assertEq(suggestTrips(habits, '2026-09-28', [], 1).length, 1);
});

test('sugerencias: se ignoran coches y personas que ya no están activos o el conductor como pasajero', () => {
  state = makeState({
    people: [{ id: 'ana', name: 'Ana' }, { id: 'luis', name: 'Luis', archived: true }, { id: 'marta', name: 'Marta' }],
    cars: [
      { id: 'c1', name: 'Coche de Ana', driverId: 'ana', consumption: 6 },
      { id: 'c2', name: 'Viejo', driverId: 'ana', consumption: 6, archived: true }
    ]
  });
  const habits = [];
  recordHabit(habits, habitTrip({ km: 11, passengerIds: ['luis'] }), '2026-09-14'); // Luis está de baja
  recordHabit(habits, habitTrip({ km: 12, carId: 'c2', passengerIds: [] }), '2026-09-14'); // coche eliminado
  recordHabit(habits, habitTrip({ km: 13, passengerIds: ['ana'] }), '2026-09-14'); // el conductor no es pasajero
  recordHabit(habits, habitTrip({ km: 14, passengerIds: ['marta'] }), '2026-09-14');
  assertEq(suggestTrips(habits, '2026-09-28', []).map((h) => h.km), [14]);
});

test('atajos de km: los más usados de ese coche, de mayor a menor', () => {
  const habits = [];
  [[10, 3], [25, 5], [8, 1]].forEach(([km, n]) => { for (let i = 0; i < n; i++) recordHabit(habits, habitTrip({ km }), '2026-09-14'); });
  recordHabit(habits, habitTrip({ km: 99, carId: 'c2' }), '2026-09-14');
  assertEq(frequentKm(habits, 'c1'), [25, 10, 8]);
  assertEq(frequentKm(habits, 'c1', 2), [25, 10]);
  assertEq(frequentKm(habits, 'c9'), []);
});

test('un hábito se convierte en un trayecto nuevo con el precio de hoy', () => {
  state = makeState();
  const habits = [];
  recordHabit(habits, habitTrip({ roundTrip: true, passengerIds: ['luis'], returnPassengerIds: ['marta'] }), '2026-09-14');
  const t = tripFromHabit(habits[0]);
  assertEq([t.carId, t.km, t.roundTrip, t.passengerIds, t.returnPassengerIds], ['c1', 15, true, ['luis'], ['marta']]);
  assertEq([t.consumption, t.pricePerL], [6, 1.5]);
  assert(t.id && t.weights === undefined);
});

test('hábitos de un periodo ya apuntado (para quien actualiza la app)', () => {
  const p = period([day('2026-09-14', [trip({ km: 15, passengerIds: ['luis'] })]), day('2026-09-21', [trip({ km: 15, passengerIds: ['luis'] })])]);
  const habits = habitsFromPeriod(p);
  assertEq(habits.length, 1);
  assertEq(habits[0].count, 2);
});

test('importar: los hábitos con coches o datos inexistentes se descartan y, sin ellos, se reconstruyen', () => {
  const raw = JSON.parse(JSON.stringify(makeState({
    period: period([day('2026-09-14', [trip({ km: 15, passengerIds: ['luis'] })])])
  })));
  // Sin el campo (copia antigua): se reconstruyen desde el periodo.
  delete raw.tripHabits;
  assertEq(sanitizeImportedState(JSON.parse(JSON.stringify(raw))).state.tripHabits.length, 1);
  // Con campo: solo los válidos, y sin personas que ya no existen.
  raw.tripHabits = [
    { carId: 'c1', km: 15, roundTrip: false, passengerIds: ['luis', 'fantasma'], returnPassengerIds: [], count: 2, lastUsed: '2026-09-14', dows: [0, 1, 0, 0, 0, 0, 1] },
    { carId: 'no-existe', km: 15, count: 1, lastUsed: '2026-09-14' },
    { carId: 'c1', km: -3, count: 1, lastUsed: '2026-09-14' },
    { carId: 'c1', km: 5, count: 1, lastUsed: 'ayer' }
  ];
  const h = sanitizeImportedState(JSON.parse(JSON.stringify(raw))).state.tripHabits;
  assertEq(h.length, 1);
  assertEq(h[0].passengerIds, ['luis']);
});

test('CSV del historial: cabecera, una fila por persona, decimales con coma y comillas', () => {
  const entry = (id, range, start, perPerson) => ({
    id, range, startDate: start, endDate: start, closedAt: start,
    summary: { totalCost: 12.5, tripCount: 3, totalKm: 100, perCar: [], perPerson }
  });
  const csv = buildHistoryCSV([
    entry('b', '5 oct', '2026-10-05', [{ personId: 'ana', name: 'Ana "la jefa"', share: 12.5 }]),
    entry('a', '28 sep', '2026-09-28', [{ personId: 'ana', name: 'Ana', share: 7.25 }, { personId: 'luis', name: 'Luis', share: 5.25 }])
  ]);
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  assertEq(lines.length, 4);
  assertEq(lines[0], 'Periodo;Inicio;Fin;Cerrado el;Persona;Consumo (€);Total del periodo (€);Km;Trayectos');
  assertEq(lines[1].split(';').slice(4, 6), ['Ana', '7,25']); // el más antiguo primero
  assertEq(lines[3].split(';')[4], '"Ana ""la jefa"""');
  assertEq(csv.charAt(0), '﻿');
});

test('importar conserva el modo de deudas y uno desconocido vuelve a persona a persona', () => {
  const raw = JSON.parse(JSON.stringify(makeState({ settleMode: 'simplified' })));
  assertEq(sanitizeImportedState(raw).state.settleMode, 'simplified');
  raw.settleMode = 'otro';
  assertEq(sanitizeImportedState(raw).state.settleMode, 'pairwise');
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
