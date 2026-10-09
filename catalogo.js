/* =====================================================================
   catalogo.js — sabores (con precio por esquema) y clientes
   ===================================================================== */

/* ---------- CATÁLOGO ---------- */
function renderCatalogo(){
  $('cat-plaza').textContent = plazaNombre();
  const q = ($('q-cat').value || '').toLowerCase();
  const lista = sabores.filter(s => s.nombre.toLowerCase().includes(q)).sort(sortNombre);
  const cont = $('cat-list');
  if(!sabores.length){ cont.innerHTML = '<div class="empty">El catálogo de ' + plazaNombre() + ' está vacío.<br>Agrega tus sabores con el botón de arriba.</div>'; return; }
  if(!lista.length){ cont.innerHTML = '<div class="empty">Sin resultados</div>'; return; }
  const esqs = esquemasInfo();
  cont.innerHTML = lista.map(s => {
    const tag = s.tag === 'nuevo' ? '<span class="chip">Nuevo</span>' : s.tag === 'temporada' ? '<span class="chip amber">Temporada</span>' : '';
    const precios = esqs.map(e => {
      const v = s.precios && s.precios[e.id];
      const falta = v === undefined || v === null || v === '';
      return `<span class="pbadge ${falta ? 'miss' : ''}">${e.label}: ${falta ? 'falta' : fmt(v)}</span>`;
    }).join('');
    return `<div class="cat-item ${s.fuera ? 'fuera' : ''}">
      <div class="cat-img">${s.imagen ? `<img src="${s.imagen}" alt="">` : `<div class="ph">${esc(s.nombre.charAt(0).toUpperCase())}</div>`}
        <label title="${s.imagen ? 'Cambiar' : 'Subir'} imagen">${s.imagen ? '✎' : '＋'}<input type="file" accept="image/*" hidden onchange="subirImagenSabor('${s.id}',this.files[0]);this.value=''"></label></div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;">${esc(s.nombre)} ${tag} ${s.fuera ? '<span class="chip gray">Fuera de menú</span>' : ''}</div>
        <div class="pbadges">${precios}</div>
        <div class="row-btns">
          <button class="btn btn-line btn-sm" onclick="openSabor('${s.id}')">Editar</button>
          <button class="btn btn-line btn-sm" onclick="toggleFuera('${s.id}')">${s.fuera ? 'Volver al menú' : 'Sacar del menú'}</button>
          <button class="btn btn-danger btn-sm" onclick="delSabor('${s.id}')">Eliminar</button>
        </div>
      </div></div>`;
  }).join('');
}

