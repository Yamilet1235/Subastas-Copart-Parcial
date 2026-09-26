const { sql, getConnection } = require('../config/database');

async function listarPujas(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ mensaje: 'ID de vehículo no válido.' });

  try {
    const pool = await getConnection();
    const vehiculo = await pool.request()
      .input('VehiculoID', sql.Int, id)
      .query('SELECT VehiculoID FROM dbo.Copart_Vehiculos_14827 WHERE VehiculoID = @VehiculoID');
    if (!vehiculo.recordset.length) return res.status(404).json({ mensaje: 'Vehículo no encontrado.' });

    const resultado = await pool.request()
      .input('VehiculoID', sql.Int, id)
      .query(`
        SELECT Monto AS monto, FechaPuja AS fecha
        FROM dbo.Copart_Pujas_14827
        WHERE VehiculoID = @VehiculoID
        ORDER BY Monto DESC, FechaPuja ASC
      `);
    return res.json(resultado.recordset);
  } catch (error) {
    console.error('Error al listar pujas:', error.message);
    return res.status(500).json({ mensaje: 'No se pudieron cargar las pujas.' });
  }
}

async function crearPuja(req, res) {
  const vehiculoId = Number(req.params.id);
  const monto = Number((req.body || {}).monto);
  if (!Number.isInteger(vehiculoId)) return res.status(400).json({ mensaje: 'ID de vehículo no válido.' });
  if (!Number.isFinite(monto) || monto <= 0) return res.status(400).json({ mensaje: 'El monto de la puja no es válido.' });

  let transaction;
  try {
    const pool = await getConnection();
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const resultado = await new sql.Request(transaction)
      .input('VehiculoID', sql.Int, vehiculoId)
      .query(`
        SELECT v.UsuarioID AS PropietarioID, v.PrecioBase, v.FechaInicio, v.FechaCierre, SYSUTCDATETIME() AS Ahora,
          actual.Monto AS PujaActual, actual.UsuarioID AS LiderUsuarioID
        FROM dbo.Copart_Vehiculos_14827 v WITH (UPDLOCK, HOLDLOCK)
        OUTER APPLY (
          SELECT TOP 1 p.Monto, p.UsuarioID
          FROM dbo.Copart_Pujas_14827 p WITH (UPDLOCK, HOLDLOCK)
          WHERE p.VehiculoID = v.VehiculoID
          ORDER BY p.Monto DESC, p.FechaPuja ASC
        ) actual
        WHERE v.VehiculoID = @VehiculoID
      `);

    if (!resultado.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ mensaje: 'Vehículo no encontrado.' });
    }

    const subasta = resultado.recordset[0];
    const ahora = new Date(subasta.Ahora);
    if (subasta.PropietarioID === req.usuario.id) {
      await transaction.rollback();
      return res.status(403).json({ mensaje: 'No puedes pujar por tu propio vehículo.' });
    }
    if (ahora < new Date(subasta.FechaInicio)) {
      await transaction.rollback();
      return res.status(400).json({ mensaje: 'La subasta todavía no ha iniciado.' });
    }
    if (ahora >= new Date(subasta.FechaCierre)) {
      await transaction.rollback();
      return res.status(400).json({ mensaje: 'La subasta está cerrada.' });
    }

    const montoCentavos = Math.round(monto * 100);
    const baseCentavos = Math.round(Number(subasta.PrecioBase) * 100);
    if (subasta.PujaActual === null && montoCentavos <= baseCentavos) {
      await transaction.rollback();
      return res.status(400).json({ mensaje: 'La primera oferta debe ser mayor al precio base.' });
    }

    if (subasta.PujaActual !== null) {
      const actualCentavos = Math.round(Number(subasta.PujaActual) * 100);
      const minimoCentavos = Math.ceil((actualCentavos * 110) / 100);
      if (montoCentavos < minimoCentavos) {
        await transaction.rollback();
        return res.status(400).json({
          mensaje: `La oferta mínima es ${(minimoCentavos / 100).toFixed(2)}.`,
          minimo: minimoCentavos / 100,
        });
      }
    }

    const insercion = await new sql.Request(transaction)
      .input('VehiculoID', sql.Int, vehiculoId)
      .input('UsuarioID', sql.Int, req.usuario.id)
      .input('Monto', sql.Decimal(18, 2), montoCentavos / 100)
      .query(`
        INSERT INTO dbo.Copart_Pujas_14827 (VehiculoID, UsuarioID, Monto)
        OUTPUT INSERTED.Monto, INSERTED.FechaPuja
        VALUES (@VehiculoID, @UsuarioID, @Monto)
      `);
    await transaction.commit();

    const puja = insercion.recordset[0];
    transaction = null;
    const evento = {
      vehicleId: vehiculoId,
      montoActual: Number(puja.Monto),
      fecha: puja.FechaPuja,
      indicador: 'NUEVA_PUJA',
    };
    try {
      const io = req.app.get('io');
      io.emit('puja-actualizada', evento);
      io.to(`usuario:${req.usuario.id}`).emit('estado-puja', { vehicleId: vehiculoId, indicador: 'GANANDO' });
      if (subasta.LiderUsuarioID && subasta.LiderUsuarioID !== req.usuario.id) {
        io.to(`usuario:${subasta.LiderUsuarioID}`).emit('estado-puja', { vehicleId: vehiculoId, indicador: 'SUPERADA' });
      }
    } catch (socketError) {
      console.error('La puja se guardó, pero no se pudo notificar:', socketError.message);
    }

    return res.status(201).json({ ...evento, esLider: true });
  } catch (error) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('Error al registrar puja:', error.message);
    return res.status(500).json({ mensaje: 'No se pudo registrar la puja.' });
  }
}

module.exports = { listarPujas, crearPuja };
