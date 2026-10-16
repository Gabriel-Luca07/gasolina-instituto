'use strict';

/* Cálculo puro (sin tocar el DOM): costes, reparto, deudas, consumo real, importación. Es lo que cubren las pruebas de tests.html. */

/* =====================================================================
   CÁLCULO
   ===================================================================== */

function effectivePrice(car) {
  if (car.useOwnPrice && typeof car.ownPrice === 'number' && car.ownPrice > 0) return car.ownPrice;
  return state.globalPrice;
}

// Cada trayecto guarda el consumo y el precio que tenía su coche al crearlo:
// así, cambiar el precio de la gasolina o el consumo de un coche no
// recalcula en silencio los trayectos que ya estaban apuntados. Los
// trayectos antiguos sin estos campos usan los valores actuales del coche.
function tripRatesFromCar(car) {
  return { consumption: car.consumption, pricePerL: effectivePrice(car) };
}

function tripRates(trip, car) {
  return {
    consumption: trip.consumption > 0 ? trip.consumption : (car ? car.consumption || 0 : 0),
    pricePerL: trip.pricePerL > 0 ? trip.pricePerL : (car ? effectivePrice(car) : 0)
  };
}

function computeTripCost(trip, car) {
  if (!car) return 0;
  const { consumption, pricePerL } = tripRates(trip, car);
  return (trip.km || 0) * consumption / 100 * pricePerL;
}

// Coste total de un trayecto tal y como se muestra al usuario: si es de
// ida y vuelta, el coste de los km introducidos (un solo sentido) se cuenta dos veces.
function computeTripDisplayCost(trip) {
  const car = state.cars.find((c) => c.id === trip.carId);
  const legCost = computeTripCost(trip, car);
  return trip.roundTrip ? legCost * 2 : legCost;
}

// Fija precio y consumo en los trayectos del periodo que aún no los tienen
// (creados antes de existir esta función, o importados de una copia vieja).
function freezeUnratedTrips() {
  let changed = false;
  state.period.days.forEach((day) => day.trips.forEach((t) => {
    const car = state.cars.find((c) => c.id === t.carId);
    if (!car || (t.consumption > 0 && t.pricePerL > 0)) return;
    Object.assign(t, tripRatesFromCar(car));
    changed = true;
  }));
  if (changed) saveState();
}
// Reparto de un tramo (un trayecto normal es uno; uno de ida y vuelta, dos):
// coste del tramo y parte de cada persona.
function splitTripLeg(trip, car, legPassengerIds) {
  const cost = computeTripCost(trip, car);

  const splitSet = new Set((legPassengerIds || []).filter((id) => state.people.some((p) => p.id === id)));
  if (state.driverPays) splitSet.add(car.driverId);
  if (splitSet.size === 0) splitSet.add(car.driverId);

  // Reparto por "partes": quien no tenga un peso propio en trip.weights
  // cuenta como 1 parte (el reparto a partes iguales de siempre). Con
  // pesos iguales para todos esto da exactamente lo mismo que antes.
  const weights = trip.weights || {};
  const totalWeight = [...splitSet].reduce((sum, pid) => sum + (weights[pid] || 1), 0);

  const shares = [...splitSet].map((pid) => ({ personId: pid, share: cost * (weights[pid] || 1) / totalWeight }));
  return { cost, shares };
}

