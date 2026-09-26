-- Ejecutar dentro de db_WebDevUMG. Este script no crea ni cambia la base de datos.

IF OBJECT_ID('dbo.Copart_Usuarios_14827', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Copart_Usuarios_14827 (
        UsuarioID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Nombre NVARCHAR(100) NOT NULL,
        Apellido NVARCHAR(100) NOT NULL,
        Correo NVARCHAR(255) NOT NULL,
        Telefono NVARCHAR(30) NOT NULL,
        PasswordHash NVARCHAR(255) NOT NULL,
        FechaRegistro DATETIME2 NOT NULL CONSTRAINT DF_Copart_Usuarios_14827_FechaRegistro DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Copart_Usuarios_14827_Correo UNIQUE (Correo)
    );
END;

IF OBJECT_ID('dbo.Copart_Vehiculos_14827', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Copart_Vehiculos_14827 (
        VehiculoID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        UsuarioID INT NOT NULL,
        Anio INT NOT NULL,
        TipoArticulo NVARCHAR(80) NOT NULL,
        Marca NVARCHAR(100) NOT NULL,
        Modelo NVARCHAR(100) NOT NULL,
        Motor NVARCHAR(100) NOT NULL,
        Transmision NVARCHAR(100) NOT NULL,
        Combustible NVARCHAR(50) NOT NULL,
        TrenManejo NVARCHAR(10) NOT NULL,
        Cilindros INT NOT NULL,
        NivelDanio NVARCHAR(10) NOT NULL,
        PrecioBase DECIMAL(18,2) NOT NULL,
        FechaInicio DATETIME2 NOT NULL,
        FechaCierre DATETIME2 NOT NULL,
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_Copart_Vehiculos_14827_Estado DEFAULT 'PROGRAMADA',
        FechaRegistro DATETIME2 NOT NULL CONSTRAINT DF_Copart_Vehiculos_14827_FechaRegistro DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Copart_Vehiculos_14827_Usuarios FOREIGN KEY (UsuarioID)
            REFERENCES dbo.Copart_Usuarios_14827(UsuarioID),
        CONSTRAINT CK_Copart_Vehiculos_14827_Anio CHECK (Anio BETWEEN 1900 AND 2100),
        CONSTRAINT CK_Copart_Vehiculos_14827_Tren CHECK (TrenManejo IN ('AWD', 'FWD', 'RWD', '4WD')),
        CONSTRAINT CK_Copart_Vehiculos_14827_Danio CHECK (NivelDanio IN ('VERDE', 'AMARILLO', 'ROJO')),
        CONSTRAINT CK_Copart_Vehiculos_14827_Precio CHECK (PrecioBase > 0),
        CONSTRAINT CK_Copart_Vehiculos_14827_Fechas CHECK (FechaCierre > FechaInicio)
    );
END;

IF OBJECT_ID('dbo.Copart_Fotos_14827', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Copart_Fotos_14827 (
        FotoID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        VehiculoID INT NOT NULL,
        Url NVARCHAR(2048) NOT NULL,
        Orden INT NOT NULL,
        CONSTRAINT FK_Copart_Fotos_14827_Vehiculos FOREIGN KEY (VehiculoID)
            REFERENCES dbo.Copart_Vehiculos_14827(VehiculoID) ON DELETE CASCADE,
        CONSTRAINT UQ_Copart_Fotos_14827_Orden UNIQUE (VehiculoID, Orden)
    );
END;

IF OBJECT_ID('dbo.Copart_Pujas_14827', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Copart_Pujas_14827 (
        PujaID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        VehiculoID INT NOT NULL,
        UsuarioID INT NOT NULL,
        Monto DECIMAL(18,2) NOT NULL,
        FechaPuja DATETIME2 NOT NULL CONSTRAINT DF_Copart_Pujas_14827_FechaPuja DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Copart_Pujas_14827_Vehiculos FOREIGN KEY (VehiculoID)
            REFERENCES dbo.Copart_Vehiculos_14827(VehiculoID),
        CONSTRAINT FK_Copart_Pujas_14827_Usuarios FOREIGN KEY (UsuarioID)
            REFERENCES dbo.Copart_Usuarios_14827(UsuarioID),
        CONSTRAINT CK_Copart_Pujas_14827_Monto CHECK (Monto > 0)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Copart_Vehiculos_14827_Filtros' AND object_id = OBJECT_ID('dbo.Copart_Vehiculos_14827'))
    CREATE INDEX IX_Copart_Vehiculos_14827_Filtros
        ON dbo.Copart_Vehiculos_14827 (Anio, Marca, Modelo, Combustible, NivelDanio);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Copart_Vehiculos_14827_Usuario' AND object_id = OBJECT_ID('dbo.Copart_Vehiculos_14827'))
    CREATE INDEX IX_Copart_Vehiculos_14827_Usuario
        ON dbo.Copart_Vehiculos_14827 (UsuarioID, FechaRegistro DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Copart_Fotos_14827_Vehiculo' AND object_id = OBJECT_ID('dbo.Copart_Fotos_14827'))
    CREATE INDEX IX_Copart_Fotos_14827_Vehiculo
        ON dbo.Copart_Fotos_14827 (VehiculoID, Orden);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Copart_Pujas_14827_Vehiculo_Monto' AND object_id = OBJECT_ID('dbo.Copart_Pujas_14827'))
    CREATE INDEX IX_Copart_Pujas_14827_Vehiculo_Monto
        ON dbo.Copart_Pujas_14827 (VehiculoID, Monto DESC, FechaPuja ASC);
