/* =====================================================================
   pedidos.js — inicio (dashboard), nuevo pedido, pedidos, modificación,
   cambios de estado con movimiento de inventario, WhatsApp y PDF
   ===================================================================== */

const ventaFecha = p => p.entregadoTs || p.fecha;

/* ---------- PDF: piezas comunes ---------- */
const PDF_INK = [11, 13, 16], PDF_SKY = [56, 189, 248], PDF_SKY_L = [232, 246, 254];
function pdfNuevo(){ const { jsPDF } = window.jspdf; return new jsPDF({ unit: 'mm', format: 'a4' }); }
function pdfCabecera(doc, titulo, l1, l2, alto){
  const W = 210; alto = alto || 28;
  doc.setFillColor(...PDF_INK); doc.rect(0, 0, W, alto, 'F');
  doc.setFillColor(...PDF_SKY); doc.rect(0, alto, W, 1.4, 'F');
  let x = 14;
  if(logoData){
    try{ doc.addImage(logoData, logoData.indexOf('image/png') > -1 ? 'PNG' : 'JPEG', 10, 3, alto - 6, alto - 6); x = alto + 8; }catch(e){}
  }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(titulo, x, 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(190, 215, 230);
  if(l1) doc.text(l1, x, 17.5);
  if(l2) doc.text(l2, x, 23);
}
function pdfPie(doc, texto){
  const W = 210;
  doc.setFillColor(...PDF_INK); doc.rect(0, 285, W, 12, 'F');
  doc.setFillColor(...PDF_SKY); doc.rect(0, 284, W, 1, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text(texto, W / 2, 292, { align: 'center' });
}
const PDF_HEAD = { fillColor: PDF_INK, textColor: 255, fontStyle: 'bold' };

/* ---------- INICIO ---------- */
function actualizarBadge(){
  const b = $('badge-pedidos'); if(!b) return;
  const n = pedidos.filter(p => p.status === 'pendiente').length;
  b.hidden = !n; b.textContent = n;
}

function renderDashboard(){
  const hoy = hoyStr(), mesIni = inicioDia(hoy.slice(0, 8) + '01');
  const delHoy = pedidos.filter(p => ymd(p.fecha) === hoy);
  const entregadosHoy = pedidos.filter(p => p.status === 'entregado' && ymd(ventaFecha(p)) === hoy);
  const entregadosMes = pedidos.filter(p => p.status === 'entregado' && new Date(ventaFecha(p)) >= mesIni);
  const porEntregar = pedidos.filter(p => p.status === 'pendiente' || p.status === 'listo');
  $('d-pedidos-hoy').textContent = delHoy.length;
  $('d-ventas-hoy').textContent = fmt(entregadosHoy.reduce((a, p) => a + p.totalMonto, 0));
  $('d-pendientes').textContent = porEntregar.length;
  $('d-ventas-mes').textContent = fmt(entregadosMes.reduce((a, p) => a + p.totalMonto, 0));

  // avisos
  const sinPrecio = sabores.filter(s => !s.fuera && faltaPrecio(s)).length;
  $('d-esquemas-aviso').innerHTML = sinPrecio && can('catalogo')
    ? `<div class="note warn"><b>${sinPrecio} sabor${sinPrecio > 1 ? 'es' : ''}</b> sin precio en todos los esquemas de ${plazaNombre()}. Complétalos en el Catálogo.</div>` : '';

  const criticos = sabores.filter(s => !s.fuera && (invDe(s.id).cantidad <= invDe(s.id).minimo));
  $('d-stock-alerta').innerHTML = (criticos.length && can('inventario'))
    ? `<div class="note bad"><b>${criticos.length} sabor${criticos.length > 1 ? 'es' : ''} con stock bajo o agotado:</b> ${criticos.slice(0, 12).map(s => esc(s.nombre) + ' (' + invDe(s.id).cantidad + ')').join(' · ')}${criticos.length > 12 ? '…' : ''}</div>` : '';

  const act = porEntregar.slice().sort((a, b) => (a.fechaEntrega || '9999').localeCompare(b.fechaEntrega || '9999') || a.fecha - b.fecha).slice(0, 8);
  $('d-lista').innerHTML = act.length ? act.map(p => `
    <div class="list-row" style="cursor:pointer;" onclick="verPedido('${p.id}')">
      <div class="grow"><div class="name">${esc(p.cliente)}</div>
        <div class="mut small">${p.totalPiezas} pzas · ${esc(p.rango)}${p.fechaEntrega ? ' · Entrega ' + esc(p.fechaEntrega) : ''}</div></div>
      <div style="text-align:right;"><b class="brandfont">${fmt(p.totalMonto)}</b><br><span class="schip s-${p.status}">${STATUS_LABEL[p.status]}</span></div>
    </div>`).join('') : '<div class="empty">Sin pedidos pendientes</div>';
}

/* ---------- NUEVO PEDIDO ---------- */
function initNuevo(){
  if(!$('c-fecha').value) $('c-fecha').value = hoyStr();
  renderClienteSelect(); renderNuevo();
}
function renderClienteSelect(){
  const sel = $('cliente-select'); if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Escribir manualmente —</option>' +
    clientes.slice().sort(sortNombre).map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${esc(c.nombre)}${c.descuento > 0 ? ' · -' + fmt(c.descuento) + '/pza' : ''}</option>`).join('');
}
function descuentoCliente(){
  const id = $('cliente-select') && $('cliente-select').value; if(!id) return 0;
  const c = clientes.find(x => x.id === id); return c ? (parseFloat(c.descuento) || 0) : 0;
}
function autoFillCliente(id){
  const di = $('descuento-info');
  if(!id){ di.hidden = true; renderNuevo(); return; }
  const c = clientes.find(x => x.id === id); if(!c) return;
  $('c-nombre').value = c.nombre; $('c-tel').value = c.telefono || '';
  if(c.descuento > 0){ di.hidden = false; di.textContent = `Descuento especial: -${fmt(c.descuento)} por pieza`; } else di.hidden = true;
  renderNuevo();
}

function renderNuevo(){
  const all = esquemasInfo();
  const total = Object.values(pedidoActual).reduce((a, b) => a + b, 0);
  const esq = getEsquema(total), ref = esq || all[0];
  const min = minPedido();
  $('rango-name').textContent = esq ? esq.label : (total < min ? `Mínimo ${min} piezas` : 'Sin esquema');
  $('rango-total').textContent = total + ' pzas';
  $('esq-pills').innerHTML = all.map(e => `<span class="esq-pill ${esq && esq.id === e.id ? 'on' : ''}">${e.label}</span>`).join('');

  const desc = descuentoCliente();
  let monto = 0, cnt = 0;
  sabores.forEach(s => { const q = pedidoActual[s.id] || 0; if(q > 0){ cnt++; monto += q * Math.max(0, (precioSabor(s, ref) || 0) - desc); } });
  $('np-monto').textContent = fmt(monto);
  $('np-resumen').textContent = `· ${cnt} sabor${cnt === 1 ? '' : 'es'}`;

  const q = ($('q-sabor').value || '').toLowerCase();
  const lista = sabores.filter(s => !s.fuera && s.nombre.toLowerCase().includes(q)).sort(sortNombre);
  const cont = $('sabores-pedido');
  if(!sabores.length){ cont.innerHTML = '<div class="empty">Aún no hay sabores en el catálogo de ' + plazaNombre() + '.</div>'; return; }
  if(!lista.length){ cont.innerHTML = '<div class="empty">No se encontró el sabor</div>'; return; }

  cont.innerHTML = lista.map(s => {
    const qty = pedidoActual[s.id] || 0;
    const disp = disponible(s.id);
    const base = precioSabor(s, ref);
    const sinPrecio = base === null;
    const sinStock = disp === 0;
    const final = Math.max(0, (base || 0) - desc);
    let stockTxt = '';
    if(cfg.controlStock){
      const fis = Number(invDe(s.id).cantidad) || 0, res = reservado(s.id);
      stockTxt = sinStock ? `Sin stock · ${fis} en físico${res ? ' (' + res + ' apartadas)' : ''}` : `${fis} en físico · ${disp} disponibles${res ? ' (' + res + ' apartadas)' : ''}`;
    }
    const tag = s.tag === 'nuevo' ? ' <span class="chip">Nuevo</span>' : s.tag === 'temporada' ? ' <span class="chip amber">Temporada</span>' : '';
    const bloqueado = sinPrecio || sinStock;
    return `<div class="sabor-row ${qty > 0 ? 'active' : ''} ${bloqueado && !qty ? 'nostock' : ''}">
      ${s.imagen ? `<img class="thumb" src="${s.imagen}" alt="">` : `<div class="thumb">${esc(s.nombre.charAt(0).toUpperCase())}</div>`}
      <div class="nm">${esc(s.nombre)}${tag}<small>${sinPrecio ? 'Sin precio en esta plaza' : stockTxt}</small></div>
      <div class="pr">${sinPrecio ? '—' : (desc > 0 ? `<small class="mut" style="text-decoration:line-through;display:block;font-weight:500;">${fmt(base)}</small>` : '') + fmt(final)}</div>
      <div class="qty">
        <button onclick="cambiarQty('${s.id}',-1)" ${qty === 0 ? 'disabled' : ''}>−</button>
        <input type="number" min="0" inputmode="numeric" value="${qty}" onchange="fijarQty('${s.id}',this.value)" ${bloqueado && !qty ? 'disabled' : ''}>
        <button onclick="cambiarQty('${s.id}',1)" ${bloqueado || (disp !== Infinity && qty >= disp) ? 'disabled' : ''}>+</button>
      </div>
    </div>`;
  }).join('');
}
function cambiarQty(id, d){ fijarQty(id, (pedidoActual[id] || 0) + d); }
function fijarQty(id, v){
  let q = Math.max(0, parseInt(v) || 0);
  const disp = disponible(id);
  if(disp !== Infinity && q > disp){ q = disp; toast('Solo hay ' + disp + ' piezas disponibles de este sabor', true); }
  if(q <= 0) delete pedidoActual[id]; else pedidoActual[id] = q;
  renderNuevo();
}

async function guardarPedido(){
  const nombre = $('c-nombre').value.trim();
  if(!nombre){ toast('Ingresa el nombre del cliente', true); return; }
  const items = Object.entries(pedidoActual).filter(([, q]) => q > 0);
  if(!items.length){ toast('Agrega al menos un sabor', true); return; }
  const total = items.reduce((a, [, q]) => a + q, 0);
  const esq = getEsquema(total);
  if(!esq){ toast(`El pedido mínimo es de ${minPedido()} piezas`, true); return; }
  if(cfg.controlStock){
    const mal = items.filter(([id, q]) => q > disponible(id)).map(([id, q]) => { const s = sabores.find(x => x.id === id); return (s ? s.nombre : 'Sabor') + ': pides ' + q + ', disponible ' + disponible(id); });
    if(mal.length){ toast('Stock insuficiente · ' + mal.join(' | '), true); return; }
  }
  const desc = descuentoCliente();
  let monto = 0;
  const detalles = items.map(([id, qty]) => {
    const s = sabores.find(x => x.id === id);
    const base = precioSabor(s, esq) || 0, precio = Math.max(0, base - desc);
    monto += qty * precio;
    return { saborId: id, nombre: s.nombre, qty, precioBase: base, precio, descuento: desc, subtotal: qty * precio };
  });
  const id = String(Date.now());
  const pedido = {
    id, cliente: nombre, clienteId: $('cliente-select').value || '', descuentoPorPieza: desc,
    telefono: $('c-tel').value.trim(), nota: $('c-nota').value.trim(),
    fechaEntrega: $('c-fecha').value || '', horaEntrega: $('c-hora').value || '',
    plaza, rango: esq.label, rangoId: esq.id, totalPiezas: total, totalMonto: monto, detalles,
    fecha: Date.now(), status: 'pendiente', creadoPor: usuario.nombre || ''
  };
  try{
    await R('pedidos/' + id).set(pedido);
    logBit('Nuevo pedido', `#${folio(pedido)} · ${nombre} · ${fmt(monto)} · ${total} pzas`);
    pedidoActual = {};
    ['c-nombre', 'c-tel', 'c-nota', 'c-hora'].forEach(i => $(i).value = '');
    $('cliente-select').value = ''; $('descuento-info').hidden = true; $('c-fecha').value = hoyStr();
    toast('Pedido guardado');
    showTab('pedidos');
  }catch(e){ toast('No se pudo guardar el pedido: ' + e.message, true); }
}

/* ---------- LISTA DE PEDIDOS ---------- */
function renderPedidos(){
  const q = ($('q-pedidos').value || '').toLowerCase(), fs = $('f-status').value;
  let lista = pedidos.filter(p => (p.cliente || '').toLowerCase().includes(q));
  if(fs) lista = lista.filter(p => p.status === fs);
  const c = $('pedidos-list');
  if(!lista.length){ c.innerHTML = '<div class="empty">No hay pedidos</div>'; return; }
  c.innerHTML = lista.map(p => `
    <div class="pedido-card ${p.status === 'cancelado' ? 'cancelado' : ''}" onclick="verPedido('${p.id}')">
      <div class="pc-top">
        <div><div class="pc-name">${esc(p.cliente)}</div><div class="mut small">${p.totalPiezas} pzas · ${esc(p.rango)} · #${folio(p)}</div></div>
        <div style="text-align:right;"><div class="pc-total">${fmt(p.totalMonto)}</div><span class="schip s-${p.status}">${STATUS_LABEL[p.status] || p.status}</span></div>
      </div>
      <div class="mut small" style="margin-top:6px;">${fmtFecha(p.fecha)}${p.fechaEntrega ? ' · Entrega: ' + esc(p.fechaEntrega) + (p.horaEntrega ? ' ' + esc(p.horaEntrega) : '') : ''}</div>
      ${p.nota ? `<div class="small" style="margin-top:4px;">${esc(p.nota)}</div>` : ''}
    </div>`).join('');
}

let pedidoAbierto = null;
function verPedido(id){
  const p = pedidos.find(x => x.id === id); if(!p) return;
  pedidoAbierto = id;
  $('m-pedido-t').textContent = p.cliente;
  const filas = p.detalles.map(d => `<tr><td>${esc(d.nombre)}</td><td class="ctr">${d.qty}</td><td class="num">${fmt(d.precio)}</td><td class="num"><b>${fmt(d.subtotal)}</b></td></tr>`).join('');
  $('m-pedido-b').innerHTML = `
    <p class="mut small">${fmtFecha(p.fecha)} · Folio #${folio(p)}${p.creadoPor ? ' · ' + esc(p.creadoPor) : ''}</p>
    ${p.telefono ? `<p style="margin-top:6px;">Tel: ${esc(p.telefono)}</p>` : ''}
    ${p.fechaEntrega ? `<p style="margin-top:4px;"><b>Entrega:</b> ${esc(p.fechaEntrega)}${p.horaEntrega ? ' a las ' + esc(p.horaEntrega) : ''}</p>` : ''}
    ${p.nota ? `<p style="margin-top:4px;">${esc(p.nota)}</p>` : ''}
    <p style="margin:10px 0;"><span class="schip s-${p.status}">${STATUS_LABEL[p.status]}</span> &nbsp;<span class="chip">${esc(p.rango)}</span>${p.descuentoPorPieza > 0 ? ` <span class="chip ok">-${fmt(p.descuentoPorPieza)}/pza</span>` : ''}</p>
    <table class="tbl"><thead><tr><th>Sabor</th><th class="ctr">Pzas</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${filas}</tbody></table>
    <div style="text-align:right;margin-top:12px;"><span class="mut small">${p.totalPiezas} piezas</span><br><b class="brandfont" style="font-size:1.35rem;">Total: ${fmt(p.totalMonto)}</b></div>`;
  const b = [];
  b.push(`<button class="btn btn-sky" onclick="pdfPedido('${id}')">PDF</button>`);
  if(p.status === 'pendiente' || p.status === 'listo') b.push(`<button class="btn btn-line" onclick="abrirMod('${id}')">Modificar</button>`);
  if(p.status === 'pendiente') b.push(`<button class="btn btn-line" onclick="setStatus('${id}','listo')">Marcar listo</button>`);
  if(p.status === 'listo') b.push(`<button class="btn btn-line" onclick="setStatus('${id}','pendiente')">Regresar a pendiente</button>`);
  if(p.status === 'pendiente' || p.status === 'listo') b.push(`<button class="btn btn-ok" onclick="setStatus('${id}','entregado')">Entregado</button>`);
  if(p.status === 'cancelado') b.push(`<button class="btn btn-line" onclick="setStatus('${id}','pendiente')">Reactivar</button>`);
  if(p.status !== 'cancelado') b.push(`<button class="btn btn-danger" onclick="setStatus('${id}','cancelado')">Cancelar pedido</button>`);
  b.push(`<button class="btn btn-line" style="background:#e7f8ee;color:#047857;" onclick="whatsappPedido('${id}')">WhatsApp</button>`);
  if(esAdmin()) b.push(`<button class="btn btn-danger" onclick="eliminarPedido('${id}')">Eliminar</button>`);
  b.push(`<button class="btn btn-line" onclick="closeModal('m-pedido')">Cerrar</button>`);
  $('m-pedido-a').innerHTML = b.join('');
  openModal('m-pedido');
}

/* ---------- Movimiento de inventario (transacción segura entre usuarios) ---------- */
function moverInv(saborId, delta, tipo, motivo, nombre, opts){
  opts = opts || {};
  let antes = 0;
  return R('inventario/' + saborId).transaction(cur => {
    cur = cur || { cantidad: 0, minimo: 10 };
    antes = Number(cur.cantidad) || 0;
    const nuevo = Math.max(0, opts.set != null ? opts.set : antes + delta);
    return { cantidad: nuevo, minimo: opts.minimo != null ? opts.minimo : (cur.minimo != null ? cur.minimo : 10) };
  }).then(res => {
    const despues = (res.snapshot.val() || {}).cantidad || 0;
    return R('historial').push({ ts: Date.now(), saborId, saborNombre: nombre, tipo, delta: despues - antes, motivo, stockResultante: despues, usuario: (usuario && usuario.nombre) || '' });
  });
}

function setStatus(id, status){
  const p = pedidos.find(x => x.id === id); if(!p || p.status === status) return;
  const prev = p.status;
  const msg = {
    entregado: '¿Marcar este pedido como ENTREGADO? Se descontarán las piezas del inventario.',
    cancelado: prev === 'entregado' ? '¿CANCELAR este pedido ya entregado? Las piezas regresarán al inventario.' : '¿CANCELAR este pedido?',
    listo: '¿Marcar este pedido como LISTO?',
    pendiente: prev === 'entregado' ? '¿Regresar a PENDIENTE? Las piezas regresarán al inventario.' : '¿Regresar el pedido a PENDIENTE?'
  }[status];
  confirmar('Cambiar estado', msg, async () => {
    if(status === 'entregado'){
      for(const d of p.detalles) await moverInv(d.saborId, -d.qty, 'pedido', `Entrega #${folio(p)} · ${p.cliente}`, d.nombre);
    } else if(prev === 'entregado'){
      for(const d of p.detalles) await moverInv(d.saborId, d.qty, 'devolucion', `${status === 'cancelado' ? 'Cancelación' : 'Reversa'} post-entrega #${folio(p)}`, d.nombre);
    }
    const upd = { status };
    if(status === 'entregado') upd.entregadoTs = Date.now();
    if(prev === 'entregado' && status !== 'entregado') upd.entregadoTs = null;
    await R('pedidos/' + id).update(upd);
    logBit('Cambio de estado', `#${folio(p)} · ${p.cliente}: ${prev} → ${status}`);
    closeModal('m-pedido');
    toast('Estado actualizado: ' + STATUS_LABEL[status]);
  });
}

function eliminarPedido(id){
  const p = pedidos.find(x => x.id === id); if(!p) return;
  confirmar('¿Eliminar pedido?', p.status === 'entregado' ? 'Está ENTREGADO: se quitará de las ventas y el inventario NO se regresará (cancélalo primero si quieres devolver las piezas).' : 'Esta acción no se puede deshacer.', async () => {
    await R('pedidos/' + id).remove();
    logBit('Eliminar pedido', `#${folio(p)} · ${p.cliente}`);
    closeModal('m-pedido'); toast('Pedido eliminado');
  });
}

/* ---------- Modificar pedido ---------- */
let mod = null; // { id, qty: {saborId: n} }
function abrirMod(id){
  const p = pedidos.find(x => x.id === id); if(!p) return;
  mod = { id, qty: {} };
  p.detalles.forEach(d => { mod.qty[d.saborId] = d.qty; });
  closeModal('m-pedido');
  renderMod(); openModal('m-mod');
}
function renderMod(){
  const p = pedidos.find(x => x.id === mod.id); if(!p) return;
  const total = Object.values(mod.qty).reduce((a, b) => a + b, 0);
  const esq = getEsquema(total) || esquemaPorId(p.rangoId) || esquemasInfo()[0];
  const ids = new Set(sabores.filter(s => !s.fuera).map(s => s.id)); p.detalles.forEach(d => ids.add(d.saborId));
  const lista = [...ids].map(id => sabores.find(s => s.id === id) || { id, nombre: (p.detalles.find(d => d.saborId === id) || {}).nombre || 'Sabor', precios: {} }).sort(sortNombre);
  const desc = p.descuentoPorPieza || 0;
  $('m-mod-b').innerHTML = `<p class="mut small" style="margin-bottom:8px;">Cliente: <b>${esc(p.cliente)}</b> · Esquema actual: <b>${esq ? esq.label : '—'}</b>${desc > 0 ? ' · -' + fmt(desc) + '/pza' : ''}</p>
    <div style="max-height:46vh;overflow:auto;">` + lista.map(s => {
    const q = mod.qty[s.id] || 0, disp = disponible(s.id, p.id);
    const base = precioSabor(s, esq);
    const precio = base === null ? (p.detalles.find(d => d.saborId === s.id) || {}).precioBase || 0 : base;
    return `<div class="sabor-row ${q > 0 ? 'active' : ''}">
      <div class="nm">${esc(s.nombre)}<small>${cfg.controlStock ? (disp === 0 && !q ? 'Sin stock' : disp + ' disponibles') : ''}</small></div>
      <div class="pr">${fmt(Math.max(0, precio - desc))}</div>
      <div class="qty"><button onclick="modQty('${s.id}',-1)" ${q === 0 ? 'disabled' : ''}>−</button>
        <input type="number" min="0" value="${q}" onchange="modSet('${s.id}',this.value)">
        <button onclick="modQty('${s.id}',1)" ${disp !== Infinity && q >= disp ? 'disabled' : ''}>+</button></div></div>`;
  }).join('') + `</div><div style="text-align:right;margin-top:10px;font-family:Sora,sans-serif;font-weight:700;" id="mod-total"></div>`;
  calcMod();
}
function modQty(id, d){ modSet(id, (mod.qty[id] || 0) + d); }
function modSet(id, v){
  const p = pedidos.find(x => x.id === mod.id);
  let q = Math.max(0, parseInt(v) || 0);
  const disp = disponible(id, p.id);
  if(disp !== Infinity && q > disp){ q = disp; toast('Máximo disponible: ' + disp, true); }
  if(q <= 0) delete mod.qty[id]; else mod.qty[id] = q;
  renderMod();
}
function calcMod(){
  const p = pedidos.find(x => x.id === mod.id);
  const total = Object.values(mod.qty).reduce((a, b) => a + b, 0);
  const esq = getEsquema(total) || esquemaPorId(p.rangoId) || esquemasInfo()[0];
  let monto = 0;
  Object.entries(mod.qty).forEach(([id, q]) => {
    const s = sabores.find(x => x.id === id); if(!s) return;
    monto += q * Math.max(0, (precioSabor(s, esq) || 0) - (p.descuentoPorPieza || 0));
  });
  const el = $('mod-total'); if(el) el.textContent = `${total} pzas · Total ${fmt(monto)}`;
}
async function guardarMod(){
  const p = pedidos.find(x => x.id === mod.id); if(!p) return;
  const items = Object.entries(mod.qty).filter(([, q]) => q > 0);
  if(!items.length){ toast('El pedido no puede quedar vacío', true); return; }
  const total = items.reduce((a, [, q]) => a + q, 0);
  if(total < minPedido()){ toast(`El pedido mínimo es de ${minPedido()} piezas`, true); return; }
  const esq = getEsquema(total);
  const desc = p.descuentoPorPieza || 0;
  let monto = 0;
  const detalles = items.map(([id, qty]) => {
    const s = sabores.find(x => x.id === id);
    const viejo = p.detalles.find(d => d.saborId === id);
    const base = s ? (precioSabor(s, esq) || 0) : (viejo ? viejo.precioBase : 0);
    const precio = Math.max(0, base - desc); monto += qty * precio;
    return { saborId: id, nombre: s ? s.nombre : (viejo ? viejo.nombre : 'Sabor'), qty, precioBase: base, precio, descuento: desc, subtotal: qty * precio };
  });
  await R('pedidos/' + p.id).update({ detalles, totalPiezas: total, totalMonto: monto, rango: esq.label, rangoId: esq.id });
  logBit('Modificar pedido', `#${folio(p)} · ${p.cliente} · ${p.totalPiezas} → ${total} pzas`);
  closeModal('m-mod'); toast('Pedido modificado');
}

/* ---------- WhatsApp y PDF ---------- */
function whatsappPedido(id){
  const p = pedidos.find(x => x.id === id);
  if(!p || !p.telefono){ toast('Este pedido no tiene teléfono registrado', true); return; }
  let tel = p.telefono.replace(/\D/g, ''); if(tel.length === 10) tel = '52' + tel;
  const lineas = p.detalles.map(d => `• ${d.nombre}: ${d.qty} pzas — ${fmt(d.subtotal)}`).join('\n');
  const entrega = p.fechaEntrega ? `\nEntrega: ${p.fechaEntrega}${p.horaEntrega ? ' a las ' + p.horaEntrega : ''}` : '';
  const msg = `*La Auténtica Acapulqueña*\n\nHola ${p.cliente}, este es el resumen de tu pedido:\n\n${lineas}\n\nTotal de piezas: ${p.totalPiezas}\nMonto: ${fmt(p.totalMonto)}\nEsquema: ${p.rango}${entrega}\n\n¡Gracias por tu preferencia!`;
  window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(msg), '_blank');
}