function tripLegs(trip) {
  return trip.roundTrip
    ? [trip.passengerIds, trip.returnPassengerIds || trip.passengerIds]
    : [trip.passengerIds];
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
      tripLegs(trip).forEach((legPassengerIds) => {
        const { cost, shares } = splitTripLeg(trip, car, legPassengerIds);
        totalCost += cost;
        tripCount++;

        if (!perCarMap.has(car.id)) perCarMap.set(car.id, { car, totalCost: 0, totalKm: 0, tripCount: 0 });
        const agg = perCarMap.get(car.id);
        agg.totalCost += cost;
        agg.totalKm += (trip.km || 0);
        agg.tripCount++;

        shares.forEach(({ personId: pid, share }) => {
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

  const simplifiedDebts = simplifyDebts(pairDebts);
  const debts = state.settleMode === 'simplified' ? simplifiedDebts : pairwiseDebts;

  const totalKm = perCar.reduce((sum, c) => sum + (c.totalKm || 0), 0);

  return { totalCost, tripCount, dayCount, totalKm, perCar, perPerson, pairwiseBalances, pairwiseDebts, simplifiedDebts, debts };
}

// Modo "simplificado": en vez de saldar cada pareja por separado, se calcula
// el saldo neto de cada persona (lo que debe menos lo que le deben) y se
// emparejan deudores con acreedores de mayor a menor. Así se hacen los
// mínimos pagos posibles: si A debe a B y B debe a C, A le paga a C y B
// no tiene que hacer nada.
function simplifyDebts(pairDebts) {
  const balance = new Map(); // + = le deben, - = debe
  pairDebts.forEach((amount, key) => {
    const [debtorId, creditorId] = key.split('|');
    balance.set(debtorId, (balance.get(debtorId) || 0) - amount);
    balance.set(creditorId, (balance.get(creditorId) || 0) + amount);
  });
  const nameOf = (id) => (state.people.find((p) => p.id === id) || {}).name || '?';
  const side = (sign) => [...balance.entries()]
    .filter(([, v]) => v * sign > 0.005)
    .map(([id, v]) => ({ id, left: Math.abs(v) }))
    .sort((a, b) => b.left - a.left);
  const debtors = side(-1);
  const creditors = side(1);

  const result = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left);
    if (amount > 0.005) {
      result.push({ from: nameOf(debtors[i].id), to: nameOf(creditors[j].id), fromId: debtors[i].id, toId: creditors[j].id, amount });
    }
    debtors[i].left -= amount;
    creditors[j].left -= amount;
    if (debtors[i].left <= 0.005) i++;
    if (creditors[j].left <= 0.005) j++;
  }
  return result.sort((a, b) => b.amount - a.amount);
}

// Deudas a mostrar según el modo elegido. Los periodos del Historial cerrados
// antes de existir el modo solo traen las de persona a persona.
function debtsOf(summary) {
  return summary.debts || summary.pairwiseDebts || [];
}

// Agrupa las deudas por quien paga: cada pagador sale una sola vez, con los
// que tiene que pagar y su total. Es lo que se comparte como tabla.
function groupDebtsByPayer(debts) {
  const groups = new Map();
  debts.forEach((d) => {
    const g = groups.get(d.from) || { from: d.from, total: 0, items: [] };
    g.total += d.amount;
    g.items.push({ to: d.to, amount: d.amount });
    groups.set(d.from, g);
  });
  return [...groups.values()]
    .map((g) => ({ ...g, items: g.items.sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.total - a.total || a.from.localeCompare(b.from));
}

// Detalle del periodo para compartir: por día y trayecto, qué coche, cuántos
// km, cuánto cuesta y cuánto paga cada persona (por tramo si es ida y vuelta).
function buildTripDetails(period) {
  const nameOf = (id) => (state.people.find((p) => p.id === id) || {}).name || '?';
  return getSortedDays(period)
    .map((day) => ({
      date: day.date,
      trips: day.trips.map((trip) => {
        const car = state.cars.find((c) => c.id === trip.carId);
        if (!car) return null;
        const legs = tripLegs(trip).map((ids) => {
          const { cost, shares } = splitTripLeg(trip, car, ids);
          return { cost, shares: shares.map((s) => ({ name: nameOf(s.personId), share: s.share })) };
        });
        return {
          carName: car.name,
          driverName: nameOf(car.driverId),
          km: trip.km || 0,
          roundTrip: !!trip.roundTrip,
          cost: legs.reduce((sum, l) => sum + l.cost, 0),
          legs
        };
      }).filter(Boolean)
    }))
    .filter((d) => d.trips.length > 0);
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

// CSV del Historial para abrir en Excel/Hojas de cálculo: una fila por
// persona y periodo cerrado (más antiguo primero). Separador ";" y decimales
// con coma, que es lo que espera una hoja en español; el BOM del principio
// hace que Excel respete los acentos.
function buildHistoryCSV(history) {
  const num = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');
  const cell = (v) => {
    const s = String(v == null ? '' : v);
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const km = (s) => (typeof s.totalKm === 'number' ? s.totalKm : (s.perCar || []).reduce((sum, c) => sum + (c.totalKm || 0), 0));

  const rows = [['Periodo', 'Inicio', 'Fin', 'Cerrado el', 'Persona', 'Consumo (€)', 'Total del periodo (€)', 'Km', 'Trayectos']];
  [...history]
    .sort((a, b) => (a.startDate || a.closedAt || '').localeCompare(b.startDate || b.closedAt || ''))
    .forEach((h) => {
      const s = h.summary || {};
      const people = (s.perPerson || []).length ? s.perPerson : [{ name: '', share: 0 }];
      people.forEach((p) => rows.push([
        h.range || '', h.startDate || '', h.endDate || '', h.closedAt || '',
        p.name, num(p.share), num(s.totalCost), num(km(s)), s.tripCount || 0
      ]));
    });
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

function getSortedDays(period) {
  return [...period.days].sort((a, b) => a.date.localeCompare(b.date));
}

// Días que lleva abierto el periodo, contando desde su primer día con
// trayectos. null si todavía no tiene ninguno.
function periodAgeDays(period, today) {
  const withTrips = getSortedDays(period).filter((d) => d.trips.length > 0);
  return withTrips.length ? daysBetween(withTrips[0].date, today) : null;
}

function shouldRemindClosePeriod(today) {
  if (!state.closeReminderDays) return false;
  if (state.closeReminderSnoozedUntil && today < state.closeReminderSnoozedUntil) return false;
  const age = periodAgeDays(state.period, today);
  return age !== null && age >= state.closeReminderDays;
}

// Eliminar una persona solo la archiva: deja de aparecer en Configuración y
// al añadir trayectos, pero sus trayectos y pagos del periodo actual se
// conservan para que el reparto y las deudas no cambien. Se purga del todo
// al cerrar el periodo (el Historial ya guarda los nombres por su cuenta).
function activePeople() {
  return state.people.filter((p) => !p.archived);
}

// Los coches funcionan igual: al eliminarlos se archivan.
function activeCars() {
  return state.cars.filter((c) => !c.archived);
}

// Consumo real de un coche a partir de sus repostajes, suponiendo que se
// llena el depósito cada vez: los litros de todos los repostajes menos el
// primero son lo gastado en los km recorridos entre el primero y el último.
// Los km salen de los trayectos del periodo actual y de los periodos cerrados
// que caen enteros dentro de ese intervalo. Devuelve null si no hay datos.
const MIN_KM_FOR_REAL_CONSUMPTION = 50;

function tripTotalKm(trip) {
  return (trip.km || 0) * (trip.roundTrip ? 2 : 1);
}

function computeRealConsumption(carId) {
  const refuels = state.refuels.filter((r) => r.carId === carId).sort((a, b) => a.date.localeCompare(b.date));
  if (refuels.length < 2) return null;
  const from = refuels[0].date;
  const to = refuels[refuels.length - 1].date;
  const liters = refuels.slice(1).reduce((sum, r) => sum + r.liters, 0);

  // Intervalo [from, to): lo del día del primer repostaje ya va con el
  // depósito lleno; lo del día del último se pagará en el siguiente.
  let km = 0;
  state.period.days
    .filter((d) => d.date >= from && d.date < to)
    .forEach((d) => d.trips.forEach((t) => { if (t.carId === carId) km += tripTotalKm(t); }));
  state.history
    .filter((h) => h.startDate && h.endDate && h.startDate >= from && h.endDate < to)
    .forEach((h) => (h.summary.perCar || []).forEach((c) => { if (c.carId === carId) km += c.totalKm || 0; }));

  if (km < MIN_KM_FOR_REAL_CONSUMPTION) return null;
  return { liters, km, consumption: liters / km * 100 };
}

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
      cleanPeople.push({ id: (typeof p.id === 'string' && p.id) ? p.id : uid(), name: p.name.trim(), ...(p.archived === true ? { archived: true } : {}) });
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
        ownPrice: (c.useOwnPrice && Number(c.ownPrice) > 0) ? Number(c.ownPrice) : null,
        ...(c.archived === true ? { archived: true } : {})
      });
    } else {
      issues.push(`El coche "${(c && c.name) || '(sin nombre)'}" (datos incompletos o conductor inválido).`);
    }
  });
  const carIds = new Set(cleanCars.map((c) => c.id));
  // Un coche activo necesita a su conductor activo (en la app no se puede
  // eliminar a quien conduce un coche; un archivo editado a mano sí podría).
  cleanCars.filter((c) => !c.archived).forEach((c) => {
    const driver = cleanPeople.find((p) => p.id === c.driverId);
    if (driver) delete driver.archived;
  });

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
    // Precio y consumo fijados al apuntarlo; si faltan, freezeUnratedTrips()
    // los rellena con los del coche al terminar la importación.
    const rates = (Number(t.consumption) > 0 && Number(t.pricePerL) > 0)
      ? { consumption: Number(t.consumption), pricePerL: Number(t.pricePerL) }
      : {};
    return {
      id: (typeof t.id === 'string' && t.id) ? t.id : uid(),
      ...rates,
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

  const rawRefuels = Array.isArray(raw.refuels) ? raw.refuels : [];
  const refuels = rawRefuels
    .filter((r) => r && carIds.has(r.carId) && typeof r.date === 'string' && Number(r.liters) > 0 && Number(r.amount) > 0)
    .map((r) => ({ id: (typeof r.id === 'string' && r.id) ? r.id : uid(), carId: r.carId, date: r.date, liters: Number(r.liters), amount: Number(r.amount) }));
  if (refuels.length !== rawRefuels.length) issues.push(`${rawRefuels.length - refuels.length} repostaje(s) con datos incompletos.`);
  const isISODate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

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
      pin: null,
      settleMode: raw.settleMode === 'simplified' ? 'simplified' : 'pairwise',
      refuels,
      lastBackupAt: isISODate(raw.lastBackupAt) ? raw.lastBackupAt : null,
      // Recién importada, la copia está a salvo en el archivo de origen.
      backupReminderFrom: todayISO(),
      closeReminderDays: [0, 7, 14, 30].includes(raw.closeReminderDays) ? raw.closeReminderDays : 30,
      closeReminderSnoozedUntil: null
    },
    issues
  };
}

// Solo se pueden copiar trayectos cuyo coche sigue activo: uno eliminado ya
// no debería recibir trayectos nuevos.
function isCopyableTrip(t) {
  return activeCars().some((c) => c.id === t.carId);
}

// La copia es un trayecto nuevo: se calcula con el precio y consumo de hoy
// y sin las personas que ya se han eliminado.
function cloneTrip(t) {
  const car = state.cars.find((c) => c.id === t.carId);
  const active = new Set(activePeople().map((p) => p.id));
  const keepActive = (ids) => (ids || []).filter((id) => active.has(id));
  let weights;
  if (t.weights) {
    weights = {};
    Object.keys(t.weights).forEach((pid) => { if (active.has(pid)) weights[pid] = t.weights[pid]; });
    if (Object.keys(weights).length === 0) weights = undefined;
  }
  return {
    id: uid(),
    ...(car ? tripRatesFromCar(car) : {}),
    carId: t.carId,
    km: t.km,
    savedTripId: t.savedTripId || null,
    passengerIds: keepActive(t.passengerIds),
    roundTrip: !!t.roundTrip,
    returnPassengerIds: t.roundTrip ? keepActive(t.returnPassengerIds || t.passengerIds) : undefined,
    weights
  };
}
