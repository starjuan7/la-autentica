/* =====================================================================
   admin.js — bitácora, usuarios y configuración (logo, esquemas, opciones)
   Solo para administradores.
   ===================================================================== */

/* ---------- BITÁCORA ---------- */
function renderBitacora(){
  $('bit-plaza').textContent = plazaNombre();
  if(!$('b-ini').value && !$('b-fin').value){ const d = new Date(); d.setDate(d.getDate() - 30); $('b-ini').value = ymd(d); $('b-fin').value = hoyStr(); }
  const ini = $('b-ini').value, fin = $('b-fin').value, q = ($('q-bit').value || '').toLowerCase();
  let lista = bitacora.slice();
  if(ini) lista = lista.filter(b => new Date(b.ts) >= inicioDia(ini));
  if(fin) lista = lista.filter(b => new Date(b.ts) <= finDia(fin));
  if(q) lista = lista.filter(b => ((b.accion || '') + (b.detalle || '') + (b.usuario || '')).toLowerCase().includes(q));
  lista = lista.slice(0, 200);
  $('bit-list').innerHTML = lista.length ? lista.map(b => `
    <div class="list-row" style="align-items:flex-start;">
      <div class="grow"><b>${esc(b.usuario)}</b> <span class="chip ${b.rol === 'admin' ? 'ink' : ''}">${b.rol === 'admin' ? 'Admin' : 'Empleado'}</span>
        <div style="font-weight:600;">${esc(b.accion)}</div><div class="mut small">${esc(b.detalle)}</div></div>
      <div class="mut small" style="text-align:right;min-width:90px;">${fmtFecha(b.ts)}</div></div>`).join('')
    : '<div class="empty">Sin registros en este período</div>';
}

/* ---------- USUARIOS ---------- */
function toggleUsrCampos(){
  const emp = $('mu-rol').value === 'empleado';
  $('mu-plaza-w').hidden = !emp; $('mu-perm-w').hidden = !emp;
}
function openUsuario(uid){
  const nuevo = !uid;
  $('m-usr-t').textContent = nuevo ? 'Registrar usuario' : 'Editar usuario';
  $('mu-edit').value = uid || '';
  $('mu-uid').disabled = !nuevo;
  const llenar = u => {
    $('mu-uid').value = uid || ''; $('mu-nombre').value = u.nombre || ''; $('mu-email').value = u.email || '';
    $('mu-rol').value = u.rol || 'empleado'; $('mu-plaza').value = u.plazaRestricta || '';
    const p = u.permisos || {};
    $('pm-pedidos').checked = p.pedidos !== false; $('pm-inventario').checked = p.inventario !== false;
    $('pm-catalogo').checked = p.catalogo === true; $('pm-reportes').checked = p.reportes === true; $('pm-produccion').checked = p.produccion === true;
    toggleUsrCampos(); openModal('m-usuario');
  };
  if(nuevo) llenar({});
  else db.ref('usuarios/' + uid).once('value').then(s => llenar(s.val() || {}));
}

