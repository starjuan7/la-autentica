/* =====================================================================
   reportes.js — ventas por período, gráficas y PDF
   ===================================================================== */

let chartVentas = null, chartSabores = null, repCache = null, repToken = 0;

function initReporte(){
  if(!$('r-ini').value){ const d = new Date(); d.setDate(d.getDate() - 30); $('r-ini').value = ymd(d); $('r-fin').value = hoyStr(); }
  const otra = plaza === 'puebla' ? 'acapulco' : 'puebla';
  const sel = $('r-plaza'), cur = sel.value || 'actual';
  sel.innerHTML = `<option value="actual">Plaza ${plazaNombre()}</option><option value="otra">Plaza ${plazaNombre(otra)}</option><option value="ambas">Ambas plazas</option>`;
  sel.value = cur;
  repCache = null;
  renderReporte();
}

function setRango(r){
  const hoy = hoyStr(); let ini = hoy;
  if(r === 'semana'){ const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); ini = ymd(d); }
  else if(r === 'mes') ini = hoy.slice(0, 8) + '01';
  else if(r === 'todo') ini = '2020-01-01';
  $('r-ini').value = ini; $('r-fin').value = hoy;
  renderReporte();
}

async function pedidosReporte(){
  const sel = (esAdmin() && $('r-plaza').value) || 'actual';
  const mios = pedidos.map(p => ({ ...p, _pl: plaza }));
  if(sel === 'actual') return { lista: mios, etiqueta: plazaNombre() };
  const otra = plaza === 'puebla' ? 'acapulco' : 'puebla';
  if(!repCache || repCache.pl !== otra || Date.now() - repCache.t > 60000){
    const snap = await db.ref('plazas/' + otra + '/pedidos').once('value');
    repCache = { pl: otra, t: Date.now(), data: snap.val() ? Object.values(snap.val()) : [] };
  }
  const otros = repCache.data.map(p => ({ ...p, _pl: otra }));
  return sel === 'otra' ? { lista: otros, etiqueta: plazaNombre(otra) } : { lista: mios.concat(otros), etiqueta: 'Ambas plazas' };
}

async function datosReporte(){
  const ini = $('r-ini').value, fin = $('r-fin').value;
  if(!ini || !fin) return null;
  const { lista, etiqueta } = await pedidosReporte();
  const filtrados = lista.filter(p => p.status === 'entregado' && new Date(ventaFecha(p)) >= inicioDia(ini) && new Date(ventaFecha(p)) <= finDia(fin));
  return { ini, fin, etiqueta, filtrados };
}

