/* =====================================================================
   inventario.js — existencias, historial de movimientos y plan de producción
   ===================================================================== */

const TIPO_MOV = { agregar:'＋', quitar:'−', set:'=', pedido:'↗', devolucion:'↩', eliminar:'✕' };
const BADGE_INV = {
  ok:    '<span class="chip ok">En stock</span>',
  bajo:  '<span class="chip amber">Stock bajo</span>',
  out:   '<span class="chip red">Sin stock</span>',
  fuera: '<span class="chip gray">Fuera de menú</span>'
};

function renderInventario(){
  $('inv-plaza').textContent = plazaNombre();
  const activos = sabores.filter(s => !s.fuera);
  const alertas = activos.filter(s => invDe(s.id).cantidad <= invDe(s.id).minimo);
  $('inv-alerta').innerHTML = alertas.length
    ? `<div class="note bad"><b>${alertas.length} sabor${alertas.length > 1 ? 'es' : ''} con stock bajo o agotado:</b> ${alertas.slice(0, 15).map(s => esc(s.nombre) + ' (' + invDe(s.id).cantidad + ')').join(' · ')}</div>` : '';

  const q = ($('q-inv').value || '').toLowerCase(), filtro = $('f-inv').value, orden = $('s-inv').value;
  let lista = sabores.filter(s => s.nombre.toLowerCase().includes(q));
  if(filtro !== 'todos') lista = lista.filter(s => estadoInv(s) === filtro);
  const peso = { ok: 0, bajo: 1, out: 2, fuera: 3 };
  if(orden === 'alfa') lista.sort(sortNombre);
  else if(orden === 'stock-asc') lista.sort((a, b) => invDe(a.id).cantidad - invDe(b.id).cantidad);
  else if(orden === 'stock-desc') lista.sort((a, b) => invDe(b.id).cantidad - invDe(a.id).cantidad);
  else lista.sort((a, b) => peso[estadoInv(a)] - peso[estadoInv(b)]);

  const cnt = e => activos.filter(s => estadoInv(s) === e).length;
  $('inv-stats').innerHTML = `<span class="chip ok">${cnt('ok')} en stock</span><span class="chip amber">${cnt('bajo')} bajo</span><span class="chip red">${cnt('out')} sin stock</span><span class="chip">${activos.reduce((a, s) => a + (Number(invDe(s.id).cantidad) || 0), 0)} pzas en total</span>`;

  const cont = $('inv-list');
  if(!sabores.length){ cont.innerHTML = '<div class="empty">Aún no hay sabores. Agrégalos en el Catálogo.</div>'; return; }
  if(!lista.length){ cont.innerHTML = '<div class="empty">Sin resultados</div>'; return; }
  cont.innerHTML = lista.map(s => {
    const i = invDe(s.id), ap = reservado(s.id), st = estadoInv(s);
    return `<div class="inv-row">
      <div class="grow" style="flex:1;min-width:0;">
        <div class="name" style="font-weight:700;">${esc(s.nombre)}</div>
        <div class="mut small">En físico: <b>${i.cantidad}</b> · Disponible: <b>${Math.max(0, i.cantidad - ap)}</b>${ap > 0 ? ` · <b style="color:var(--amber)">${ap} apartadas</b>` : ''} · Mín: ${i.minimo}</div>
        <div class="row-btns" ${esAdmin() ? '' : 'hidden'}>
          <button class="btn btn-ok btn-sm" onclick="openInv('${s.id}','agregar')">＋ Agregar</button>
          <button class="btn btn-danger btn-sm" onclick="openInv('${s.id}','quitar')">− Quitar</button>
          <button class="btn btn-line btn-sm" onclick="verHistSabor('${s.id}')">Historial</button>
          <button class="btn btn-line btn-sm" onclick="limpiarSabor('${s.id}')">Poner en 0</button>
        </div>
        ${esAdmin() ? '' : `<div class="row-btns"><button class="btn btn-line btn-sm" onclick="verHistSabor('${s.id}')">Historial</button></div>`}
      </div>${BADGE_INV[st]}</div>`;
  }).join('');
}