async function guardarUsuario(){
  const edit = $('mu-edit').value, uid = (edit || $('mu-uid').value).trim();
  const nombre = $('mu-nombre').value.trim(), email = $('mu-email').value.trim(), rol = $('mu-rol').value;
  if(!uid || !nombre || !email){ toast('Completa UID, nombre y correo', true); return; }
  if(/[.#$\[\]\/]/.test(uid)){ toast('El UID no es válido', true); return; }
  if(ADMIN_UIDS[uid] && rol !== 'admin'){ toast('Los administradores principales no pueden cambiar de rol', true); return; }
  const data = { nombre, email, rol, activo: true };
  if(rol === 'empleado'){
    data.plazaRestricta = $('mu-plaza').value || null;
    data.permisos = { pedidos: $('pm-pedidos').checked, inventario: $('pm-inventario').checked, catalogo: $('pm-catalogo').checked, reportes: $('pm-reportes').checked, produccion: $('pm-produccion').checked };
  } else { data.plazaRestricta = null; data.permisos = null; }
  try{
    await db.ref('usuarios/' + uid).update(data);
    logBit(edit ? 'Editar usuario' : 'Registrar usuario', nombre + ' (' + rol + ')');
    closeModal('m-usuario'); toast('Usuario guardado'); renderUsuarios();
  }catch(e){ toast('No se pudo guardar: ' + e.message, true); }
}

async function renderUsuarios(){
  const snap = await db.ref('usuarios').once('value');
  const todos = Object.entries(snap.val() || {}).filter(([, u]) => u.rol === 'admin' || u.rol === 'empleado');
  const activos = todos.filter(([, u]) => u.activo !== false), bajas = todos.filter(([, u]) => u.activo === false);
  $('u-admins').textContent = activos.filter(([, u]) => u.rol === 'admin').length;
  $('u-emps').textContent = activos.filter(([, u]) => u.rol === 'empleado').length;
  $('u-total').textContent = activos.length;
  const fila = ([uid, u]) => {
    const principal = !!ADMIN_UIDS[uid], yo = uid === usuario.uid;
    const perm = u.permisos ? Object.entries(u.permisos).filter(([, v]) => v).map(([k]) => k).join(', ') : '';
    return `<div class="list-row">
      <div class="grow"><div class="name">${esc(u.nombre || 'Sin nombre')}${yo ? ' <span class="mut small">(tú)</span>' : ''}</div>
        <div class="mut small">${esc(u.email)}</div>
        <div style="margin-top:4px;display:flex;gap:5px;flex-wrap:wrap;"><span class="chip ${u.rol === 'admin' ? 'ink' : ''}">${u.rol === 'admin' ? 'Administrador' : 'Empleado'}</span>
          ${u.plazaRestricta ? `<span class="chip">${esc(plazaNombre(u.plazaRestricta))}</span>` : (u.rol === 'empleado' ? '<span class="chip gray">Ambas plazas</span>' : '')}
          ${perm ? `<span class="mut small">${esc(perm)}</span>` : ''}</div></div>
      ${principal ? '<span class="chip ok">Principal</span>' : `<div style="display:flex;flex-direction:column;gap:5px;">
        <button class="btn btn-line btn-sm" onclick="openUsuario('${uid}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="bajaUsuario('${uid}')">Baja</button></div>`}
    </div>`;
  };
  $('u-list').innerHTML = activos.length ? activos.map(fila).join('') : '<div class="empty">Sin usuarios activos</div>';
  $('u-baja').innerHTML = bajas.length ? bajas.map(([uid, u]) => `
    <div class="list-row"><div class="grow"><div class="name mut">${esc(u.nombre)}</div><div class="mut small">${esc(u.email)}</div></div>
      <button class="btn btn-ok btn-sm" onclick="reactivarUsuario('${uid}')">Reactivar</button></div>`).join('') : '<div class="empty">Sin usuarios dados de baja</div>';
}
function bajaUsuario(uid){
  confirmar('¿Dar de baja este usuario?', 'Ya no podrá entrar al sistema. Puedes reactivarlo cuando quieras.', async () => {
    await db.ref('usuarios/' + uid + '/activo').set(false); logBit('Baja de usuario', uid); toast('Usuario dado de baja'); renderUsuarios();
  });
}
async function reactivarUsuario(uid){
  await db.ref('usuarios/' + uid + '/activo').set(true); logBit('Reactivar usuario', uid); toast('Usuario reactivado'); renderUsuarios();
}

/* ---------- CONFIGURACIÓN ---------- */
let esqEdit = null, esqEditPlaza = null;

function renderConfig(soft){
  $('cfg-logo-prev').innerHTML = logoData ? `<img class="logo-prev" src="${logoData}" alt="Logo">` : '<div class="logo-prev" style="display:flex;align-items:center;justify-content:center;color:#38bdf8;font-family:Sora;font-size:2rem;font-weight:700;">LA</div>';
  ['cfg-plaza-esq', 'cfg-plaza-opt'].forEach(i => $(i).textContent = plazaNombre());
  if(soft && esqEdit && esqEditPlaza === plaza) return;
  esqEdit = esquemasOrd().map(e => ({ ...e })); esqEditPlaza = plaza;
  $('opt-stock').checked = cfg.controlStock; $('opt-molde').value = cfg.piezasMolde || 40;
  pintarEsqEditor();
}

function pintarEsqEditor(){
  esqEdit.sort((a, b) => a.min - b.min);
  $('esq-editor').innerHTML = esqEdit.map((e, i) => {
    const sig = esqEdit[i + 1];
    const rango = sig ? `${e.min}–${Math.max(e.min, sig.min - 1)} pzas` : `${e.min}+ pzas`;
    return `<div class="esq-edit">
      <div style="min-width:64px;"><span class="mut small">${i === 0 ? 'Pedido mínimo' : 'Desde'}</span></div>
      <input type="number" min="1" inputmode="numeric" value="${e.min}" onchange="esqCambiar('${e.id}',this.value)">
      <div class="lbl">${rango}</div>
      <button class="btn btn-danger btn-sm" onclick="esqQuitar('${e.id}')" ${esqEdit.length <= 1 ? 'disabled' : ''}>Quitar</button>
    </div>`;
  }).join('');
}
function esqCambiar(id, v){ const e = esqEdit.find(x => x.id === id); if(e){ e.min = Math.max(1, parseInt(v) || 1); pintarEsqEditor(); } }
function esqQuitar(id){ if(esqEdit.length > 1){ esqEdit = esqEdit.filter(x => x.id !== id); pintarEsqEditor(); } }
function esqAgregar(){
  const max = esqEdit.reduce((m, e) => Math.max(m, e.min), 0);
  esqEdit.push({ id: 'e' + Date.now().toString(36), min: max ? max + 100 : 50 });
  pintarEsqEditor();
}
function esqRestablecer(){ esqEdit = ESQUEMAS_DEFAULT.map(e => ({ ...e })); pintarEsqEditor(); }

function validarEsq(){
  const mins = esqEdit.map(e => e.min);
  if(!mins.length) return 'Debe haber al menos un esquema';
  if(mins.some(m => !Number.isInteger(m) || m < 1)) return 'Los mínimos deben ser números enteros mayores a 0';
  if(new Set(mins).size !== mins.length) return 'Hay dos esquemas con el mismo mínimo';
  return '';
}
async function esqGuardar(){
  const err = validarEsq(); if(err){ toast(err, true); return; }
  const arr = esqEdit.slice().sort((a, b) => a.min - b.min).map(e => ({ id: e.id, min: e.min }));
  await R('config/esquemas').set(arr);
  logBit('Esquemas de mayoreo', arr.map(e => e.min + '+').join(' / '));
  toast('Esquemas guardados. Revisa en el Catálogo los sabores que digan "falta" precio.');
}
function esqCopiar(){
  const err = validarEsq(); if(err){ toast(err, true); return; }
  const otra = plaza === 'puebla' ? 'acapulco' : 'puebla';
  confirmar('¿Copiar estos esquemas a ' + plazaNombre(otra) + '?', 'Reemplaza los esquemas actuales de esa plaza.', async () => {
    const arr = esqEdit.slice().sort((a, b) => a.min - b.min).map(e => ({ id: e.id, min: e.min }));
    await db.ref('plazas/' + otra + '/config/esquemas').set(arr);
    logBit('Copiar esquemas', 'a ' + plazaNombre(otra)); toast('Esquemas copiados a ' + plazaNombre(otra));
  });
}
async function guardarOpciones(){
  const molde = parseInt($('opt-molde').value);
  if(!molde || molde < 1){ toast('Piezas por molde inválido', true); return; }
  await R('config').update({ controlStock: $('opt-stock').checked, piezasMolde: molde });
  logBit('Opciones de plaza', (cfg.controlStock ? 'control de stock activo' : 'sin control de stock') + ' · molde ' + molde); toast('Opciones guardadas');
}

/* ---------- Logo ---------- */
async function subirLogo(file){
  if(!file) return;
  if(file.size > 8000000){ toast('La imagen es muy grande (máx. 8 MB)', true); return; }
  try{
    let b64 = await reducirImagen(file, 420, 'image/png');
    if(b64.length > 900000) b64 = await reducirImagen(file, 420, 'image/jpeg', 0.85);
    await db.ref('marca/logo').set(b64);
    logBit('Cambiar logo', 'Nuevo logo cargado'); toast('Logo actualizado');
  }catch(e){ toast(e.message, true); }
}
function quitarLogo(){
  confirmar('¿Quitar el logo?', 'Se mostrará el ícono por defecto hasta que subas otro.', async () => {
    await db.ref('marca/logo').remove(); logBit('Quitar logo', ''); toast('Logo quitado');
  });
}
