import { query, transaction } from '../../config/db.js';
import { badRequest, notFound } from '../../core/httpError.js';
import { productoRepository, normalizeProducto } from './producto.repository.js';

function validateProductoDto(dto) {
  if (dto.imagen) {
    if (!/^data:image\/(jpeg|png);base64,.+/.test(dto.imagen)) {
      throw badRequest('La imagen debe ser un base64 valido de tipo JPEG o PNG');
    }
    const base64Data = dto.imagen.split(',')[1] || '';
    const size = Math.floor((base64Data.length * 3) / 4);
    if (size > 5_000_000) throw badRequest('La imagen no debe exceder 5MB');
  }
  if (!dto.nombre) throw badRequest('El nombre del producto es requerido');
  if (!dto.codigosBarra || dto.codigosBarra.length === 0) throw badRequest('Al menos un codigo de barra es requerido');
  if (dto.precio === undefined || dto.precio === null || dto.precio < 0) throw badRequest('El precio debe ser mayor o igual a 0');
  if (dto.cantidadStock === undefined || dto.cantidadStock === null || dto.cantidadStock < 0) throw badRequest('El stock debe ser mayor o igual a 0');
  if (!dto.codigoProducto) throw badRequest('El codigo del producto es requerido');
}

async function assertCodigoProductoUnico(conn, codigo, id) {
  const [rows] = await conn.execute(`SELECT id FROM producto WHERE codigo_producto = ?`, [codigo]);
  if (rows.length && (id === null || rows[0].id !== Number(id))) {
    throw badRequest(`El codigo de producto ${codigo} ya esta asignado a otro producto`);
  }
}

async function resolveCategoria(conn, dto) {
  if (dto.categoriaId) {
    const [rows] = await conn.execute(`SELECT id FROM categoria WHERE id = ?`, [dto.categoriaId]);
    if (!rows.length) throw notFound(`Categoria no encontrada con id: ${dto.categoriaId}`);
    return dto.categoriaId;
  }
  // Sin categoria -> usa/crea "Sin categoria" de la sucursal
  if (!dto.sucursalId) throw badRequest('Se requiere sucursalId o categoriaId');
  return ensureSinCategoria(conn, dto.sucursalId);
}

async function ensureSinCategoria(conn, sucursalId) {
  const [rows] = await conn.execute(
    `SELECT id FROM categoria WHERE LOWER(nombre) = LOWER('Sin categoria') AND sucursal_id = ?`,
    [sucursalId]
  );
  if (rows.length) return rows[0].id;
  const [res] = await conn.execute(
    `INSERT INTO categoria (nombre, descripcion, codigo_categoria, sucursal_id, activo)
     VALUES ('Sin categoria', 'Categoria por defecto para productos sin categoria', 'DEFAULT', ?, 1)`,
    [sucursalId]
  );
  return res.insertId;
}

async function syncCodigosBarra(conn, productoId, codigos) {
  if (!codigos) return;
  const limpios = codigos.filter((c) => c && c.trim());
  // Elimina los que ya no estan
  const [existing] = await conn.execute(`SELECT codigo FROM codigo_barra WHERE producto_id = ?`, [productoId]);
  const existingCodes = existing.map((e) => e.codigo);
  for (const code of existingCodes) {
    if (!limpios.includes(code)) {
      await conn.execute(`DELETE FROM codigo_barra WHERE producto_id = ? AND codigo = ?`, [productoId, code]);
    }
  }
  // Inserta los nuevos, validando unicidad global
  for (const codigo of limpios) {
    const [owner] = await conn.execute(
      `SELECT producto_id FROM codigo_barra WHERE codigo = ?`, [codigo]
    );
    if (owner.length && owner[0].producto_id !== productoId) {
      throw badRequest(`El codigo de barras ${codigo} ya esta asignado a otro producto`);
    }
    if (!existingCodes.includes(codigo)) {
      await conn.execute(`INSERT INTO codigo_barra (codigo, producto_id) VALUES (?,?)`, [codigo, productoId]);
    }
  }
}

