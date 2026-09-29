// Gestiona funciones de limpieza que se ejecutan al abandonar una pagina
// (por ejemplo, desuscribir WebSockets o detener timers de polling).
let cleanups = [];

export function onCleanup(fn) { cleanups.push(fn); }

export function runCleanups() {
  for (const fn of cleanups) { try { fn(); } catch (e) { console.error(e); } }
  cleanups = [];
}
