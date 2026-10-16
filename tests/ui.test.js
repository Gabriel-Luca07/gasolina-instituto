'use strict';

/* Pruebas de interfaz: cargan la app real (index.html?uitest) en un iframe,
   con datos inventados y sin tocar los guardados, y la manejan como un
   usuario: pulsar botones, mirar el DOM. Se abren con tests-ui.html. */

const UI_KEY = 'gasolinaInstitutoState_v1_uitest';
const frame = document.getElementById('appFrame');
const results = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Espera a que algo ocurra (en vez de adivinar cuánto tarda).
async function waitFor(cond, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end && !cond()) await sleep(50);
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'la condición no se cumple'); }
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ? msg + ': ' : ''}esperaba ${b}, salió ${a}`);
}

function localISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Ana y Luis conducen un coche cada uno; Luis va con Ana y Marta con Luis:
// Luis le debe 4,5 a Ana y Marta le debe 4,5 a Luis.
function seedState(extra) {
  const today = localISO(new Date());
  const trip = (id, carId, passengerIds) => ({ id, carId, km: 100, passengerIds, roundTrip: false, consumption: 6, pricePerL: 1.5 });
  return Object.assign({
    version: 1,
    people: [{ id: 'ana', name: 'Ana' }, { id: 'luis', name: 'Luis' }, { id: 'marta', name: 'Marta' }],
    cars: [
      { id: 'c1', name: 'Coche de Ana', driverId: 'ana', consumption: 6, useOwnPrice: false, ownPrice: null },
      { id: 'c2', name: 'Coche de Luis', driverId: 'luis', consumption: 6, useOwnPrice: false, ownPrice: null }
    ],
    globalPrice: 1.5,
    savedTrips: [],
    driverPays: true,
    settleMode: 'pairwise',
    period: { id: 'p1', createdAt: today, days: [{ id: 'd1', date: today, trips: [trip('t1', 'c1', ['luis']), trip('t2', 'c2', ['marta'])] }], settlements: [] },
    history: [],
    theme: 'light',
    refuels: [],
    lastBackupAt: today,
    backupReminderFrom: today,
    closeReminderDays: 0
  }, extra || {});
}

// Carga la app desde cero con ese estado y devuelve utilidades para manejarla.
async function openApp(extra) {
  localStorage.setItem(UI_KEY, JSON.stringify(seedState(extra)));
  await new Promise((resolve) => {
    frame.onload = resolve;
    frame.src = 'index.html?uitest&t=' + Date.now();
  });
  await sleep(150);
  const win = frame.contentWindow;
  const doc = frame.contentDocument;

  // Nada de abrir bandejas del sistema ni descargar archivos en las pruebas:
  // se anota lo que se intentaría compartir.
  const shared = { files: [], texts: [] };
  win.tryShareFile = async (file) => { shared.files.push(file); return true; };
  win.tryShareText = async (text) => { shared.texts.push(text); return true; };

  const q = (sel) => doc.querySelector(sel);
  const click = async (sel) => {
    const el = typeof sel === 'string' ? q(sel) : sel;
    assert(el, `no existe ${sel}`);
    el.click();
    // Cambiar de pestaña anima la salida y la entrada: se espera a que termine.
    await sleep(String(sel).includes('.tab-btn') ? 550 : 80);
  };
  return { win, doc, q, click, shared };
}

function test(name, fn) { results.push({ name, fn }); }

/* ------------------------------ Pruebas ------------------------------- */

test('la app arranca y se ve el Registro', async () => {
  const { q } = await openApp();
  assert(q('#tab-registro.active'), 'el panel Registro no está activo');
  assert(q('.tab-btn.active[data-tab="registro"]'), 'la pestaña Registro no está marcada');
});

test('al cambiar de pestaña se marca la activa y cada pestaña tiene icono', async () => {
  const { doc, q, click } = await openApp();
  await click('.tab-btn[data-tab="resumen"]');
  assert(q('.tab-btn.active[data-tab="resumen"]'), 'Resumen no queda activa');
  assertEq(doc.querySelectorAll('.tab-btn .tab-icon svg.icon').length, 4, 'iconos SVG en las pestañas');
});

test('ningún texto de la interfaz lleva emojis', async () => {
  const { doc, click } = await openApp();
  for (const tab of ['resumen', 'config', 'historial', 'registro']) await click(`.tab-btn[data-tab="${tab}"]`);
  const clone = doc.body.cloneNode(true);
  clone.querySelectorAll('script, style').forEach((n) => n.remove());
  const found = clone.textContent.match(/\p{Extended_Pictographic}/gu);
  assert(!found, `emojis encontrados: ${found}`);
});

test('no hay caracteres rotos (codificación) en textos ni etiquetas', async () => {
  const { doc, click } = await openApp();
  for (const tab of ['resumen', 'config', 'historial', 'registro']) await click(`.tab-btn[data-tab="${tab}"]`);
  const clone = doc.body.cloneNode(true);
  clone.querySelectorAll('script, style').forEach((n) => n.remove());
  const labels = [...clone.querySelectorAll('[aria-label], [title], [placeholder]')]
    .map((n) => `${n.getAttribute('aria-label') || ''} ${n.getAttribute('title') || ''} ${n.getAttribute('placeholder') || ''}`).join(' ');
  const broken = (clone.textContent + ' ' + labels).match(/[ÃÂ]|�/g);
  assert(!broken, `caracteres rotos: ${broken}`);
});

test('todos los botones sin texto tienen nombre accesible', async () => {
  const { doc, click } = await openApp();
  for (const tab of ['resumen', 'config', 'historial', 'registro']) await click(`.tab-btn[data-tab="${tab}"]`);
  const nameless = [...doc.querySelectorAll('button')].filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label'));
  assertEq(nameless.map((b) => b.id || b.dataset.action || b.className), [], 'botones sin nombre');
});

test('modo simplificado: de dos pagos pasa a uno solo en Resumen', async () => {
  const { doc, q, click } = await openApp();
  await click('.tab-btn[data-tab="resumen"]');
  assertEq(doc.querySelectorAll('#summaryContent .debt-item').length, 2, 'filas en persona a persona');
  const select = q('#settleModeSelect');
  select.value = 'simplified';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(60);
  const rows = [...doc.querySelectorAll('#summaryContent .debt-item')];
  assertEq(rows.length, 1, 'filas en simplificado');
  assert(/Marta/.test(rows[0].textContent) && /Ana/.test(rows[0].textContent), 'debería ser Marta → Ana');
});

test('compartir ofrece imagen y texto', async () => {
  const { q, click } = await openApp();
  await click('.tab-btn[data-tab="resumen"]');
  await click('#shareSummaryBtn');
  assert(q('#shareAsImageBtn') && q('#shareAsTextBtn'), 'faltan las dos opciones');
});

test('compartir como texto envía la tabla de deudas y el detalle', async () => {
  const { q, click, shared } = await openApp();
  await click('.tab-btn[data-tab="resumen"]');
  await click('#shareSummaryBtn');
  await click('#shareAsTextBtn');
  assertEq(shared.texts.length, 1, 'veces que se comparte texto');
  const text = shared.texts[0];
  assert(text.includes('Quién paga a quién') && text.includes('Paga'), 'falta la tabla de deudas');
  assert(text.includes('Detalle de trayectos'), 'falta el detalle');
  assert(!/\p{Extended_Pictographic}/u.test(text), 'el texto lleva emojis');
  assert(q('#modalOverlay').classList.contains('hidden'), 'el selector debería cerrarse');
});

test('compartir como imagen envía un PNG', async () => {
  const { click, shared } = await openApp();
  await click('.tab-btn[data-tab="resumen"]');
  await click('#shareSummaryBtn');
  await click('#shareAsImageBtn');
  await waitFor(() => shared.files.length > 0, 5000);
  assertEq(shared.files.length, 1, 'archivos compartidos');
  assertEq(shared.files[0].type, 'image/png');
  assert(shared.files[0].size > 5000, 'la imagen parece vacía');
});

test('un pago parcial muestra cuánto queda pendiente', async () => {
  const { doc, q, click } = await openApp();
  await click('.tab-btn[data-tab="resumen"]');
  await click('[data-action="settle-debt"]');
  const input = q('#settleAmountInput');
  assert(input, 'no se abrió el diálogo de pago');
  assert(/saldada/.test(q('#settleRemaining').textContent), 'con el importe entero debería quedar saldada');
  input.value = '1.00';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  assert(/parcial/i.test(q('#settleRemaining').textContent), 'debería avisar del pago parcial');
  await click('#settleSaveBtn');
  assertEq(doc.defaultView.eval('state').period.settlements.length, 1, 'pagos registrados');
});

test('cerrar periodo guarda en el Historial y se puede deshacer', async () => {
  const { win, q, click, shared } = await openApp({ lastBackupAt: null });
  await click('.tab-btn[data-tab="resumen"]');
  await click('#closePeriodBtn');
  assert(q('#closeBackupToggle').checked, 'la copia debería venir marcada si no hay copia de hoy');
  await click('#closeOkBtn');
  await sleep(200);
  assertEq(win.eval('state').history.length, 1, 'periodos en el historial');
  assertEq(win.eval('state').period.days.length, 0, 'el periodo nuevo debería estar vacío');
  assertEq(shared.files.length, 1, 'copias de seguridad compartidas');
  assert(/^gasolina-backup-.*\.json$/.test(shared.files[0].name), 'nombre de la copia');
  await click('#toastUndoBtn');
  assertEq(win.eval('state').history.length, 0, 'historial tras deshacer');
  assertEq(win.eval('state').period.days.length, 1, 'días del periodo tras deshacer');
  assertEq(win.eval('state').people.length, 3, 'personas tras deshacer');
});

test('cerrar periodo sin copia no comparte ningún archivo', async () => {
  const { click, q, shared } = await openApp();
  await click('.tab-btn[data-tab="resumen"]');
  await click('#closePeriodBtn');
  assert(!q('#closeBackupToggle').checked, 'con copia de hoy no debería venir marcada');
  await click('#closeOkBtn');
  await sleep(100);
  assertEq(shared.files.length, 0);
});

test('Exportar JSON comparte el archivo en vez de descargarlo', async () => {
  const { click, shared } = await openApp();
  await click('.tab-btn[data-tab="config"]');
  await click('#exportDataBtn');
  await sleep(100);
  assertEq(shared.files.length, 1);
  assert(/\.json$/.test(shared.files[0].name), 'debería ser un .json');
});

test('el historial se exporta a CSV', async () => {
  const entry = { id: 'h1', range: '1 sep', startDate: '2026-09-01', endDate: '2026-09-01', closedAt: '2026-09-02', summary: { totalCost: 9, tripCount: 1, totalKm: 100, perCar: [], perPerson: [{ personId: 'ana', name: 'Ana', share: 9 }] } };
  const { q, click, shared } = await openApp({ history: [entry] });
  await click('.tab-btn[data-tab="historial"]');
  assert(!q('#exportHistoryCsvBtn').classList.contains('hidden'), 'el botón CSV debería verse');
  await click('#exportHistoryCsvBtn');
  await sleep(100);
  assertEq(shared.files.length, 1);
  assert(/\.csv$/.test(shared.files[0].name), 'debería ser un .csv');
  const text = await shared.files[0].text();
  assert(text.includes('Ana;9,00'), `contenido inesperado: ${text}`);
});

test('el botón CSV no aparece sin historial', async () => {
  const { q } = await openApp();
  assert(q('#exportHistoryCsvBtn').classList.contains('hidden'));
});

/* ------------------------- Registro rápido -------------------------- */

const setValue = (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
const stateOf = (win) => win.eval('state');

test('añadir trayecto abre un formulario de una sola pantalla', async () => {
  const { doc, q, click } = await openApp();
  await click('#dayList [data-action="add-trip"]');
  assert(q('#quickKmInput') && q('#quickPassengers') && q('#quickSaveBtn'), 'faltan coche, km o pasajeros');
  assertEq(doc.querySelectorAll('.wizard-dot').length, 0, 'no debería haber pasos');
  assert(doc.activeElement === q('#quickKmInput'), 'el campo de km debería tener el foco');
});

test('guardar con km y pasajeros crea el trayecto y lo anota como hábito', async () => {
  const { win, q, doc, click } = await openApp();
  const before = stateOf(win).period.days[0].trips.length;
  await click('#dayList [data-action="add-trip"]');
  setValue(q('#quickKmInput'), '20');
  doc.querySelector('#quickPassengers input[value="marta"]').checked = true;
  await click('#quickSaveBtn');
  const trips = stateOf(win).period.days[0].trips;
  assertEq(trips.length, before + 1, 'trayectos del día');
  const added = trips[trips.length - 1];
  assertEq([added.km, added.passengerIds], [20, ['marta']]);
  assert(stateOf(win).tripHabits.some((h) => h.km === 20), 'debería quedar como hábito');
});

test('sin km no guarda y avisa', async () => {
  const { win, q, click } = await openApp();
  const before = stateOf(win).period.days[0].trips.length;
  await click('#dayList [data-action="add-trip"]');
  await click('#quickSaveBtn');
  assertEq(stateOf(win).period.days[0].trips.length, before);
  assert(!q('#modalOverlay').classList.contains('hidden'), 'el formulario debería seguir abierto');
});

test('atajos de km: los habituales y +1/+5/+10 rellenan el campo', async () => {
  const { q, doc, click } = await openApp();
  await click('#dayList [data-action="add-trip"]');
  const chip = q('#quickKmChips [data-km]');
  assert(chip, 'debería haber un atajo con los km habituales');
  await click(chip);
  assertEq(q('#quickKmInput').value, '100');
  assert(chip.classList.contains('selected'), 'el atajo debería marcarse');
  await click('#quickKmChips [data-km-add="10"]');
  assertEq(q('#quickKmInput').value, '110');
  await click('#quickKmChips [data-km-add="1"]');
  assertEq(q('#quickKmInput').value, '111');
});

test('si ya hay un trayecto igual ese día avisa y se añade al confirmar', async () => {
  const { win, q, doc, click } = await openApp();
  const before = stateOf(win).period.days[0].trips.length;
  await click('#dayList [data-action="add-trip"]');
  // Igual que el primero de la semilla: Coche de Ana, 100 km, con Luis.
  setValue(q('#quickKmInput'), '100');
  doc.querySelector('#quickPassengers input[value="luis"]').checked = true;
  await click('#quickSaveBtn');
  assert(q('#tripDupWarning'), 'debería avisar del duplicado');
  assertEq(stateOf(win).period.days[0].trips.length, before, 'no debería guardar todavía');
  assert(/igualmente/.test(q('#quickSaveBtn').textContent), 'el botón debería ofrecer añadirlo igualmente');
  await click('#quickSaveBtn');
  assertEq(stateOf(win).period.days[0].trips.length, before + 1, 'trayectos tras confirmar');
});

test('"Más opciones" lleva al asistente con lo ya escrito', async () => {
  const { q, click } = await openApp();
  await click('#dayList [data-action="add-trip"]');
  setValue(q('#quickKmInput'), '12');
  await click('#quickMoreBtn');
  assert(q('#wizardSaveBtn'), 'debería abrirse el paso de pasajeros');
  assert(q('#weightedToggle') || q('#modalBody .checkbox-grid'), 'debería mostrar las opciones avanzadas');
});

test('editar un trayecto sigue usando el asistente por pasos', async () => {
  const { doc, q, click } = await openApp();
  await click('#dayList [data-action="edit-trip"]');
  assertEq(doc.querySelectorAll('.wizard-dot').length, 3, 'pasos del asistente');
  assert(!q('#quickKmInput'), 'editar no usa el formulario rápido');
});

test('"Lo de siempre": un toque añade el trayecto sugerido y se puede deshacer', async () => {
  const seed = seedState();
  const yesterday = localISO(new Date(Date.now() - 86400000));
  seed.period.days.unshift({ id: 'd0', date: yesterday, trips: [] });
  const { win, doc, click } = await openApp({ period: seed.period });
  const card = () => doc.querySelector('.day-card[data-day-id="d0"]');
  const chips = () => card().querySelectorAll('.suggest-chip');
  const before = chips().length;
  assert(before >= 1, 'el día vacío debería mostrar sugerencias');
  assertEq(doc.querySelector('.day-card[data-day-id="d1"]').querySelectorAll('.suggest-chip').length, 0, 'un día que ya tiene esos trayectos no los repite');
  await click(chips()[0]);
  const day = () => stateOf(win).period.days.find((d) => d.id === 'd0');
  assertEq(day().trips.length, 1, 'trayectos tras tocar la sugerencia');
  assertEq(chips().length, before - 1, 'la sugerencia usada desaparece');
  await click('#toastUndoBtn');
  assertEq(day().trips.length, 0, 'trayectos tras deshacer');
  assertEq(chips().length, before, 'la sugerencia vuelve');
});

test('con un solo coche no se pide elegir coche', async () => {
  const seed = seedState();
  const { q, doc, click } = await openApp({
    cars: [seed.cars[0]],
    period: { ...seed.period, days: [{ ...seed.period.days[0], trips: [] }] }
  });
  await click('#dayList [data-action="add-trip"]');
  assertEq(doc.querySelectorAll('[data-quick-car]').length, 0, 'chips de coche');
  assert(/Coche de Ana/.test(q('.quick-form').textContent), 'debería decir qué coche es');
});

test('varios días a la vez: el formulario rápido añade el trayecto a todos', async () => {
  const { win, q, doc, click } = await openApp();
  const d1 = localISO(new Date(Date.now() - 2 * 86400000));
  const d2 = localISO(new Date(Date.now() - 3 * 86400000));
  win.openTripModal(null, null, [d1, d2]);
  await sleep(80);
  assert(/2 día\(s\)/.test(q('#modalTitle').textContent), 'el título debería decir cuántos días');
  setValue(q('#quickKmInput'), '9');
  doc.querySelector('#quickPassengers input[value="marta"]').checked = true;
  await click('#quickSaveBtn');
  const days = stateOf(win).period.days;
  [d1, d2].forEach((d) => {
    const day = days.find((x) => x.date === d);
    assert(day && day.trips.length === 1 && day.trips[0].km === 9, `falta el trayecto el ${d}`);
  });
  assertEq(stateOf(win).tripHabits.find((h) => h.km === 9).count, 2, 'cuenta como dos veces');
});

test('si el último trayecto tenía otra gente a la vuelta, se conserva y se avisa', async () => {
  const { win, q, doc, click } = await openApp({
    lastTrip: { carId: 'c1', savedTripId: null, km: 30, passengerIds: ['luis'], roundTrip: true, returnPassengerIds: ['marta'] }
  });
  await click('#dayList [data-action="add-trip"]');
  assert(q('#quickRoundTrip').checked, 'ida y vuelta debería venir marcada');
  assert(/otras personas/.test(q('.quick-form').textContent), 'debería avisar de que la vuelta es distinta');
  assertEq(q('#quickKmInput').value, '30', 'km del último trayecto');
  await click('#quickSaveBtn');
  const trips = stateOf(win).period.days[0].trips;
  const added = trips[trips.length - 1];
  assertEq([added.passengerIds, added.returnPassengerIds], [['luis'], ['marta']]);
});

test('copiar el día anterior también alimenta las sugerencias', async () => {
  const seed = seedState();
  const yesterday = localISO(new Date(Date.now() - 86400000));
  // Hoy sin trayectos y ayer con uno: sin hábitos de partida.
  const trips = seed.period.days[0].trips;
  const { win, doc, click } = await openApp({
    tripHabits: [],
    period: { ...seed.period, days: [{ id: 'dy', date: yesterday, trips: [trips[0]] }, { id: 'dt', date: seed.period.days[0].date, trips: [] }] }
  });
  stateOf(win).tripHabits.length = 0;
  await click('.day-card[data-day-id="dt"] [data-action="copy-day"]');
  assertEq(stateOf(win).period.days.find((d) => d.id === 'dt').trips.length, 1, 'trayectos copiados');
  assertEq(stateOf(win).tripHabits.length, 1, 'hábitos tras copiar');
});

test('Configuración ofrece buscar actualización y reinstalar; el aviso viejo ya no existe', async () => {
  const { doc, q, click } = await openApp();
  await click('.tab-btn[data-tab="config"]');
  assert(q('#checkUpdateBtn') && q('#reinstallAppBtn'), 'faltan los botones de actualización');
  assert(!q('#updateBanner'), 'el aviso "Actualizar" ya no debería existir');
  assert(/Actualizaciones/.test(doc.body.textContent));
});

test('"Reinstalar la app" pide confirmación y cancelar no toca los datos', async () => {
  const { win, q, click } = await openApp();
  await click('.tab-btn[data-tab="config"]');
  const before = JSON.stringify(stateOf(win).people);
  await click('#reinstallAppBtn');
  assert(/no se tocan/.test(q('#modalBody').textContent), 'debería explicar que los datos no se tocan');
  await click('#confirmCancelBtn');
  assert(q('#modalOverlay').classList.contains('hidden'), 'cancelar debería cerrar el diálogo');
  assertEq(JSON.stringify(stateOf(win).people), before, 'personas');
});

test('sin hábitos no se muestra "Lo de siempre"', async () => {
  const { doc } = await openApp({ period: { id: 'p1', createdAt: localISO(new Date()), days: [{ id: 'd1', date: localISO(new Date()), trips: [] }], settlements: [] } });
  assertEq(doc.querySelectorAll('.suggest-block').length, 0);
});

/* ------------------------------ Resultado ----------------------------- */

(async function run() {
  for (const t of results) {
    try { await t.fn(); t.ok = true; } catch (e) { t.ok = false; t.error = e.message; }
  }
  localStorage.removeItem(UI_KEY);
  frame.src = 'about:blank';
  const failed = results.filter((r) => !r.ok);
  const summary = document.getElementById('summary');
  summary.className = failed.length ? 'fail' : 'ok';
  summary.textContent = failed.length
    ? `✗ ${failed.length} de ${results.length} pruebas fallan`
    : `✓ ${results.length} pruebas de interfaz correctas`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  document.getElementById('results').innerHTML = results.map((r) => `
    <li class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✓' : '✗'} ${esc(r.name)}${r.ok ? '' : `<pre>${esc(r.error)}</pre>`}</li>`).join('');
  window.testResults = { total: results.length, failed: failed.map((r) => `${r.name}: ${r.error}`) };
})();
