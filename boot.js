/* =====================================================================
   boot.js — arranque: Firebase, sesión y estado de conexión
   ===================================================================== */
(function iniciar(){
  cargarLogoLocal();
  mostrarPantalla('login');
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    auth = firebase.auth();
  }catch(e){
    console.error(e);
    loginMsg('No se pudo conectar con Firebase. Revisa tu conexión e intenta de nuevo.');
    return;
  }
  db.ref('.info/connected').on('value', s => estadoConexion(!!s.val()));
  auth.onAuthStateChanged(async u => {
    if(!u){
      usuario = null; plaza = null; desuscribir();
      mostrarPantalla('login');
      return;
    }
    try{ await alIniciarSesion(u); }
    catch(e){
      console.error(e);
      try{ await auth.signOut(); }catch(_){}
      loginMsg('No se pudo cargar tu usuario (' + (e.code || e.message) + '). Revisa que las reglas de la base de datos estén publicadas.');
    }
  });
})();