function openInv(id, accion){
  const s = sabores.find(x => x.id === id); if(!s) return;
  const i = invDe(id);
  $('mi-id').value = id; $('m-inv-t').textContent = s.nombre; $('m-inv-act').textContent = i.cantidad + ' pzas';
  $('mi-acc').value = accion || 'agregar'; $('mi-cant').value = ''; $('mi-motivo').value = ''; $('mi-min').value = i.minimo;
  openModal('m-inv');
}

function ajustarMinimo(saborId, minimo){
  return R('inventario/' + saborId).transaction(cur => { cur = cur || { cantidad: 0, minimo: 10 }; return { cantidad: Number(cur.cantidad) || 0, minimo }; });
}

async function guardarInv(){
  const id = $('mi-id').value, acc = $('mi-acc').value;
  const cant = parseInt($('mi-cant').value), minimo = Math.max(0, parseInt($('mi-min').value) || 0);
  const motivo = $('mi-motivo').value.trim();
  const s = sabores.find(x => x.id === id); if(!s) return;
  if($('mi-cant').value !== '' && (isNaN(cant) || cant < 0)){ toast('Cantidad inválida', true); return; }
  try{
    if($('mi-cant').value === ''){
      await ajustarMinimo(id, minimo);                 // solo cambió el mínimo
      logBit('Stock mínimo', `${s.nombre}: mínimo ${minimo}`);
    } else {
      const base = { agregar: 'Entrada manual', quitar: 'Salida manual', set: 'Ajuste manual' }[acc];
      const opts = { minimo };
      if(acc === 'set') opts.set = cant;
      await moverInv(id, acc === 'agregar' ? cant : acc === 'quitar' ? -cant : 0, acc, motivo || base, s.nombre, opts);
      logBit('Movimiento de inventario', `${s.nombre}: ${acc} ${cant} pzas${motivo ? ' · ' + motivo : ''}`);
    }
    closeModal('m-inv'); toast('Inventario actualizado');
  }catch(e){ toast('No se pudo guardar: ' + e.message, true); }
}

function limpiarSabor(id){
  const s = sabores.find(x => x.id === id); if(!s) return;
  confirmar('¿Poner en 0 el stock de ' + s.nombre + '?', 'Se registrará en el historial.', async () => {
    await moverInv(id, 0, 'eliminar', 'Stock puesto en cero manualmente', s.nombre, { set: 0 });
    logBit('Stock en cero', s.nombre); toast('Stock en cero');
  });
}

function eliminarTodoInv(){
  if(!esAdmin()) return;
  confirmar('¿Poner TODO el inventario de ' + plazaNombre() + ' en cero?', 'Se pondrá en 0 la existencia de todos los sabores de esta plaza.', async () => {
    for(const s of sabores){
      if((Number(invDe(s.id).cantidad) || 0) > 0) await moverInv(s.id, 0, 'eliminar', 'Puesta en cero masiva', s.nombre, { set: 0 });
    }
    logBit('Inventario en cero', 'Todos los sabores de ' + plazaNombre());
    toast('Inventario en cero');
  }, 'ELIMINAR');
}

