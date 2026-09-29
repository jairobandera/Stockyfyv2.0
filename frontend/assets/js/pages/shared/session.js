// Resuelve el ID numerico del usuario autenticado (el token solo trae el nombre).
import { api } from '../../core/api.js';
import { auth } from '../../core/auth.js';

let cachedId = null;

export async function resolveUsuarioId() {
  if (cachedId) return cachedId;
  const nombre = auth.getUsername();
  const sucursalId = auth.getSucursalId();
  const usuarios = await api.get('/usuarios/all');
  const perfil = usuarios.find((u) => u.nombreUsuario === nombre &&
    (sucursalId == null || u.sucursalId === sucursalId));
  if (!perfil) throw new Error('No se encontró el perfil del usuario autenticado.');
  cachedId = perfil.id;
  return cachedId;
}
