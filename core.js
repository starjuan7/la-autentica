/* =====================================================================
   La Auténtica Acapulqueña · Sistema de gestión
   core.js — configuración, estado, utilidades, sesión, plazas y datos
   ===================================================================== */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBXHWmNrq7eHTxelDpGTT-16MEBT0rpeuo",
  authDomain: "la-autentica-acapulquena.firebaseapp.com",
  databaseURL: "https://la-autentica-acapulquena-default-rtdb.firebaseio.com",
  projectId: "la-autentica-acapulquena",
  storageBucket: "la-autentica-acapulquena.firebasestorage.app",
  messagingSenderId: "376852380609",
  appId: "1:376852380609:web:e13696c636c159ff56cd40"
};

// Administradores principales (siempre tienen acceso total; las reglas de la base de datos usan los mismos UID)
const ADMIN_UIDS = {
  'CIapCOxKFeVvbSbhP9qEoXx0dWE3': 'Juan',
  'YCymphFfszgTaKzHudpbxdjhXn13': 'Judith'
};

const PLAZAS = { puebla: 'Puebla', acapulco: 'Acapulco' };
const ESQUEMAS_DEFAULT = [ { id:'e1', min:50 }, { id:'e2', min:100 }, { id:'e3', min:250 } ];
const COLORES_ESQ = ['#7dd3fc', '#38bdf8', '#0284c7', '#075985', '#0b0d10'];
const STATUS_LABEL = { pendiente:'Pendiente', listo:'Listo', entregado:'Entregado', cancelado:'Cancelado' };

/* ---------- Estado ---------- */
let db = null, auth = null;
let usuario = null;          // { uid, email, nombre, rol, plazaRestricta, permisos }
let plaza = null;            // 'puebla' | 'acapulco'
let cfg = defaultCfg();      // configuración de la plaza activa
let sabores = [], inv = {}, pedidos = [], clientes = [], historial = [], bitacora = [];
let logoData = '';           // logo de la marca (data URL)
let listeners = [];
let pedidoActual = {};       // carrito del pedido nuevo { saborId: qty }

function defaultCfg(){ return { esquemas: ESQUEMAS_DEFAULT.map(e => ({...e})), controlStock: true, piezasMolde: 40 }; }

/* ---------- Utilidades ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fmt(n){ const v = parseFloat(n); return isNaN(v) ? '—' : '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function fmtFecha(ts){ return new Date(ts).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
function ymd(d){ d = new Date(d); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
const hoyStr = () => ymd(Date.now());
const inicioDia = s => new Date(s + 'T00:00:00');
const finDia = s => new Date(s + 'T23:59:59.999');
const folio = p => String(p.id).slice(-6);
const sortNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
const plazaNombre = p => PLAZAS[p || plaza] || '';

function toast(msg, bad){
  const t = $('toast');
  t.textContent = msg; t.style.background = bad ? '#b91c1c' : '';
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2800);
}
function openModal(id){ $(id).classList.add('open'); }
function closeModal(id){ $(id).classList.remove('open'); }

let confirmCb = null, confirmTyped = null;
function confirmar(title, msg, cb, typed){
  $('cf-t').textContent = title; $('cf-m').textContent = msg;
  confirmCb = cb; confirmTyped = typed || null;
  $('cf-typed-w').hidden = !typed;
  $('cf-typed').value = '';
  if(typed) $('cf-typed-l').textContent = 'Escribe ' + typed + ' para continuar';
  openModal('confirm-bg');
}
function closeConfirm(){ closeModal('confirm-bg'); confirmCb = null; confirmTyped = null; }
$('cf-ok').onclick = async () => {
  if(confirmTyped && $('cf-typed').value.trim().toUpperCase() !== confirmTyped){ toast('Texto de confirmación incorrecto', true); return; }
  const cb = confirmCb; closeConfirm();
  if(cb){ try{ await cb(); }catch(e){ console.warn(e); toast('Ocurrió un error: ' + (e.message || e), true); } }
};

/* ---------- Permisos ---------- */
const esAdmin = () => !!usuario && usuario.rol === 'admin';
function can(perm){
  if(esAdmin()) return true;
  const p = (usuario && usuario.permisos) || {};
  if(perm === 'pedidos' || perm === 'inventario') return p[perm] !== false;
  return p[perm] === true;
}
const TABS = [
  { id:'dashboard',  label:'Inicio' },
  { id:'pedidos',    label:'Pedidos',       perm:'pedidos' },
  { id:'nuevo',      label:'Nuevo pedido',  perm:'pedidos' },
  { id:'inventario', label:'Inventario',    perm:'inventario' },
  { id:'catalogo',   label:'Catálogo',      perm:'catalogo' },
  { id:'clientes',   label:'Clientes',      perm:'pedidos' },
  { id:'produccion', label:'Producción',    perm:'produccion' },
  { id:'reporte',    label:'Reportes',      perm:'reportes' },
  { id:'bitacora',   label:'Bitácora',      admin:true },
  { id:'usuarios',   label:'Usuarios',      admin:true },
  { id:'config',     label:'Configuración', admin:true },
];
function tabPermitido(t){ return t.admin ? esAdmin() : (t.perm ? can(t.perm) : true); }