async function renderReporte(){
  const token = ++repToken;
  let d;
  try{ d = await datosReporte(); }catch(e){ console.warn(e); toast('No se pudo cargar el reporte', true); return; }
  if(!d || token !== repToken) return;
  const f = d.filtrados;
  const totalVentas = f.reduce((a, p) => a + p.totalMonto, 0), totalPzas = f.reduce((a, p) => a + p.totalPiezas, 0), n = f.length;

  $('r-stats').innerHTML = `<div class="rep-grid">
    <div class="stat hl"><b>${fmt(totalVentas)}</b><span>Total vendido</span></div>
    <div class="stat"><b>${totalPzas}</b><span>Piezas vendidas</span></div>
    <div class="stat"><b>${n}</b><span>Pedidos entregados</span></div>
    <div class="stat"><b>${fmt(n ? totalVentas / n : 0)}</b><span>Ticket promedio</span></div></div>`;

  const porSabor = {}, porCliente = {}, porMes = {};
  f.forEach(p => {
    p.detalles.forEach(x => { const o = porSabor[x.nombre] || (porSabor[x.nombre] = { qty: 0, monto: 0 }); o.qty += x.qty; o.monto += x.subtotal; });
    const c = porCliente[p.cliente] || (porCliente[p.cliente] = { pedidos: 0, monto: 0, piezas: 0 }); c.pedidos++; c.monto += p.totalMonto; c.piezas += p.totalPiezas;
    const m = new Date(ventaFecha(p)).toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }); porMes[m] = (porMes[m] || 0) + p.totalMonto;
  });
  const ranking = Object.entries(porSabor).sort((a, b) => b[1].qty - a[1].qty);
  const top = Object.entries(porCliente).sort((a, b) => b[1].monto - a[1].monto).slice(0, 5);

  const cv = $('chart-ventas'), cs = $('chart-sabores');
  if(chartVentas){ chartVentas.destroy(); chartVentas = null; }
  if(chartSabores){ chartSabores.destroy(); chartSabores = null; }
  const meses = Object.keys(porMes);
  cv.hidden = meses.length < 2;
  if(meses.length > 1 && window.Chart){
    chartVentas = new Chart(cv, { type: 'bar', data: { labels: meses, datasets: [{ data: Object.values(porMes), backgroundColor: '#38bdf8', borderRadius: 6 }] },
      options: { responsive: true, plugins: { legend: { display: false }, title: { display: true, text: 'Ventas por mes' } }, scales: { y: { ticks: { callback: v => '$' + v.toLocaleString() } } } } });
  }
  const t10 = ranking.slice(0, 10);
  cs.hidden = !t10.length;
  if(t10.length && window.Chart){
    chartSabores = new Chart(cs, { type: 'bar', data: { labels: t10.map(([k]) => k.length > 16 ? k.slice(0, 15) + '…' : k), datasets: [{ data: t10.map(([, v]) => v.qty), backgroundColor: '#0b0d10', borderRadius: 6 }] },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false }, title: { display: true, text: 'Sabores más vendidos (piezas)' } } } });
  }

  $('r-clientes').innerHTML = top.length ? `<h3 style="margin:16px 0 8px;">Mejores clientes</h3>` + top.map(([nom, v], i) => `
    <div class="list-row"><span class="chip ${i === 0 ? 'ink' : ''}" style="min-width:26px;text-align:center;">${i + 1}</span>
      <div class="grow"><b>${esc(nom)}</b><div class="mut small">${v.pedidos} pedidos · ${v.piezas} pzas</div></div><b class="brandfont">${fmt(v.monto)}</b></div>`).join('') : '';
  $('r-detalle').innerHTML = ranking.length ? `<h3 style="margin:16px 0 8px;">Por sabor</h3><table class="tbl"><thead><tr><th>Sabor</th><th class="ctr">Pzas</th><th class="num">Total</th></tr></thead><tbody>` +
    ranking.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="ctr">${v.qty}</td><td class="num"><b>${fmt(v.monto)}</b></td></tr>`).join('') + '</tbody></table>'
    : '<div class="empty">Sin pedidos entregados en este período</div>';
}

async function pdfReporte(){
  const d = await datosReporte();
  if(!d){ toast('Selecciona un rango de fechas', true); return; }
  const f = d.filtrados;
  if(!f.length){ toast('No hay pedidos entregados en ese período', true); return; }
  const totalVentas = f.reduce((a, p) => a + p.totalMonto, 0), totalPzas = f.reduce((a, p) => a + p.totalPiezas, 0);
  const porSabor = {};
  f.forEach(p => p.detalles.forEach(x => { const o = porSabor[x.nombre] || (porSabor[x.nombre] = { qty: 0, monto: 0 }); o.qty += x.qty; o.monto += x.subtotal; }));
  const ranking = Object.entries(porSabor).sort((a, b) => b[1].qty - a[1].qty);
  const doc = pdfNuevo(), W = 210;
  pdfCabecera(doc, 'REPORTE DE VENTAS', 'La Auténtica Acapulqueña · ' + d.etiqueta, 'Período: ' + d.ini + ' al ' + d.fin, 32);
  doc.setFillColor(...PDF_SKY_L); doc.roundedRect(10, 38, W - 20, 26, 3, 3, 'F');
  doc.setTextColor(...PDF_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('RESUMEN', 16, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.text('Total vendido: ' + fmt(totalVentas), 16, 53); doc.text('Piezas vendidas: ' + totalPzas, 105, 53);
  doc.text('Pedidos entregados: ' + f.length, 16, 59.5); doc.text('Ticket promedio: ' + fmt(totalVentas / f.length), 105, 59.5);
  doc.autoTable({
    startY: 70, head: [['#', 'Sabor', 'Piezas', 'Total']],
    body: ranking.map(([k, v], i) => [String(i + 1), k, String(v.qty), fmt(v.monto)]),
    theme: 'grid', headStyles: { ...PDF_HEAD, fontSize: 10 }, bodyStyles: { fontSize: 9.5, textColor: [16, 22, 29] }, alternateRowStyles: { fillColor: [245, 250, 253] },
    columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 104 }, 2: { cellWidth: 36, halign: 'center' }, 3: { cellWidth: 34, halign: 'right' } }, margin: { left: 10, right: 10 }
  });
  const y = doc.lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...PDF_INK); doc.text('DETALLE DE PEDIDOS', 10, y);
  doc.autoTable({
    startY: y + 3, head: [['Folio', 'Cliente', 'Plaza', 'Pzas', 'Total', 'Fecha']],
    body: f.map(p => ['#' + folio(p), p.cliente, plazaNombre(p._pl), String(p.totalPiezas), fmt(p.totalMonto), fmtFecha(ventaFecha(p))]),
    theme: 'grid', headStyles: { ...PDF_HEAD, fillColor: [3, 105, 161], fontSize: 9 }, bodyStyles: { fontSize: 8.5, textColor: [16, 22, 29] }, alternateRowStyles: { fillColor: [245, 250, 253] },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 54 }, 2: { cellWidth: 22 }, 3: { cellWidth: 16, halign: 'center' }, 4: { cellWidth: 28, halign: 'right' }, 5: { cellWidth: 46 } }, margin: { left: 10, right: 10 }
  });
  const fy = doc.lastAutoTable.finalY + 6;
  doc.setFillColor(...PDF_INK); doc.roundedRect(120, fy, W - 130, 20, 3, 3, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.text('TOTAL DEL PERÍODO', 126, fy + 7);
  doc.setTextColor(...PDF_SKY); doc.setFontSize(13); doc.text(fmt(totalVentas), 126, fy + 16);
  pdfPie(doc, 'La Auténtica Acapulqueña · Reporte generado el ' + fmtFecha(Date.now()));
  doc.save('Reporte_' + d.ini + '_al_' + d.fin + '.pdf');
  logBit('Exportar reporte', d.etiqueta + ' · ' + d.ini + ' al ' + d.fin);
  toast('Reporte PDF generado');
}