async function syncProveedores(conn, productoId, proveedorIds) {
  if (!proveedorIds) return;
  await conn.execute(`DELETE FROM producto_proveedor WHERE producto_id = ?`, [productoId]);
  for (const proveedorId of proveedorIds) {
    const [rows] = await conn.execute(`SELECT id FROM proveedor WHERE id = ? AND activo = 1`, [proveedorId]);
    if (!rows.length) throw notFound(`Proveedor no encontrado con id: ${proveedorId}`);
    await conn.execute(
      `INSERT IGNORE INTO producto_proveedor (producto_id, proveedor_id) VALUES (?,?)`,
      [productoId, proveedorId]
    );
  }
}

export const productoService = {
  getAllActive: () => productoRepository.findAllActive(),
  getAllIncludingInactive: () => productoRepository.findAll(),
  getActiveBySucursal: (id) => productoRepository.findActiveBySucursal(id),
  getById: (id) => productoRepository.findByIdActive(id),
  getByCodigoProducto: (codigo) => productoRepository.findByCodigoProductoActive(codigo),

  async create(dto) {
    validateProductoDto(dto);
    return transaction(async (conn) => {
      await assertCodigoProductoUnico(conn, dto.codigoProducto, null);
      const categoriaId = await resolveCategoria(conn, dto);
      const [res] = await conn.execute(
        `INSERT INTO producto (codigo_producto, imagen, nombre, detalle, precio, cantidad_stock, activo, sucursal_id, categoria_id)
         VALUES (?,?,?,?,?,?,1,?,?)`,
        [dto.codigoProducto, dto.imagen ?? null, dto.nombre, dto.detalle ?? null,
         dto.precio, dto.cantidadStock, dto.sucursalId ?? null, categoriaId]
      );
      await syncCodigosBarra(conn, res.insertId, dto.codigosBarra);
      await syncProveedores(conn, res.insertId, dto.proveedorIds);
      return res.insertId;
    }).then((id) => productoRepository.findByIdHydrated(id));
  },

  async update(id, dto) {
    validateProductoDto(dto);
    const existing = await productoRepository.findByIdRaw(id);
    if (!existing) return null;
    await transaction(async (conn) => {
      await assertCodigoProductoUnico(conn, dto.codigoProducto, id);
      const assignments = [];
      const params = [];
      const set = (col, val) => { assignments.push(`${col} = ?`); params.push(val); };
      if (dto.imagen !== undefined) set('imagen', dto.imagen);
      if (dto.nombre !== undefined) set('nombre', dto.nombre);
      if (dto.detalle !== undefined) set('detalle', dto.detalle);
      if (dto.precio !== undefined) set('precio', dto.precio);
      if (dto.cantidadStock !== undefined) set('cantidad_stock', dto.cantidadStock);
      if (dto.sucursalId !== undefined) set('sucursal_id', dto.sucursalId);
      if (dto.categoriaId !== undefined && dto.categoriaId !== null) set('categoria_id', dto.categoriaId);
      if (dto.activo !== undefined && dto.activo !== null) set('activo', dto.activo ? 1 : 0);
      if (dto.codigoProducto !== undefined) set('codigo_producto', dto.codigoProducto);
      if (assignments.length) {
        await conn.execute(`UPDATE producto SET ${assignments.join(', ')} WHERE id = ?`, [...params, id]);
      }
      await syncCodigosBarra(conn, Number(id), dto.codigosBarra);
      await syncProveedores(conn, Number(id), dto.proveedorIds);
    });
    return productoRepository.findByIdHydrated(id);
  },

  async deactivate(id) {
    const existing = await productoRepository.findByIdRaw(id);
    if (!existing) throw notFound(`Producto no encontrado con id: ${id}`);
    await query(`UPDATE producto SET activo = 0 WHERE id = ?`, [id]);
  },

  /** Actualiza stock y precio por codigo de producto dentro de una sucursal. */
  async actualizarMasivo(productos, sucursalId) {
    const actualizados = [];
    const noEncontrados = [];
    for (const dto of productos) {
      if (!dto.codigoProducto || !dto.codigoProducto.trim()) {
        noEncontrados.push('Producto sin codigo de producto');
        continue;
      }
      const producto = await productoRepository.findByCodigoProductoAndSucursal(dto.codigoProducto, sucursalId);
      if (!producto) { noEncontrados.push(dto.codigoProducto); continue; }
      const sets = [];
      const params = [];
      if (dto.precio !== undefined && dto.precio !== null && dto.precio >= 0) { sets.push('precio = ?'); params.push(dto.precio); }
      if (dto.cantidadStock !== undefined && dto.cantidadStock !== null && dto.cantidadStock >= 0) { sets.push('cantidad_stock = ?'); params.push(dto.cantidadStock); }
      if (sets.length) {
        await query(`UPDATE producto SET ${sets.join(', ')} WHERE id = ?`, [...params, producto.id]);
        actualizados.push(dto.codigoProducto);
      }
    }
    return { mensaje: 'Actualizacion completada.', actualizados, noEncontrados };
  },

  /** Crea productos simples (sin categoria/proveedores obligatorios). */
  async crearSimples(productos, sucursalId) {
    const creados = [];
    const errores = [];
    for (const dto of productos) {
      if (!dto.nombre || !dto.codigosBarra || dto.codigosBarra.length === 0 ||
          dto.precio === undefined || dto.precio === null || dto.precio < 0 ||
          dto.cantidadStock === undefined || dto.cantidadStock === null || dto.cantidadStock < 0) {
        errores.push(dto.codigoProducto || 'Producto sin codigo - Datos faltantes o invalidos');
        continue;
      }
      if (!dto.codigoProducto || !dto.codigoProducto.trim()) { errores.push('Codigo de producto es obligatorio'); continue; }
      try {
        await transaction(async (conn) => {
          const [dup] = await conn.execute(`SELECT id FROM producto WHERE codigo_producto = ?`, [dto.codigoProducto]);
          if (dup.length) throw badRequest(`${dto.codigoProducto} - Codigo de producto ya esta asignado`);
          for (const barra of dto.codigosBarra) {
            const [owner] = await conn.execute(`SELECT producto_id FROM codigo_barra WHERE codigo = ?`, [barra]);
            if (owner.length) throw badRequest(`${dto.codigoProducto} - Codigo de barras ${barra} ya esta asignado a otro producto`);
          }
          let categoriaId = dto.categoriaId;
          if (categoriaId) {
            const [cat] = await conn.execute(`SELECT id FROM categoria WHERE id = ? AND activo = 1 AND sucursal_id = ?`, [categoriaId, sucursalId]);
            if (!cat.length) categoriaId = await ensureSinCategoria(conn, sucursalId);
          } else {
            categoriaId = await ensureSinCategoria(conn, sucursalId);
          }
          const [res] = await conn.execute(
            `INSERT INTO producto (codigo_producto, imagen, nombre, detalle, precio, cantidad_stock, activo, sucursal_id, categoria_id)
             VALUES (?,?,?,?,?,?,1,?,?)`,
            [dto.codigoProducto, dto.imagen ?? null, dto.nombre, dto.detalle ?? null, dto.precio, dto.cantidadStock, sucursalId, categoriaId]
          );
          await syncCodigosBarra(conn, res.insertId, dto.codigosBarra);
          await syncProveedores(conn, res.insertId, dto.proveedorIds);
        });
        creados.push(dto.codigoProducto);
      } catch (e) {
        errores.push(dto.codigoProducto ? `${dto.codigoProducto} - ${e.message}` : `Producto sin codigo - ${e.message}`);
      }
    }
    return { mensaje: 'Carga finalizada', creados, errores };
  },
};