function construirNav(){
  $('tabs').innerHTML = TABS.filter(tabPermitido).map(t =>
    `<button class="tab-btn" data-tab="${t.id}" onclick="showTab('${t.id}')">${t.label}${t.id==='pedidos'?'<span class="badge-n" id="badge-pedidos" hidden>0</span>':''}</button>`).join('');
  document.querySelectorAll('.admin-only').forEach(el => { el.hidden = !esAdmin(); });
  document.querySelectorAll('[data-perm]').forEach(el => { el.hidden = !can(el.dataset.perm); });
}

function showTab(id){
  const t = TABS.find(x => x.id === id);
  if(!t || !tabPermitido(t)) id = 'dashboard';
  document.querySelectorAll('.tab').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  $('tab-' + id).classList.add('active');
  window.scrollTo(0, 0);
  const render = {
    dashboard: () => renderDashboard(), pedidos: () => renderPedidos(), nuevo: () => { initNuevo(); },
    inventario: () => { renderInventario(); renderHistorial(); }, catalogo: () => renderCatalogo(),
    clientes: () => renderClientes(), produccion: () => renderProduccion(), reporte: () => { initReporte(); },
    bitacora: () => renderBitacora(), usuarios: () => renderUsuarios(), config: () => renderConfig()
  }[id];
  if(render) try{ render(); }catch(e){ console.warn(e); }
  construirNav._active = id;
}
const tabActivo = () => construirNav._active || 'dashboard';

/* ---------- Esquemas de mayoreo y precios ---------- */
function esquemasOrd(){ return (cfg.esquemas || []).slice().sort((a, b) => a.min - b.min); }
function esquemasInfo(){
  const a = esquemasOrd();
  return a.map((e, i) => ({
    ...e,
    max: a[i+1] ? a[i+1].min - 1 : Infinity,
    label: a[i+1] ? `${e.min}–${a[i+1].min - 1} pzas` : `${e.min}+ pzas`,
    color: COLORES_ESQ[i % COLORES_ESQ.length]
  }));
}
function minPedido(){ const a = esquemasOrd(); return a.length ? a[0].min : 1; }
function getEsquema(total){ let r = null; esquemasInfo().forEach(e => { if(total >= e.min) r = e; }); return r; }
function esquemaPorId(id){ return esquemasInfo().find(e => e.id === id) || null; }

// Precio de un sabor en un esquema; si falta, usa el del esquema inmediato inferior (nunca cobra más) o el superior.
function precioSabor(s, esq){
  if(!esq) return null;
  const pr = s.precios || {};
  const val = id => (pr[id] === undefined || pr[id] === null || pr[id] === '' || isNaN(pr[id])) ? null : Number(pr[id]);
  if(val(esq.id) !== null) return val(esq.id);
  const all = esquemasInfo(); const i = all.findIndex(e => e.id === esq.id);
  for(let k = i - 1; k >= 0; k--) if(val(all[k].id) !== null) return val(all[k].id);
  for(let k = i + 1; k < all.length; k++) if(val(all[k].id) !== null) return val(all[k].id);
  return null;
}
const faltaPrecio = s => esquemasInfo().some(e => !s.precios || s.precios[e.id] === undefined || s.precios[e.id] === null || s.precios[e.id] === '');

