// Router basado en hash (#/ruta/:param) con guardas por rol.
import { auth } from './auth.js';

class Router {
  constructor() {
    this.routes = [];
    this.notFound = null;
    this.current = null;
  }

  add(pattern, handler, options = {}) {
    const segments = pattern.split('/').filter(Boolean).map((s) =>
      s.startsWith(':') ? { param: s.slice(1) } : { literal: s });
    this.routes.push({ pattern, segments, handler, options });
    return this;
  }

  setNotFound(handler) { this.notFound = handler; return this; }

  start() {
    window.addEventListener('hashchange', () => this.resolve());
    this.resolve();
  }

  navigate(path) { window.location.hash = path.startsWith('#') ? path : `#${path}`; }

  resolve() {
    const raw = window.location.hash.replace(/^#/, '') || '/';
    const [pathPart, queryPart] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(queryPart || ''));

    for (const route of this.routes) {
      if (route.segments.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        if (seg.literal !== undefined) { if (seg.literal !== parts[i]) { ok = false; break; } }
        else params[seg.param] = decodeURIComponent(parts[i]);
      }
      if (!ok) continue;

      // Guarda de autenticacion / rol
      const role = route.options.role;
      if (role) {
        if (!auth.isAuthenticated() || auth.isExpired()) { this.navigate('/login'); return; }
        if (auth.getRole() !== role) { this.navigate(auth.homeRoute().replace('#', '')); return; }
      }
      this.current = { params, query, pattern: route.pattern };
      route.handler({ params, query });
      return;
    }

    if (this.notFound) this.notFound();
  }
}

export const router = new Router();
