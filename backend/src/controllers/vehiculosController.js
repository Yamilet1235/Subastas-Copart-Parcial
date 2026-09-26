const { sql, getConnection } = require('../config/database');

const CAMPOS_REQUERIDOS = [
  'anio', 'tipoArticulo', 'marca', 'modelo', 'motor', 'transmision',
  'combustible', 'trenManejo', 'cilindros', 'nivelDanio', 'precioBase',
  'fechaInicio', 'fechaCierre',
];

function validarVehiculo(body) {
  for (const campo of CAMPOS_REQUERIDOS) {
    if (body[campo] === undefined || body[campo] === null || String(body[campo]).trim() === '') {
      return `El campo ${campo} es obligatorio.`;
    }
  }

  const anio = Number(body.anio);
  const cilindros = Number(body.cilindros);
  const precioBase = Number(body.precioBase);
  const inicio = new Date(body.fechaInicio);
  const cierre = new Date(body.fechaCierre);

  if (!Number.isInteger(anio) || anio < 1900 || anio > 2100) return 'El año no es válido.';
  if (!Number.isInteger(cilindros) || cilindros < 1 || cilindros > 24) return 'El número de cilindros no es válido.';
  if (!Number.isFinite(precioBase) || precioBase <= 0) return 'El precio base debe ser mayor que cero.';
  if (!['AWD', 'FWD', 'RWD', '4WD'].includes(body.trenManejo)) return 'El tren de manejo no es válido.';
  if (!['VERDE', 'AMARILLO', 'ROJO'].includes(body.nivelDanio)) return 'El nivel de daño no es válido.';
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(cierre.getTime())) return 'Las fechas no son válidas.';
  if (cierre <= inicio) return 'La fecha de cierre debe ser posterior a la fecha de inicio.';
  if (cierre <= new Date()) return 'La fecha de cierre debe estar en el futuro.';
  if (!Array.isArray(body.fotos) || body.fotos.length < 5) return 'Debes agregar al menos 5 fotografías.';

  for (const foto of body.fotos) {
    try {
      const url = new URL(String(foto));
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Protocolo inválido');
    } catch (error) {
      return 'Todas las fotografías deben ser URLs HTTP o HTTPS válidas.';
    }
  }
  return null;
}

function estadoSql() {
  return `CASE
    WHEN SYSUTCDATETIME() < v.FechaInicio THEN 'PROGRAMADA'
    WHEN SYSUTCDATETIME() >= v.FechaCierre AND actual.Monto IS NULL THEN 'DESIERTA'
    WHEN SYSUTCDATETIME() >= v.FechaCierre THEN 'FINALIZADA'
    ELSE 'ACTIVA'
  END`;
}

function consultaListado(whereSql = '') {
  return `
    SELECT
      v.VehiculoID AS id, v.Anio AS anio, v.TipoArticulo AS tipoArticulo,
      v.Marca AS marca, v.Modelo AS modelo, v.Motor AS motor,
      v.Transmision AS transmision, v.Combustible AS combustible,
      v.TrenManejo AS trenManejo, v.Cilindros AS cilindros,
      v.NivelDanio AS nivelDanio, v.PrecioBase AS precioBase,
      v.FechaInicio AS fechaInicio, v.FechaCierre AS fechaCierre,
      ${estadoSql()} AS estado,
      foto.Url AS fotoPrincipal, actual.Monto AS pujaActual
    FROM dbo.Copart_Vehiculos_14827 v
    OUTER APPLY (
      SELECT TOP 1 f.Url FROM dbo.Copart_Fotos_14827 f
      WHERE f.VehiculoID = v.VehiculoID ORDER BY f.Orden
    ) foto
    OUTER APPLY (
      SELECT TOP 1 p.Monto FROM dbo.Copart_Pujas_14827 p
      WHERE p.VehiculoID = v.VehiculoID ORDER BY p.Monto DESC, p.FechaPuja ASC
    ) actual
    ${whereSql}
    ORDER BY v.FechaRegistro DESC
  `;
}

function agregarDatosVehiculo(request, body) {
  return request
    .input('Anio', sql.Int, Number(body.anio))
    .input('TipoArticulo', sql.NVarChar(80), String(body.tipoArticulo).trim())
    .input('Marca', sql.NVarChar(100), String(body.marca).trim())
    .input('Modelo', sql.NVarChar(100), String(body.modelo).trim())
    .input('Motor', sql.NVarChar(100), String(body.motor).trim())
    .input('Transmision', sql.NVarChar(100), String(body.transmision).trim())
    .input('Combustible', sql.NVarChar(50), String(body.combustible).trim())
    .input('TrenManejo', sql.NVarChar(10), body.trenManejo)
    .input('Cilindros', sql.Int, Number(body.cilindros))
    .input('NivelDanio', sql.NVarChar(10), body.nivelDanio)
    .input('PrecioBase', sql.Decimal(18, 2), Number(body.precioBase))
    .input('FechaInicio', sql.DateTime2, new Date(body.fechaInicio))
    .input('FechaCierre', sql.DateTime2, new Date(body.fechaCierre));
}