/* ---------- Existencias ---------- */
const invDe = id => inv[id] || { cantidad: 0, minimo: 10 };
function reservado(saborId, excluirPedido){
  return pedidos.filter(p => (p.status === 'pendiente' || p.status === 'listo') && p.id !== excluirPedido)
    .reduce((t, p) => { const d = (p.detalles || []).find(x => x.saborId === saborId); return t + (d ? d.qty : 0); }, 0);
}
function disponible(saborId, excluirPedido){
  if(!cfg.controlStock) return Infinity;
  return Math.max(0, (Number(invDe(saborId).cantidad) || 0) - reservado(saborId, excluirPedido));
}
function estadoInv(s){
  const i = invDe(s.id);
  if(s.fuera) return 'fuera';
  if(!i.cantidad) return 'out';
  if(i.cantidad <= i.minimo) return 'bajo';
  return 'ok';
}

/* ---------- Base de datos (todo cuelga de la plaza activa) ---------- */
const P = path => 'plazas/' + plaza + '/' + path;
const R = path => db.ref(P(path));

function logBit(accion, detalle){
  try{
    R('bitacora').push({ ts: Date.now(), usuario: (usuario && usuario.nombre) || 'Sistema', rol: (usuario && usuario.rol) || '', accion, detalle: detalle || '' });
  }catch(e){ console.warn('bitácora', e); }
}

function desuscribir(){
  listeners.forEach(r => { try{ r.off(); }catch(e){} });
  listeners = [];
  sabores = []; inv = {}; pedidos = []; clientes = []; historial = []; bitacora = [];
  cfg = defaultCfg();
  pedidoActual = {};
}

function suscribir(){
  desuscribir();
  const on = (query, cb) => { query.on('value', cb, err => { console.warn('Firebase', err); toast('Sin permiso o sin conexión con la base de datos', true); }); listeners.push(query); };
  const vals = snap => { const d = snap.val(); return d ? Object.values(d) : []; };

  on(R('config'), snap => {
    const d = snap.val() || {};
    const esq = d.esquemas ? Object.values(d.esquemas).filter(e => e && e.id && Number(e.min) > 0).map(e => ({ id: e.id, min: Number(e.min) })) : [];
    cfg = { esquemas: esq.length ? esq : ESQUEMAS_DEFAULT.map(e => ({...e})), controlStock: d.controlStock !== false, piezasMolde: Number(d.piezasMolde) || 40 };
    renderTodo();
  });
  on(R('sabores'),    snap => { sabores = vals(snap); renderTodo(); });
  on(R('inventario'), snap => { inv = snap.val() || {}; renderTodo(); });
  on(R('pedidos'),    snap => { pedidos = vals(snap).sort((a, b) => b.fecha - a.fecha); renderTodo(); });
  on(R('clientes'),   snap => { clientes = vals(snap); renderTodo(); });
  on(R('historial').orderByChild('ts').limitToLast(400), snap => { historial = vals(snap).sort((a, b) => b.ts - a.ts); if(tabActivo() === 'inventario') renderHistorial(); });
  on(R('bitacora').orderByChild('ts').limitToLast(400),  snap => { bitacora = vals(snap).sort((a, b) => b.ts - a.ts); if(tabActivo() === 'bitacora') renderBitacora(); });
}

let _renderTimer = null;
function renderTodo(){
  clearTimeout(_renderTimer);
  _renderTimer = setTimeout(() => {
    if(!plaza || !usuario) return;
    const t = tabActivo();
    const fn = {
      dashboard: () => renderDashboard(), pedidos: () => renderPedidos(), nuevo: () => renderNuevo(),
      inventario: () => renderInventario(), catalogo: () => renderCatalogo(), clientes: () => renderClientes(),
      produccion: () => renderProduccion(), reporte: () => renderReporte(), config: () => renderConfig(true)
    }[t];
    try{ if(fn) fn(); }catch(e){ console.warn(e); }
    try{ actualizarBadge(); }catch(e){}
  }, 30);
}

/* ---------- Logo ---------- */
function logoHtml(cls, fbCls, fbText){
  return logoData ? `<img class="${cls}" src="${logoData}" alt="Logo">` : `<div class="${fbCls}">${fbText}</div>`;
}
function pintarLogos(){
  $('login-logo-wrap').innerHTML = logoHtml('screen-logo', 'logo-fallback', 'LA');
  $('pick-logo-wrap').innerHTML  = logoHtml('screen-logo', 'logo-fallback', 'LA');
  $('top-logo-wrap').innerHTML   = logoHtml('logo', 'logo-fb', 'LA');
}
function cargarLogoLocal(){
  try{ logoData = localStorage.getItem('la_logo') || ''; }catch(e){ logoData = ''; }
  pintarLogos();
}
function cargarLogoRemoto(){
  db.ref('marca/logo').on('value', snap => {
    logoData = snap.val() || '';
    try{ if(logoData) localStorage.setItem('la_logo', logoData); else localStorage.removeItem('la_logo'); }catch(e){}
    pintarLogos();
    if(tabActivo() === 'config') renderConfig(true);
  }, () => {});
}