/* ---------- Historial ---------- */
function renderHistorial(){
  const ini = $('h-ini').value, fin = $('h-fin').value;
  if(!ini && !fin){ const d = new Date(); d.setDate(d.getDate() - 30); $('h-ini').value = ymd(d); $('h-fin').value = hoyStr(); return renderHistorial(); }
  let lista = historial.slice();
  if(ini) lista = lista.filter(h => new Date(h.ts) >= inicioDia(ini));
  if(fin) lista = lista.filter(h => new Date(h.ts) <= finDia(fin));
  lista = lista.slice(0, 150);
  $('hist-list').innerHTML = lista.length ? lista.map(h => `
    <div class="hist-row"><span style="min-width:20px;text-align:center;font-weight:700;">${TIPO_MOV[h.tipo] || '•'}</span>
      <div style="flex:1;min-width:0;"><b>${esc(h.saborNombre)}</b><br><span class="mut small">${esc(h.motivo)} · Stock: ${h.stockResultante}${h.usuario ? ' · ' + esc(h.usuario) : ''}</span></div>
      <div style="text-align:right;"><div class="q ${h.delta >= 0 ? 'plus' : 'minus'}">${h.delta >= 0 ? '+' : ''}${h.delta}</div><div class="mut small">${fmtFecha(h.ts)}</div></div></div>`).join('')
    : '<div class="empty">Sin movimientos en este período</div>';
}
function verHistSabor(id){
  const s = sabores.find(x => x.id === id); if(!s) return;
  const lista = historial.filter(h => h.saborId === id).slice(0, 60);
  $('m-hist-t').textContent = s.nombre;
  $('m-hist-b').innerHTML = lista.length ? lista.map(h => `
    <div class="hist-row"><span style="min-width:20px;text-align:center;font-weight:700;">${TIPO_MOV[h.tipo] || '•'}</span>
      <div style="flex:1;" class="small">${esc(h.motivo)}</div>
      <div style="text-align:right;"><div class="q ${h.delta >= 0 ? 'plus' : 'minus'}">${h.delta >= 0 ? '+' : ''}${h.delta}</div><div class="mut small">${fmtFecha(h.ts)}</div></div></div>`).join('')
    : '<div class="empty">Sin movimientos</div>';
  openModal('m-hist');
}