async function insertarFotos(transaction, vehiculoId, fotos) {
  for (let index = 0; index < fotos.length; index += 1) {
    await new sql.Request(transaction)
      .input('VehiculoID', sql.Int, vehiculoId)
      .input('Url', sql.NVarChar(2048), String(fotos[index]).trim())
      .input('Orden', sql.Int, index + 1)
      .query(`
        INSERT INTO dbo.Copart_Fotos_14827 (VehiculoID, Url, Orden)
        VALUES (@VehiculoID, @Url, @Orden)
      `);
  }
}

async function listar(req, res) {
  try {
    const pool = await getConnection();
    const request = pool.request();
    const condiciones = [];
    const { anio, marca, modelo, combustible, danio } = req.query;

    if (anio) {
      if (!Number.isInteger(Number(anio))) return res.status(400).json({ mensaje: 'El filtro año no es válido.' });
      request.input('Anio', sql.Int, Number(anio));
      condiciones.push('v.Anio = @Anio');
    }
    if (marca) {
      request.input('Marca', sql.NVarChar(102), `%${String(marca).trim()}%`);
      condiciones.push('v.Marca LIKE @Marca');
    }
    if (modelo) {
      request.input('Modelo', sql.NVarChar(102), `%${String(modelo).trim()}%`);
      condiciones.push('v.Modelo LIKE @Modelo');
    }
    if (combustible) {
      request.input('Combustible', sql.NVarChar(50), String(combustible).trim());
      condiciones.push('v.Combustible = @Combustible');
    }
    if (danio) {
      request.input('Danio', sql.NVarChar(10), String(danio).trim().toUpperCase());
      condiciones.push('v.NivelDanio = @Danio');
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const resultado = await request.query(consultaListado(where));
    return res.json(resultado.recordset);
  } catch (error) {
    console.error('Error al listar vehículos:', error.message);
    return res.status(500).json({ mensaje: 'No se pudo cargar el inventario.' });
  }
}

async function obtenerDetalle(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ mensaje: 'ID de vehículo no válido.' });

  try {
    const pool = await getConnection();
    const resultado = await pool.request()
      .input('VehiculoID', sql.Int, id)
      .query(`
        SELECT
          v.VehiculoID AS id, v.UsuarioID AS propietarioId, v.Anio AS anio,
          v.TipoArticulo AS tipoArticulo, v.Marca AS marca, v.Modelo AS modelo,
          v.Motor AS motor, v.Transmision AS transmision, v.Combustible AS combustible,
          v.TrenManejo AS trenManejo, v.Cilindros AS cilindros,
          v.NivelDanio AS nivelDanio, v.PrecioBase AS precioBase,
          v.FechaInicio AS fechaInicio, v.FechaCierre AS fechaCierre,
          ${estadoSql()} AS estado, actual.Monto AS pujaActual,
          actual.UsuarioID AS liderUsuarioId
        FROM dbo.Copart_Vehiculos_14827 v
        OUTER APPLY (
          SELECT TOP 1 p.Monto, p.UsuarioID FROM dbo.Copart_Pujas_14827 p
          WHERE p.VehiculoID = v.VehiculoID ORDER BY p.Monto DESC, p.FechaPuja ASC
        ) actual
        WHERE v.VehiculoID = @VehiculoID
      `);

    if (!resultado.recordset.length) return res.status(404).json({ mensaje: 'Vehículo no encontrado.' });

    const fotos = await pool.request()
      .input('VehiculoID', sql.Int, id)
      .query(`
        SELECT Url AS url, Orden AS orden FROM dbo.Copart_Fotos_14827
        WHERE VehiculoID = @VehiculoID ORDER BY Orden
      `);

    const vehiculo = resultado.recordset[0];
    vehiculo.esPropietario = Boolean(req.usuario && req.usuario.id === vehiculo.propietarioId);
    vehiculo.miOfertaEsLider = Boolean(req.usuario && req.usuario.id === vehiculo.liderUsuarioId);
    delete vehiculo.liderUsuarioId;
    delete vehiculo.propietarioId;
    vehiculo.fotos = fotos.recordset.map((foto) => foto.url);
    return res.json(vehiculo);
  } catch (error) {
    console.error('Error al obtener vehículo:', error.message);
    return res.status(500).json({ mensaje: 'No se pudo cargar el vehículo.' });
  }
}

