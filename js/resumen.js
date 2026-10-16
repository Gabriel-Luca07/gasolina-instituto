'use strict';

/* Pestaña Resumen: totales, deudas, pagos registrados y compartir. */

/* =====================================================================
   RENDER: RESUMEN
   ===================================================================== */

function renderSummaryBlocksHTML(summary, opts) {
  const interactive = !!(opts && opts.interactive);
  const personBars = !!(opts && opts.personBars);

  if (summary.tripCount === 0) {
    return `<p class="empty-state">Este periodo todavía no tiene trayectos registrados.</p>`;
  }

  // La etiqueta "de baja" solo en el periodo actual: en el Historial los
  // periodos cerrados son una foto fija y no dependen de quién siga activo.
  const personTag = (id) => (interactive ? archivedTagHTML(state.people, id) : '');
  const carTag = (id) => (interactive ? archivedTagHTML(state.cars, id) : '');

  const carsHTML = summary.perCar.map((c) => `
    <div class="summary-item">
      <div>
        <div class="summary-item-name">${icon('car')} ${esc(c.name)}${carTag(c.carId)}</div>
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
        <div class="summary-item-name">${esc(p.name)}${personTag(p.personId)}</div>
        <div class="summary-item-value">${esc(formatEUR(p.share))}</div>
      </div>
      ${personBars ? `<div class="person-bar-track"><div class="person-bar-fill" style="width:${Math.max(4, Math.round(p.share / maxShare * 100))}%;"></div></div>` : ''}
    </div>`).join('');

  // El botón para marcar una deuda como pagada solo tiene sentido en el
  // periodo actual (con ids de personas vivos): en Historial las deudas son
  // una foto fija de periodos ya cerrados.
  const debtRowHTML = (d) => `
    <div class="debt-item">
      <span>${esc(d.from)}${personTag(d.fromId)}</span>
      <span class="debt-arrow">→</span>
      <span>${esc(d.to)}${personTag(d.toId)}</span>
      <span class="debt-amount">${esc(formatEUR(d.amount))}</span>
      ${interactive ? `<button type="button" class="icon-btn settle-btn" data-action="remind-debt" aria-label="Recordar la deuda" data-from-name="${esc(d.from)}" data-to-name="${esc(d.to)}" data-amount="${d.amount}" title="Recordar la deuda (WhatsApp…)">${icon('message')}</button>` : ''}
      ${interactive ? `<button type="button" class="icon-btn settle-btn" data-action="settle-debt" aria-label="Marcar como pagada" data-from-id="${esc(d.fromId)}" data-to-id="${esc(d.toId)}" data-from-name="${esc(d.from)}" data-to-name="${esc(d.to)}" data-amount="${d.amount}" title="Marcar como pagada">${icon('check')}</button>` : ''}
    </div>`;

  const pairwiseHTML = debtsOf(summary).length
    ? debtsOf(summary).map(debtRowHTML).join('')
    : `<p class="empty-state">${icon('check-circle')} Nadie debe nada a nadie</p>`;

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
      <p class="hint" style="margin:0 0 10px;">${interactive && state.settleMode === 'simplified' ? 'Pagos mínimos entre todos: se compensan las deudas cruzadas.' : 'Quién le debe a quién, persona a persona.'}${interactive ? ' Toca el botón de la derecha si ya se ha pagado fuera de la app.' : ''}</p>
      <div class="summary-list">${pairwiseHTML}</div>
    </div>`;
}

function openSettleModal(fromId, toId, fromName, toName, maxAmount) {
  const simplified = state.settleMode === 'simplified';
  const html = `
    <p class="hint" style="margin:0 0 12px;">Registra que ${esc(fromName)} ya le ha pagado a ${esc(toName)} fuera de la app. ${simplified
      ? 'Esta deuda sale de compensar las cuentas de todo el grupo: el pago se descuenta de lo que debe cada uno y el resto de pagos se recalcula solo.'
      : 'Se restará de la deuda pendiente.'}</p>
    <label class="field">
      <span>Importe pagado (€)</span>
      <input type="number" id="settleAmountInput" class="input" inputmode="decimal" step="0.01" min="0.01" value="${maxAmount.toFixed(2)}">
    </label>
    <p class="hint" id="settleRemaining" style="margin:0 0 12px;"></p>
    <button type="button" class="btn btn-primary btn-block" id="settleSaveBtn">Marcar como pagada</button>
  `;
  openModal('Registrar pago', html);
  // Muestra al momento cuánto quedaría pendiente (un pago parcial es válido).
  const updateRemaining = () => {
    const amount = parseFloat(qs('#settleAmountInput').value);
    const left = maxAmount - (amount || 0);
    qs('#settleRemaining').textContent = !amount || amount <= 0 ? ''
      : left > 0.005 ? `Pago parcial: quedarán ${formatEUR(left)} pendientes de ${fromName} a ${toName}.`
      : 'Con este pago la deuda queda saldada.';
  };
  qs('#settleAmountInput').addEventListener('input', updateRemaining);
  updateRemaining();
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
  const record = { id: uid(), fromId, toId, amount, date: todayISO() };
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

// Pagos marcados como pagados en este periodo: se pueden revisar y borrar en
// cualquier momento (no solo durante los segundos del "Deshacer").
function renderSettlementsHTML() {
  const settlements = state.period.settlements || [];
  if (settlements.length === 0) return '';
  const name = (id) => esc((state.people.find((p) => p.id === id) || {}).name || '?') + archivedTagHTML(state.people, id);
  return `
    <div class="card">
      <h2>Pagos registrados</h2>
      <p class="hint" style="margin:0 0 10px;">Ya descontados de las deudas de arriba. Bórralo si te equivocaste al marcarlo.</p>
      <div class="item-list">
        ${settlements.map((s) => `
          <div class="item-row" data-settlement-id="${s.id}">
            <div class="item-row-main">
              <div class="item-row-title">${name(s.fromId)} → ${name(s.toId)} · ${esc(formatEUR(s.amount))}</div>
              ${s.date ? `<div class="item-row-sub">Marcado el ${esc(formatDateShort(s.date))}</div>` : ''}
            </div>
            <div class="item-row-actions">
              <button type="button" class="icon-btn danger" data-action="delete-settlement" aria-label="Borrar pago" title="Borrar pago">${icon('trash')}</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function deleteSettlement(id) {
  const list = state.period.settlements || [];
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const [removed] = list.splice(idx, 1);
  saveState();
  renderResumen();
  renderRegistroDashboard();
  showUndoToast('Pago borrado', () => {
    list.splice(idx, 0, removed);
    saveState();
    renderResumen();
    renderRegistroDashboard();
  });
}

function currentPeriodRange() {
  const days = getSortedDays(state.period);
  return days.length ? (days[0].date === days[days.length - 1].date
    ? formatDateShort(days[0].date)
    : `${formatDateShort(days[0].date)} - ${formatDateShort(days[days.length - 1].date)}`) : 'sin días';
}

function renderResumen() {
  const summary = computePeriodSummary(state.period);
  const range = currentPeriodRange();

  const hero = `
    <div class="summary-hero">
      <div class="summary-hero-label">TOTAL DEL PERIODO (${esc(range)})</div>
      <div class="summary-hero-value">${esc(formatEUR(summary.totalCost))}</div>
      <div class="summary-hero-sub">${summary.dayCount} día(s) con trayectos · ${summary.tripCount} trayecto(s)</div>
    </div>`;

  const actions = `
    <div class="summary-actions">
      <button type="button" class="btn btn-primary" id="shareSummaryBtn">${icon('share')} Compartir resumen</button>
      <button type="button" class="btn btn-secondary" id="closePeriodBtn">${icon('check-circle')} Cerrar periodo y empezar uno nuevo</button>
    </div>`;

  qs('#summaryContent').innerHTML = hero + renderSummaryBlocksHTML(summary, { interactive: true }) + renderSettlementsHTML() + actions;

  qs('#shareSummaryBtn').addEventListener('click', () => shareSummary(summary, range));
  qs('#closePeriodBtn').addEventListener('click', () => closePeriod(summary, range));
}

// Delegado sobre el contenedor fijo (no se recrea en cada render, a
// diferencia de los botones de dentro) para no acumular listeners cada vez
// que se visita la pestaña Resumen.
qs('#summaryContent').addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('[data-action="delete-settlement"]');
  if (deleteBtn) {
    deleteSettlement(deleteBtn.closest('[data-settlement-id]').dataset.settlementId);
    return;
  }
  const remindBtn = e.target.closest('[data-action="remind-debt"]');
  if (remindBtn) {
    remindDebt(remindBtn.dataset.fromName, remindBtn.dataset.toName, parseFloat(remindBtn.dataset.amount));
    return;
  }
  const btn = e.target.closest('[data-action="settle-debt"]');
  if (!btn) return;
  openSettleModal(btn.dataset.fromId, btn.dataset.toId, btn.dataset.fromName, btn.dataset.toName, parseFloat(btn.dataset.amount));
});

// Recordatorio amable de una deuda: por la bandeja de compartir del móvil
// si existe (WhatsApp, Telegram…), y si no, abriendo WhatsApp Web.
async function remindDebt(fromName, toName, amount) {
  const text = `Hola ${fromName}, según Gastos Coche, del periodo ${currentPeriodRange()} le debes ${formatEUR(amount)} a ${toName} por la gasolina. ¡Gracias!`;
  if (await tryShareText(text)) return;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

// Tabla de deudas en texto monoespaciado (entre ``` para que WhatsApp y
// Telegram respeten las columnas). Cada pagador sale una sola vez.
function buildDebtTableText(debts) {
  const rows = [['Paga', 'A', 'Importe']];
  groupDebtsByPayer(debts).forEach((g) => {
    g.items.forEach((it, i) => rows.push([i === 0 ? g.from : '', it.to, formatEUR(it.amount)]));
    if (g.items.length > 1) rows.push(['', 'Total', formatEUR(g.total)]);
  });
  const w0 = Math.max(...rows.map((r) => r[0].length));
  const w1 = Math.max(...rows.map((r) => r[1].length));
  const w2 = Math.max(...rows.map((r) => r[2].length));
  const lines = rows.map((r) => `${r[0].padEnd(w0)}  ${r[1].padEnd(w1)}  ${r[2].padStart(w2)}`);
  lines.splice(1, 0, '-'.repeat(w0 + w1 + w2 + 4));
  return ['```', ...lines, '```'].join('\n');
}

function legSharesText(shares) {
  return shares.map((s) => `${s.name} ${formatEUR(s.share)}`).join(' · ');
}

function buildShareText(summary, range) {
  const lines = [];
  lines.push(`Gastos Coche — Periodo ${range}`);
  lines.push('');
  lines.push(`Total: ${formatEUR(summary.totalCost)} · ${summary.dayCount} día(s) · ${summary.tripCount} trayecto(s)`);
  if (summary.perCar.length) {
    lines.push('');
    lines.push('Por coche:');
    summary.perCar.forEach((c) => lines.push(`- ${c.name} (${c.driverName}): ${formatEUR(c.totalCost)} · ${formatKm(c.totalKm)}`));
  }
  if (summary.perPerson.length) {
    lines.push('');
    lines.push('Consumo por persona:');
    summary.perPerson.forEach((p) => lines.push(`- ${p.name}: ${formatEUR(p.share)}`));
  }
  lines.push('');
  const debts = debtsOf(summary);
  if (debts.length) {
    lines.push('Quién paga a quién:');
    lines.push(buildDebtTableText(debts));
  } else {
    lines.push('No hay deudas pendientes.');
  }

  const details = buildTripDetails(state.period);
  if (details.length) {
    lines.push('');
    lines.push('Detalle de trayectos:');
    details.forEach((day) => {
      lines.push('');
      lines.push(formatDateShort(day.date));
      day.trips.forEach((t) => {
        lines.push(`- ${t.carName} (${t.driverName}) · ${formatKm(t.km)}${t.roundTrip ? ' ida y vuelta' : ''} · ${formatEUR(t.cost)}`);
        if (t.legs.length > 1) {
          t.legs.forEach((l, i) => lines.push(`   ${i === 0 ? 'Ida' : 'Vuelta'}: ${legSharesText(l.shares)}`));
        } else {
          lines.push(`   ${legSharesText(t.legs[0].shares)}`);
        }
      });
    });
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
  const FONT = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const groups = groupDebtsByPayer(debtsOf(summary));
  const details = buildTripDetails(state.period);

  // Se dibuja dos veces con el mismo código: una en un lienzo mínimo solo para
  // medir la altura que ocupa todo (el detalle depende de cuántos trayectos
  // haya) y otra en el lienzo final, ya con su altura exacta.
  const paint = (ctx, H) => {
    const rowBg = () => { ctx.fillStyle = 'rgba(255,255,255,0.12)'; };
    const text = (str, x, y, font, align, alpha) => {
      ctx.font = font;
      ctx.textAlign = align || 'left';
      ctx.globalAlpha = alpha || 1;
      ctx.fillStyle = '#fff';
      ctx.fillText(str, x, y);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    };
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
    // Parte el texto en varias líneas por los separadores " · " para que
    // nunca se salga de la tarjeta.
    const wrap = (str, font, maxW) => {
      ctx.font = font;
      const out = [];
      let cur = '';
      str.split(' · ').forEach((part) => {
        const next = cur ? `${cur} · ${part}` : part;
        if (cur && ctx.measureText(next).width > maxW) { out.push(cur); cur = part; } else { cur = next; }
      });
      if (cur) out.push(cur);
      return out;
    };

    if (H) {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#1e40af');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    let y = PAD;
    // Logo: icono de surtidor en una pastilla redondeada, como en la cabecera de la app.
    drawRoundedRect(ctx, PAD, y, 52, 52, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fill();
    drawIcon(ctx, 'fuel', PAD + 10, y + 10, 32, '#fff', 1.7);
    text('Gastos Coche', PAD + 68, y + 37, `700 32px ${FONT}`);
    y += 20;
    y += 50;
    text(`Periodo ${range}`, PAD, y + 19, `500 19px ${FONT}`, 'left', 0.85);
    y += 64;
    text(formatEUR(summary.totalCost), PAD, y + 68, `800 68px ${FONT}`);
    y += 92;
    text(`${summary.dayCount} día(s) · ${summary.tripCount} trayecto(s)`, PAD, y + 17, `400 17px ${FONT}`, 'left', 0.85);
    y += 56;

    text('Consumo por persona', PAD, y + 22, `700 22px ${FONT}`);
    y += 42;
    summary.perPerson.forEach((p) => {
      drawRow(y, p.name, formatEUR(p.share), `600 20px ${FONT}`, `700 20px ${FONT}`);
      y += ROW_H + ROW_GAP;
    });
    y += 18;

    // Tabla de deudas: cada pagador aparece una sola vez, con sus destinatarios debajo.
    text('Quién paga a quién', PAD, y + 22, `700 22px ${FONT}`);
    y += 42;
    if (groups.length) {
      const X_TO = PAD + 300;
      const SUB_H = 50;
      text('PAGA', PAD + 22, y + 16, `700 14px ${FONT}`, 'left', 0.7);
      text('A', X_TO, y + 16, `700 14px ${FONT}`, 'left', 0.7);
      text('IMPORTE', W - PAD - 22, y + 16, `700 14px ${FONT}`, 'right', 0.7);
      y += 30;
      groups.forEach((g) => {
        const rows = g.items.length + (g.items.length > 1 ? 1 : 0);
        const h = rows * SUB_H + 16;
        drawRoundedRect(ctx, PAD, y, W - PAD * 2, h, 14);
        rowBg();
        ctx.fill();
        text(g.from, PAD + 22, y + 8 + SUB_H / 2 + 7, `700 22px ${FONT}`);
        g.items.forEach((it, i) => {
          const ry = y + 8 + i * SUB_H + SUB_H / 2 + 7;
          text(it.to, X_TO, ry, `600 20px ${FONT}`);
          text(formatEUR(it.amount), W - PAD - 22, ry, `700 20px ${FONT}`, 'right');
        });
        if (g.items.length > 1) {
          const ry = y + 8 + g.items.length * SUB_H + SUB_H / 2 + 7;
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(X_TO, ry - SUB_H / 2 - 4, W - PAD - 22 - X_TO, 2);
          text('Total', X_TO, ry, `700 20px ${FONT}`, 'left', 0.85);
          text(formatEUR(g.total), W - PAD - 22, ry, `800 22px ${FONT}`, 'right');
        }
        y += h + ROW_GAP;
      });
    } else {
      drawRoundedRect(ctx, PAD, y, W - PAD * 2, ROW_H, 14);
      rowBg();
      ctx.fill();
      drawIcon(ctx, 'check-circle', W / 2 - 128, y + ROW_H / 2 - 12, 24, '#fff', 1.8);
      text('Nadie debe nada a nadie', W / 2 - 92, y + ROW_H / 2 + 6, `600 18px ${FONT}`);
      y += ROW_H;
    }
    y += 30;

    // Detalle: por día, cada trayecto con su coste y lo que paga cada uno.
    if (details.length) {
      text('Detalle de trayectos', PAD, y + 22, `700 22px ${FONT}`);
      y += 46;
      const innerW = W - PAD * 2 - 44;
      details.forEach((day) => {
        text(formatDateShort(day.date), PAD, y + 18, `700 18px ${FONT}`, 'left', 0.85);
        y += 30;
        day.trips.forEach((t) => {
          const lineFont = `400 17px ${FONT}`;
          const lines = [];
          if (t.legs.length > 1) {
            t.legs.forEach((l, i) => wrap(`${i === 0 ? 'Ida' : 'Vuelta'}: ${legSharesText(l.shares)}`, lineFont, innerW).forEach((s) => lines.push(s)));
          } else {
            wrap(legSharesText(t.legs[0].shares), lineFont, innerW).forEach((s) => lines.push(s));
          }
          const h = 52 + lines.length * 26;
          drawRoundedRect(ctx, PAD, y, W - PAD * 2, h, 14);
          rowBg();
          ctx.fill();
          text(`${t.carName} · ${formatKm(t.km)}${t.roundTrip ? ' ida y vuelta' : ''}`, PAD + 22, y + 32, `600 18px ${FONT}`);
          text(formatEUR(t.cost), W - PAD - 22, y + 32, `700 20px ${FONT}`, 'right');
          lines.forEach((s, i) => text(s, PAD + 22, y + 58 + i * 26, lineFont, 'left', 0.85));
          y += h + 10;
        });
        y += 8;
      });
    }
    return y + PAD - 18;
  };

  const probe = document.createElement('canvas');
  probe.width = W;
  probe.height = 1;
  const H = Math.ceil(paint(probe.getContext('2d'), 0));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  paint(canvas.getContext('2d'), H);

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

// Al pulsar "Compartir resumen" se elige el formato: imagen o texto.
function shareSummary(summary, range) {
  if (summary.tripCount === 0) { showToast('No hay nada que compartir todavía'); return; }

  openModal('Compartir resumen', `
    <p class="hint" style="margin:0 0 12px;">¿Cómo quieres compartirlo?</p>
    <button type="button" class="btn btn-primary btn-block" id="shareAsImageBtn">${icon('image')} Como imagen</button>
    <p class="hint" style="margin:6px 0 14px;">Una imagen con la tabla de quién paga a quién y el detalle de cada trayecto.</p>
    <button type="button" class="btn btn-secondary btn-block" id="shareAsTextBtn">${icon('file-text')} Como texto</button>
    <p class="hint" style="margin:6px 0 0;">El mismo contenido como mensaje, para pegarlo en un chat. Si el dispositivo no puede compartir, se copia al portapapeles.</p>
  `);
  qs('#shareAsImageBtn').addEventListener('click', () => { closeModal(); shareSummaryAsImage(summary, range); });
  qs('#shareAsTextBtn').addEventListener('click', () => { closeModal(); shareSummaryAsText(summary, range); });
}

async function shareSummaryAsImage(summary, range) {
  let blob = null;
  try { blob = await buildShareImageBlob(summary, range); } catch (e) { console.warn('No se pudo generar la imagen para compartir', e); }
  if (!blob) { showToast('No se pudo generar la imagen'); return; }

  const fileName = `gastos-coche-${range.replace(/[^\p{L}\p{N}]+/gu, '-')}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });
  if (await tryShareFile(file)) return;

  // Sin bandeja de compartir (p. ej. en el ordenador): se descarga la imagen.
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Imagen descargada');
}

async function shareSummaryAsText(summary, range) {
  const text = buildShareText(summary, range);
  if (await tryShareText(text)) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); showToast('Resumen copiado al portapapeles'); return; } catch (e) { /* sigue al prompt */ }
  }
  window.prompt('Copia el resumen:', text);
}

function closePeriod(summary, range) {
  const doClose = () => {
    // Foto de lo que cerrar va a cambiar, para poder deshacerlo.
    const before = {
      period: state.period,
      people: state.people,
      cars: state.cars,
      refuels: state.refuels,
      closeReminderSnoozedUntil: state.closeReminderSnoozedUntil
    };
    const entry = {
      id: uid(),
      closedAt: todayISO(),
      range,
      startDate: getSortedDays(state.period)[0]?.date || null,
      endDate: getSortedDays(state.period).slice(-1)[0]?.date || null,
      summary
    };
    state.history.unshift(entry);
    state.period = { id: uid(), createdAt: todayISO(), days: [] };
    // El periodo nuevo empieza vacío: a las personas y coches archivados ya
    // no los referencia nada fuera del Historial, que guarda sus nombres.
    // Los repostajes de un coche que se borra ya no sirven de nada (su precio
    // ya se aplicó) y dejarían referencias a un coche inexistente.
    state.people = activePeople();
    state.cars = activeCars();
    state.refuels = state.refuels.filter((r) => state.cars.some((c) => c.id === r.carId));
    state.closeReminderSnoozedUntil = null;
    saveState();
    renderRoster();
    updatePeriodBadge();
    switchTab('registro');
    showUndoToast('Periodo cerrado y guardado en el historial', () => {
      state.history = state.history.filter((h) => h.id !== entry.id);
      Object.assign(state, before);
      saveState();
      renderAll();
      renderResumen();
      renderHistorial();
      switchTab('resumen');
      showToast('Cierre deshecho');
    }, 10000);
  };

  const message = summary.tripCount === 0
    ? 'El periodo está vacío. ¿Cerrarlo igualmente y empezar uno nuevo?'
    : `¿Cerrar el periodo (${range}) y guardarlo en el historial? Empezarás uno nuevo vacío.`;
  const backupDoneToday = state.lastBackupAt === todayISO();
  openModal('Cerrar periodo', `
    <p class="confirm-message">${esc(message)}</p>
    <label class="field-toggle" style="margin-bottom:14px;">
      <input type="checkbox" id="closeBackupToggle" ${backupDoneToday ? '' : 'checked'}>
      <span>Guardar una copia de seguridad al cerrar</span>
    </label>
    <div class="confirm-actions">
      <button type="button" class="btn btn-secondary btn-block" id="closeCancelBtn">Cancelar</button>
      <button type="button" class="btn btn-primary btn-block" id="closeOkBtn">Cerrar periodo</button>
    </div>`);
  qs('#closeCancelBtn').addEventListener('click', closeModal);
  qs('#closeOkBtn').addEventListener('click', () => {
    const wantBackup = qs('#closeBackupToggle').checked;
    closeModal();
    doClose();
    // Justo después de cerrar, para que la copia ya incluya el periodo en el
    // Historial. Sin aviso propio: así no tapa el "Deshacer".
    if (wantBackup) exportBackup({ quiet: true });
  });
}