/* ---------- PDF de inventario ---------- */
function pdfInventario(){
  const doc = pdfNuevo(), W = 210;
  const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  pdfCabecera(doc, 'INVENTARIO · ' + plazaNombre().toUpperCase(), 'La Auténtica Acapulqueña · ' + fecha, 'Generado por: ' + (usuario.nombre || ''));
  const activos = sabores.filter(s => !s.fuera).sort(sortNombre);
  const cnt = e => activos.filter(s => estadoInv(s) === e).length;
  doc.setFillColor(...PDF_SKY_L); doc.rect(0, 29.4, W, 10, 'F');
  doc.setTextColor(...PDF_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text(`En stock: ${cnt('ok')}   Stock bajo: ${cnt('bajo')}   Sin stock: ${cnt('out')}   Total piezas: ${activos.reduce((a, s) => a + (Number(invDe(s.id).cantidad) || 0), 0)}`, 14, 36);
  const L = { ok: 'En stock', bajo: 'Stock bajo', out: 'Sin stock' };
  doc.autoTable({
    startY: 42, head: [['Sabor', 'Existencia', 'Mínimo', 'Estado']],
    body: activos.map(s => { const i = invDe(s.id); return [s.nombre, String(i.cantidad), String(i.minimo), L[estadoInv(s)]]; }),
    theme: 'grid', headStyles: { ...PDF_HEAD, fontSize: 9 }, bodyStyles: { fontSize: 8, cellPadding: 2, textColor: [16, 22, 29] },
    alternateRowStyles: { fillColor: [245, 250, 253] },
    columnStyles: { 0: { cellWidth: 90 }, 1: { halign: 'center', cellWidth: 30 }, 2: { halign: 'center', cellWidth: 30 }, 3: { cellWidth: 40, fontStyle: 'bold' } },
    didParseCell: d => { if(d.column.index === 3 && d.section === 'body'){ if(d.cell.raw === 'Sin stock') d.cell.styles.textColor = [185, 28, 28]; else if(d.cell.raw === 'Stock bajo') d.cell.styles.textColor = [180, 83, 9]; } },
    margin: { left: 10, right: 10 }
  });
  pdfPie(doc, 'La Auténtica Acapulqueña · Inventario ' + plazaNombre());
  doc.save('Inventario_' + plazaNombre() + '_' + hoyStr() + '.pdf');
  toast('PDF de inventario generado');
}

/* ---------- Producción ---------- */
function planProduccion(){
  const n = Math.max(1, parseInt($('prod-n').value) || 5), molde = cfg.piezasMolde || 40;
  const filas = sabores.filter(s => !s.fuera).map(s => {
    const i = invDe(s.id), necesario = Math.max(0, i.minimo * 2 - i.cantidad);
    return { nombre: s.nombre, stock: Number(i.cantidad) || 0, minimo: i.minimo, necesario, moldes: Math.ceil(necesario / molde) };
  }).sort((a, b) => a.stock - b.stock).slice(0, n);
  return { filas, molde, moldes: filas.reduce((a, f) => a + f.moldes, 0) };
}
function renderProduccion(){
  $('prod-plaza').textContent = plazaNombre();
  $('prod-molde').value = cfg.piezasMolde || 40;
  const { filas, molde, moldes } = planProduccion();
  const d = new Date(), laborable = d.getDay() >= 1 && d.getDay() <= 5;
  $('prod-resumen').innerHTML = `<div class="rango-bar" style="margin-bottom:0;"><div><small>Total de moldes</small><span class="big">${moldes}</span></div><div style="text-align:right;"><small>Total de piezas</small><span class="big">${moldes * molde}</span></div></div>
    <div class="note ${laborable ? '' : 'warn'}" style="margin:10px 0 0;">${laborable ? 'Hoy es día de producción.' : 'Hoy es fin de semana (no es día de producción).'}</div>`;
  $('prod-list').innerHTML = filas.length ? `<table class="tbl"><thead><tr><th>Sabor</th><th class="ctr">Stock</th><th class="ctr">Mín</th><th class="ctr">A producir</th><th class="ctr">Moldes</th></tr></thead><tbody>` +
    filas.map(f => `<tr><td><b>${esc(f.nombre)}</b>${f.stock <= f.minimo ? ' <span class="chip red">urgente</span>' : ''}</td><td class="ctr">${f.stock}</td><td class="ctr">${f.minimo}</td><td class="ctr">${f.necesario}</td><td class="ctr"><b>${f.moldes}</b></td></tr>`).join('') + '</tbody></table>'
    : '<div class="empty">Sin sabores en el catálogo</div>';
}
function pdfProduccion(){
  const { filas, molde, moldes } = planProduccion();
  if(!filas.length){ toast('No hay sabores para planear', true); return; }
  const doc = pdfNuevo(), W = 210;
  pdfCabecera(doc, 'PLAN DE PRODUCCIÓN', 'La Auténtica Acapulqueña · Plaza ' + plazaNombre(), new Date().toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }));
  doc.autoTable({
    startY: 36, head: [['#', 'Sabor', 'Stock', 'Mínimo', 'A producir', 'Moldes']],
    body: filas.map((f, i) => [String(i + 1), f.nombre, String(f.stock), String(f.minimo), f.necesario + ' pzas', String(f.moldes)]),
    theme: 'grid', headStyles: { ...PDF_HEAD, fontSize: 10 }, bodyStyles: { fontSize: 9.5, textColor: [16, 22, 29] },
    alternateRowStyles: { fillColor: [245, 250, 253] },
    columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 74 }, 2: { cellWidth: 24, halign: 'center' }, 3: { cellWidth: 22, halign: 'center' }, 4: { cellWidth: 28, halign: 'center' }, 5: { cellWidth: 28, halign: 'center' } },
    margin: { left: 10, right: 10 }
  });
  const y = doc.lastAutoTable.finalY + 8;
  doc.setFillColor(...PDF_INK); doc.roundedRect(10, y, W - 20, 18, 3, 3, 'F');
  doc.setTextColor(...PDF_SKY); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(`Total: ${moldes} moldes  ·  ${moldes * molde} piezas`, W / 2, y + 11, { align: 'center' });
  pdfPie(doc, 'La Auténtica Acapulqueña · Plan generado el ' + fmtFecha(Date.now()));
  doc.save('Produccion_' + plazaNombre() + '_' + hoyStr() + '.pdf');
  logBit('Plan de producción', 'PDF ' + hoyStr());
  toast('Plan de producción exportado');
}