async function listarMios(req, res) {
  try {
    const pool = await getConnection();
    const resultado = await pool.request()
      .input('UsuarioID', sql.Int, req.usuario.id)
      .query(consultaListado('WHERE v.UsuarioID = @UsuarioID'));
    return res.json(resultado.recordset);
  } catch (error) {
    console.error('Error al listar publicaciones:', error.message);
    return res.status(500).json({ mensaje: 'No se pudieron cargar tus publicaciones.' });
  }
}

async function crear(req, res) {
  const body = req.body || {};
  const errorValidacion = validarVehiculo(body);
  if (errorValidacion) return res.status(400).json({ mensaje: errorValidacion });

  let transaction;
  try {
    const pool = await getConnection();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const estado = new Date(body.fechaInicio) > new Date() ? 'PROGRAMADA' : 'ACTIVA';
    const request = agregarDatosVehiculo(new sql.Request(transaction), body)
      .input('UsuarioID', sql.Int, req.usuario.id)
      .input('Estado', sql.NVarChar(20), estado);
    const resultado = await request.query(`
      INSERT INTO dbo.Copart_Vehiculos_14827 (
        UsuarioID, Anio, TipoArticulo, Marca, Modelo, Motor, Transmision,
        Combustible, TrenManejo, Cilindros, NivelDanio, PrecioBase,
        FechaInicio, FechaCierre, Estado
      )
      OUTPUT INSERTED.VehiculoID
      VALUES (
        @UsuarioID, @Anio, @TipoArticulo, @Marca, @Modelo, @Motor, @Transmision,
        @Combustible, @TrenManejo, @Cilindros, @NivelDanio, @PrecioBase,
        @FechaInicio, @FechaCierre, @Estado
      )
    `);
    const vehiculoId = resultado.recordset[0].VehiculoID;
    await insertarFotos(transaction, vehiculoId, body.fotos);
    await transaction.commit();
    return res.status(201).json({ mensaje: 'Vehículo publicado correctamente.', id: vehiculoId });
  } catch (error) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('Error al crear vehículo:', error.message);
    return res.status(500).json({ mensaje: 'No se pudo publicar el vehículo.' });
  }
}

async function editar(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ mensaje: 'ID de vehículo no válido.' });
  const body = req.body || {};
  const errorValidacion = validarVehiculo(body);
  if (errorValidacion) return res.status(400).json({ mensaje: errorValidacion });

  let transaction;
  try {
    const pool = await getConnection();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const actual = await new sql.Request(transaction)
      .input('VehiculoID', sql.Int, id)
      .query('SELECT UsuarioID FROM dbo.Copart_Vehiculos_14827 WITH (UPDLOCK) WHERE VehiculoID = @VehiculoID');

    if (!actual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ mensaje: 'Vehículo no encontrado.' });
    }
    if (actual.recordset[0].UsuarioID !== req.usuario.id) {
      await transaction.rollback();
      return res.status(403).json({ mensaje: 'No puedes editar una publicación de otro usuario.' });
    }

    const estado = new Date(body.fechaInicio) > new Date() ? 'PROGRAMADA' : 'ACTIVA';
    const request = agregarDatosVehiculo(new sql.Request(transaction), body)
      .input('VehiculoID', sql.Int, id)
      .input('Estado', sql.NVarChar(20), estado);
    await request.query(`
      UPDATE dbo.Copart_Vehiculos_14827 SET
        Anio = @Anio, TipoArticulo = @TipoArticulo, Marca = @Marca,
        Modelo = @Modelo, Motor = @Motor, Transmision = @Transmision,
        Combustible = @Combustible, TrenManejo = @TrenManejo,
        Cilindros = @Cilindros, NivelDanio = @NivelDanio,
        PrecioBase = @PrecioBase, FechaInicio = @FechaInicio,
        FechaCierre = @FechaCierre, Estado = @Estado
      WHERE VehiculoID = @VehiculoID
    `);
    await new sql.Request(transaction)
      .input('VehiculoID', sql.Int, id)
      .query('DELETE FROM dbo.Copart_Fotos_14827 WHERE VehiculoID = @VehiculoID');
    await insertarFotos(transaction, id, body.fotos);
    await transaction.commit();
    return res.json({ mensaje: 'Publicación actualizada correctamente.', id });
  } catch (error) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('Error al editar vehículo:', error.message);
    return res.status(500).json({ mensaje: 'No se pudo actualizar la publicación.' });
  }
}

module.exports = { listar, obtenerDetalle, listarMios, crear, editar };
