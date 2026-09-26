const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { sql, getConnection } = require('../src/config/database');

const usuarios = [
  { nombre: 'Andrea', apellido: 'López', correo: 'usuario1@copart.test', telefono: '5555-0101' },
  { nombre: 'Carlos', apellido: 'Méndez', correo: 'usuario2@copart.test', telefono: '5555-0102' },
  { nombre: 'Sofía', apellido: 'Ramírez', correo: 'usuario3@copart.test', telefono: '5555-0103' },
];

const fotos = [
  'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1200&q=80',
];

const vehiculos = [
  { usuario: 0, anio: 2022, tipo: 'SUV', marca: 'Toyota', modelo: 'RAV4 XLE', motor: '2.5L', transmision: 'Automática', combustible: 'Gasolina', tren: 'AWD', cilindros: 4, danio: 'VERDE', precio: 18500, fotoInicio: 0 },
  { usuario: 1, anio: 2021, tipo: 'Automóvil', marca: 'BMW', modelo: '330i', motor: '2.0L Turbo', transmision: 'Automática', combustible: 'Gasolina', tren: 'RWD', cilindros: 4, danio: 'AMARILLO', precio: 14200, fotoInicio: 2 },
  { usuario: 2, anio: 2023, tipo: 'Pickup', marca: 'Ford', modelo: 'F-150', motor: '5.0L V8', transmision: 'Automática', combustible: 'Gasolina', tren: '4WD', cilindros: 8, danio: 'ROJO', precio: 21000, fotoInicio: 1 },
];

async function ejecutarSeed() {
  let pool;
  let transaction;
  try {
    pool = await getConnection();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const passwordHash = await bcrypt.hash('Prueba123!', 10);
    const ids = [];

    for (const usuario of usuarios) {
      const resultado = await new sql.Request(transaction)
        .input('Nombre', sql.NVarChar(100), usuario.nombre)
        .input('Apellido', sql.NVarChar(100), usuario.apellido)
        .input('Correo', sql.NVarChar(255), usuario.correo)
        .input('Telefono', sql.NVarChar(30), usuario.telefono)
        .input('PasswordHash', sql.NVarChar(255), passwordHash)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.Copart_Usuarios_14827 WHERE Correo = @Correo)
          BEGIN
            UPDATE dbo.Copart_Usuarios_14827 SET Nombre = @Nombre, Apellido = @Apellido,
              Telefono = @Telefono, PasswordHash = @PasswordHash
            WHERE Correo = @Correo;
            SELECT UsuarioID FROM dbo.Copart_Usuarios_14827 WHERE Correo = @Correo;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.Copart_Usuarios_14827 (Nombre, Apellido, Correo, Telefono, PasswordHash)
            OUTPUT INSERTED.UsuarioID
            VALUES (@Nombre, @Apellido, @Correo, @Telefono, @PasswordHash);
          END
        `);
      ids.push(resultado.recordset[0].UsuarioID);
    }

    for (const vehiculo of vehiculos) {
      const inicio = new Date(Date.now() - 30 * 60 * 1000);
      const cierre = new Date(Date.now() + (3 + vehiculo.usuario) * 24 * 60 * 60 * 1000);
      const existente = await new sql.Request(transaction)
        .input('UsuarioID', sql.Int, ids[vehiculo.usuario])
        .input('Marca', sql.NVarChar(100), vehiculo.marca)
        .input('Modelo', sql.NVarChar(100), vehiculo.modelo)
        .query(`
          SELECT VehiculoID FROM dbo.Copart_Vehiculos_14827
          WHERE UsuarioID = @UsuarioID AND Marca = @Marca AND Modelo = @Modelo
        `);
      let vehiculoId;
      if (existente.recordset.length) {
        vehiculoId = existente.recordset[0].VehiculoID;
        await new sql.Request(transaction)
          .input('VehiculoID', sql.Int, vehiculoId)
          .input('FechaInicio', sql.DateTime2, inicio)
          .input('FechaCierre', sql.DateTime2, cierre)
          .query(`
            UPDATE dbo.Copart_Vehiculos_14827
            SET FechaInicio = @FechaInicio, FechaCierre = @FechaCierre, Estado = 'ACTIVA'
            WHERE VehiculoID = @VehiculoID;
            DELETE FROM dbo.Copart_Fotos_14827 WHERE VehiculoID = @VehiculoID;
          `);
      } else {
        const insercion = await new sql.Request(transaction)
          .input('UsuarioID', sql.Int, ids[vehiculo.usuario])
          .input('Anio', sql.Int, vehiculo.anio)
          .input('TipoArticulo', sql.NVarChar(80), vehiculo.tipo)
          .input('Marca', sql.NVarChar(100), vehiculo.marca)
          .input('Modelo', sql.NVarChar(100), vehiculo.modelo)
          .input('Motor', sql.NVarChar(100), vehiculo.motor)
          .input('Transmision', sql.NVarChar(100), vehiculo.transmision)
          .input('Combustible', sql.NVarChar(50), vehiculo.combustible)
          .input('TrenManejo', sql.NVarChar(10), vehiculo.tren)
          .input('Cilindros', sql.Int, vehiculo.cilindros)
          .input('NivelDanio', sql.NVarChar(10), vehiculo.danio)
          .input('PrecioBase', sql.Decimal(18, 2), vehiculo.precio)
          .input('FechaInicio', sql.DateTime2, inicio)
          .input('FechaCierre', sql.DateTime2, cierre)
          .query(`
            INSERT INTO dbo.Copart_Vehiculos_14827 (
              UsuarioID, Anio, TipoArticulo, Marca, Modelo, Motor, Transmision,
              Combustible, TrenManejo, Cilindros, NivelDanio, PrecioBase,
              FechaInicio, FechaCierre, Estado
            )
            OUTPUT INSERTED.VehiculoID
            VALUES (
              @UsuarioID, @Anio, @TipoArticulo, @Marca, @Modelo, @Motor, @Transmision,
              @Combustible, @TrenManejo, @Cilindros, @NivelDanio, @PrecioBase,
              @FechaInicio, @FechaCierre, 'ACTIVA'
            )
          `);
        vehiculoId = insercion.recordset[0].VehiculoID;
      }

      for (let orden = 0; orden < 5; orden += 1) {
        const url = fotos[(vehiculo.fotoInicio + orden) % fotos.length];
        await new sql.Request(transaction)
          .input('VehiculoID', sql.Int, vehiculoId)
          .input('Url', sql.NVarChar(2048), url)
          .input('Orden', sql.Int, orden + 1)
          .query('INSERT INTO dbo.Copart_Fotos_14827 (VehiculoID, Url, Orden) VALUES (@VehiculoID, @Url, @Orden)');
      }
    }

    await transaction.commit();
    console.log('Seed completado: 3 usuarios y vehículos de demostración disponibles.');
  } catch (error) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('No se pudo ejecutar el seed:', error.message);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.close();
  }
}

ejecutarSeed();