function pdfPedido(id){
  const p = pedidos.find(x => x.id === id); if(!p) return;
  const doc = pdfNuevo(), W = 210;
  pdfCabecera(doc, 'LA AUTÉNTICA ACAPULQUEÑA', 'Plaza ' + plazaNombre(p.plaza || plaza), `Folio #${folio(p)}   ·   ${fmtFecha(p.fecha)}`);
  const info = ['Cliente: ' + p.cliente, p.telefono ? 'Tel: ' + p.telefono : '', 'Esquema: ' + p.rango, p.fechaEntrega ? 'Entrega: ' + p.fechaEntrega + (p.horaEntrega ? ' ' + p.horaEntrega : '') : '', p.nota ? 'Nota: ' + p.nota : ''].filter(Boolean).join('   ·   ');
  doc.setFillColor(...PDF_SKY_L); doc.rect(0, 29.4, W, 11, 'F');
  doc.setTextColor(...PDF_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text(info, 14, 36, { maxWidth: W - 28 });
  doc.autoTable({
    startY: 44, head: [['Sabor', 'Pzas', 'Precio unitario', 'Total']],
    body: p.detalles.slice().sort(sortNombre).map(d => [d.nombre, String(d.qty), d.descuento > 0 ? `${fmt(d.precio)} (-${fmt(d.descuento)})` : fmt(d.precio), fmt(d.subtotal)]),
    theme: 'grid', headStyles: { ...PDF_HEAD, fontSize: 8 }, bodyStyles: { fontSize: 8, textColor: [16, 22, 29], cellPadding: 1.8 },
    alternateRowStyles: { fillColor: [245, 250, 253] },
    columnStyles: { 0: { cellWidth: 88 }, 1: { halign: 'center', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 50 }, 3: { halign: 'right', cellWidth: 34 } },
    margin: { left: 10, right: 10 }
  });
  const y = doc.lastAutoTable.finalY + 5;
  doc.setFillColor(...PDF_INK); doc.roundedRect(110, y, W - 120, 22, 2, 2, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('Total paletas: ' + p.totalPiezas + ' pzas', 116, y + 8);
  doc.setFontSize(13); doc.setTextColor(...PDF_SKY); doc.text('TOTAL: ' + fmt(p.totalMonto), 116, y + 18);
  if(y + 50 < 270){
    doc.setDrawColor(200, 205, 210); doc.line(14, y + 38, 90, y + 38);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 148, 156); doc.text('Firma de recibido', 14, y + 44);
  }
  pdfPie(doc, 'La Auténtica Acapulqueña · Gracias por su preferencia');
  doc.save('Pedido_' + p.cliente.replace(/\s+/g, '_') + '_' + folio(p) + '.pdf');
  toast('PDF generado');
}