/* ---------- Sesión ---------- */
function mostrarPantalla(cual){
  $('login').hidden = cual !== 'login';
  $('plaza-pick').hidden = cual !== 'pick';
  $('app').hidden = cual !== 'app';
}
function loginMsg(txt, ok){ const e = $('login-err'); e.textContent = txt || ''; e.className = 'login-err' + (ok ? ' ok' : ''); }

async function doLogin(){
  const email = $('login-email').value.trim(), pass = $('login-pass').value;
  if(!email || !pass){ loginMsg('Ingresa tu correo y contraseña'); return; }
  const btn = $('login-btn'); btn.disabled = true; btn.textContent = 'Entrando…'; loginMsg('');
  try{ await auth.signInWithEmailAndPassword(email, pass); }
  catch(e){
    const m = { 'auth/user-not-found':'Usuario no encontrado', 'auth/wrong-password':'Contraseña incorrecta', 'auth/invalid-email':'Correo inválido',
      'auth/too-many-requests':'Demasiados intentos, espera un momento', 'auth/invalid-credential':'Correo o contraseña incorrectos', 'auth/network-request-failed':'Sin conexión a internet' };
    loginMsg(m[e.code] || 'No se pudo iniciar sesión');
  }
  btn.disabled = false; btn.textContent = 'Iniciar sesión';
}
async function doForgot(){
  const email = $('login-email').value.trim();
  if(!email){ loginMsg('Escribe tu correo primero'); return; }
  try{ await auth.sendPasswordResetEmail(email); loginMsg('Te enviamos un correo para restablecer tu contraseña', true); }
  catch(e){ loginMsg('No se pudo enviar el correo'); }
}
function logout(){
  confirmar('¿Cerrar sesión?', 'Volverás a la pantalla de inicio de sesión.', async () => {
    desuscribir(); plaza = null;
    try{ localStorage.removeItem('la_plaza'); }catch(e){}
    await auth.signOut();
  });
}

async function alIniciarSesion(u){
  const snap = await db.ref('usuarios/' + u.uid).once('value');
  let ud = snap.val();
  const principal = ADMIN_UIDS[u.uid];
  if(!ud && principal){
    ud = { nombre: principal, email: u.email, rol: 'admin', activo: true };
    await db.ref('usuarios/' + u.uid).set(ud);
  }
  if(principal){ ud.rol = 'admin'; ud.activo = true; }
  if(!ud || ud.activo === false){
    await auth.signOut();
    loginMsg('Tu usuario no tiene acceso. Pide a un administrador que te registre o reactive.');
    return;
  }
  usuario = Object.assign({ uid: u.uid, email: u.email }, ud);
  cargarLogoRemoto();
  $('top-user').textContent = (usuario.rol === 'admin' ? 'Administrador' : 'Empleado') + ' · ' + (usuario.nombre || usuario.email);

  let p = null;
  if(usuario.rol === 'empleado' && usuario.plazaRestricta) p = usuario.plazaRestricta;
  else { try{ p = localStorage.getItem('la_plaza'); }catch(e){} }
  if(p && PLAZAS[p]) entrarPlaza(p); else mostrarPantalla('pick');
}

function elegirPlaza(p){ entrarPlaza(p); }
function entrarPlaza(p){
  plaza = p;
  try{ localStorage.setItem('la_plaza', p); }catch(e){}
  $('plaza-chip').textContent = plazaNombre(p);
  $('plaza-chip').title = (usuario.rol === 'empleado' && usuario.plazaRestricta) ? 'Plaza asignada' : 'Cambiar de plaza';
  mostrarPantalla('app');
  construirNav();
  suscribir();
  showTab('dashboard');
}
function cambiarPlaza(){
  if(usuario.rol === 'empleado' && usuario.plazaRestricta){ toast('Tu usuario solo opera en ' + plazaNombre(usuario.plazaRestricta)); return; }
  desuscribir(); plaza = null;
  try{ localStorage.removeItem('la_plaza'); }catch(e){}
  mostrarPantalla('pick');
}

function estadoConexion(on){ const d = $('sync'); d.className = 'sync ' + (on ? 'on' : 'off'); d.title = on ? 'Conectado · sincronizando' : 'Sin conexión'; }