function openSabor(id){
  const s = id ? sabores.find(x => x.id === id) : null;
  $('m-sabor-t').textContent = s ? 'Editar sabor' : 'Nuevo sabor';
  $('ms-id').value = s ? s.id : '';
  $('ms-nombre').value = s ? s.nombre : '';
  $('ms-tag').value = s ? (s.tag || '') : '';
  $('ms-precios').innerHTML = esquemasInfo().map(e => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <span style="flex:1;font-weight:700;color:var(--sky3);">${e.label}</span>
      <div style="display:flex;align-items:center;gap:4px;width:130px;"><span class="mut">$</span>
        <input type="number" min="0" step="0.5" inputmode="decimal" data-esq="${e.id}" value="${s && s.precios && s.precios[e.id] != null ? s.precios[e.id] : ''}"></div>
    </div>`).join('');
  openModal('m-sabor');
}

async function guardarSabor(){
  const id = $('ms-id').value, nombre = $('ms-nombre').value.trim(), tag = $('ms-tag').value;
  if(!nombre){ toast('Escribe el nombre del sabor', true); return; }
  if(sabores.some(s => s.id !== id && s.nombre.toLowerCase() === nombre.toLowerCase())){ toast('Ya existe un sabor con ese nombre', true); return; }
  const precios = {};
  let faltan = false;
  document.querySelectorAll('#ms-precios input').forEach(inp => {
    const v = parseFloat(inp.value);
    if(isNaN(v) || v < 0) faltan = true; else precios[inp.dataset.esq] = v;
  });
  if(faltan){ toast('Captura el precio de todos los esquemas', true); return; }
  const prev = id ? sabores.find(x => x.id === id) : null;
  const nuevoId = id || R('sabores').push().key;
  const obj = { id: nuevoId, nombre, tag, precios, fuera: prev ? !!prev.fuera : false };
  if(prev && prev.imagen) obj.imagen = prev.imagen;
  await R('sabores/' + nuevoId).set(obj);
  logBit(id ? 'Editar sabor' : 'Nuevo sabor', nombre);
  closeModal('m-sabor'); toast('Sabor guardado');
}

async function toggleFuera(id){
  const s = sabores.find(x => x.id === id); if(!s) return;
  await R('sabores/' + id + '/fuera').set(!s.fuera);
  logBit(s.fuera ? 'Sabor vuelve al menú' : 'Sabor fuera de menú', s.nombre);
  toast(s.fuera ? 'Devuelto al menú' : 'Fuera de menú');
}

function delSabor(id){
  const s = sabores.find(x => x.id === id); if(!s) return;
  confirmar('¿Eliminar ' + s.nombre + '?', 'Se quita del catálogo y se borra su inventario. Los pedidos anteriores conservan su registro.', async () => {
    await R('sabores/' + id).remove();
    await R('inventario/' + id).remove();
    logBit('Eliminar sabor', s.nombre); toast('Sabor eliminado');
  });
}

function reducirImagen(file, max, tipo, calidad){
  return new Promise((ok, fail) => {
    const rd = new FileReader();
    rd.onerror = () => fail(new Error('No se pudo leer la imagen'));
    rd.onload = e => {
      const img = new Image();
      img.onerror = () => fail(new Error('Formato de imagen no válido'));
      img.onload = () => {
        let w = img.width, h = img.height;
        if(w > h){ if(w > max){ h = h * max / w; w = max; } } else { if(h > max){ w = w * max / h; h = max; } }
        const cv = document.createElement('canvas'); cv.width = Math.round(w); cv.height = Math.round(h);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        ok(cv.toDataURL(tipo, calidad));
      };
      img.src = e.target.result;
    };
    rd.readAsDataURL(file);
  });
}

async function subirImagenSabor(id, file){
  if(!file) return;
  if(file.size > 5000000){ toast('La imagen es muy grande (máx. 5 MB)', true); return; }
  try{
    const b64 = await reducirImagen(file, 240, 'image/jpeg', 0.78);
    await R('sabores/' + id + '/imagen').set(b64);
    toast('Imagen guardada');
  }catch(e){ toast(e.message, true); }
}

async function importarSabores(){
  const otra = plaza === 'puebla' ? 'acapulco' : 'puebla';
  const [sSnap, cSnap] = await Promise.all([db.ref('plazas/' + otra + '/sabores').once('value'), db.ref('plazas/' + otra + '/config/esquemas').once('value')]);
  const origen = sSnap.val() ? Object.values(sSnap.val()) : [];
  if(!origen.length){ toast('La plaza ' + plazaNombre(otra) + ' no tiene sabores para importar', true); return; }
  const esqOtra = cSnap.val() ? Object.values(cSnap.val()) : ESQUEMAS_DEFAULT;
  const existentes = new Set(sabores.map(s => s.nombre.toLowerCase()));
  const nuevos = origen.filter(s => !existentes.has((s.nombre || '').toLowerCase()));
  if(!nuevos.length){ toast('Todos los sabores de ' + plazaNombre(otra) + ' ya están aquí'); return; }
  confirmar('¿Importar ' + nuevos.length + ' sabor' + (nuevos.length > 1 ? 'es' : '') + ' de ' + plazaNombre(otra) + '?',
    'Se copian nombre, etiqueta, imagen y precios (los precios se igualan por cantidad mínima del esquema). El inventario NO se copia.', async () => {
    const upd = {};
    nuevos.forEach(s => {
      const id = R('sabores').push().key, precios = {};
      esquemasInfo().forEach(e => {
        const par = esqOtra.find(o => Number(o.min) === e.min);
        if(par && s.precios && s.precios[par.id] != null) precios[e.id] = s.precios[par.id];
      });
      const obj = { id, nombre: s.nombre, tag: s.tag || '', precios, fuera: !!s.fuera };
      if(s.imagen) obj.imagen = s.imagen;
      upd[P('sabores/' + id)] = obj;
    });
    await db.ref().update(upd);
    logBit('Importar sabores', nuevos.length + ' desde ' + plazaNombre(otra));
    toast(nuevos.length + ' sabores importados. Revisa los precios que digan "falta".');
  });
}

/* ---------- CLIENTES ---------- */
function renderClientes(){
  $('cli-plaza').textContent = plazaNombre();
  renderClienteSelect();
  const q = ($('q-cli').value || '').toLowerCase();
  const lista = clientes.filter(c => (c.nombre || '').toLowerCase().includes(q)).sort(sortNombre);
  $('cli-list').innerHTML = lista.length ? lista.map(c => `
    <div class="list-row">
      <div class="grow"><div class="name">${esc(c.nombre)}</div>
        <div class="mut small">${c.telefono ? esc(c.telefono) + ' · ' : ''}${c.descuento > 0 ? `<span class="chip ok">-${fmt(c.descuento)}/pza</span>` : 'Sin descuento'}</div></div>
      <button class="btn btn-line btn-sm" onclick="openCliente('${c.id}')">Editar</button>
      <button class="btn btn-danger btn-sm" onclick="delCliente('${c.id}')">Quitar</button>
    </div>`).join('') : '<div class="empty">No hay clientes registrados en ' + plazaNombre() + '</div>';
}
function openCliente(id){
  const c = id ? clientes.find(x => x.id === id) : null;
  $('m-cli-t').textContent = c ? 'Editar cliente' : 'Nuevo cliente';
  $('mc-id').value = c ? c.id : ''; $('mc-nombre').value = c ? c.nombre : '';
  $('mc-tel').value = c ? (c.telefono || '') : ''; $('mc-desc').value = c && c.descuento ? c.descuento : '';
  openModal('m-cliente');
}
async function guardarCliente(){
  const id = $('mc-id').value, nombre = $('mc-nombre').value.trim();
  if(!nombre){ toast('Escribe el nombre', true); return; }
  const nuevoId = id || R('clientes').push().key;
  await R('clientes/' + nuevoId).set({ id: nuevoId, nombre, telefono: $('mc-tel').value.trim(), descuento: Math.max(0, parseFloat($('mc-desc').value) || 0) });
  logBit(id ? 'Editar cliente' : 'Nuevo cliente', nombre);
  closeModal('m-cliente'); toast('Cliente guardado');
}
function delCliente(id){
  const c = clientes.find(x => x.id === id); if(!c) return;
  confirmar('¿Quitar a ' + c.nombre + '?', 'Se elimina de la lista de clientes. Sus pedidos anteriores se conservan.', async () => {
    await R('clientes/' + id).remove(); logBit('Eliminar cliente', c.nombre); toast('Cliente eliminado');
  });
}
