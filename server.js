const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const axios = require('axios');
const crypto = require('crypto');

const app = express();

app.disable('x-powered-by');

app.use(helmet({
    contentSecurityPolicy: false,
    strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: true },
    xFrameOptions: { action: 'deny' },
    xContentTypeOptions: true,
    referrerPolicy: { policy: 'no-referrer' }
}));

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization', 'x-user-role', 'x-user-id'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// URL DE TU WEBHOOK EN MAKE
const WEBHOOK_URL = 'https://hook.us2.make.com/hgg9bij584ausnbbm2nwxd20e211ypsl';

function dispararWebhookMake(tipoEvento, datos) {
    const payload = {
        origen: 'Turismo Inteligente Backend',
        evento: tipoEvento,
        timestamp: new Date().toISOString(),
        ...datos
    };

    console.log(`[DISPARANDO MAKE] Evento: ${tipoEvento}`, JSON.stringify(payload));

    axios.post(WEBHOOK_URL, payload, { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000 
    })
    .then(response => {
        console.log(`[MAKE EXITO] ${tipoEvento} respondido con status:`, response.status);
    })
    .catch(error => {
        console.error(`[MAKE ERROR] Fallo al enviar ${tipoEvento}:`, error.message);
    });
}

// Regex para validación robusta de contraseñas
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

// Inicializar Base de Datos SQLite
const dbPath = path.join(__dirname, 'turismo.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Error al abrir DB', err.message);
    else console.log('Conectado a la Base de Datos SQLite en:', dbPath);
});

// Crear Tablas y Asegurar Columnas de Recuperación
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        rol TEXT NOT NULL,
        reset_token TEXT,
        reset_expires TEXT
    )`, () => {
        // Migración segura por si la tabla ya existía sin estas columnas
        db.run(`ALTER TABLE usuarios ADD COLUMN reset_token TEXT`, () => {});
        db.run(`ALTER TABLE usuarios ADD COLUMN reset_expires TEXT`, () => {});
    });

    db.run(`CREATE TABLE IF NOT EXISTS destinos_turisticos (
        id_destino TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        categoria TEXT,
        capacidad_carga_fisica INT,
        afluencia_actual INT,
        visitantes_semana INT,
        visitantes_mes INT,
        visitantes_ano INT,
        latitud REAL,
        longitud REAL,
        estado TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS hospedajes (
        id_hospedaje INTEGER PRIMARY KEY AUTOINCREMENT,
        id_destino TEXT,
        nombre_hospedaje TEXT NOT NULL,
        tipo TEXT,
        precio_noche TEXT,
        FOREIGN KEY(id_destino) REFERENCES destinos_turisticos(id_destino)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS auditoria_logs (
        id_log INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha_hora TEXT,
        usuario TEXT,
        accion TEXT,
        criticidad TEXT
    )`);

    // Semilla de usuarios por defecto con roles estrictos
    db.get("SELECT COUNT(*) as count FROM usuarios", async (err, row) => {
        if (row && row.count === 0) {
            const passSuperAdmin = await bcrypt.hash('SuperAdmin123*', 10);
            const passAdmin = await bcrypt.hash('Admin123*', 10);
            const passAuditor = await bcrypt.hash('Auditor123*', 10);
            const passTurista = await bcrypt.hash('Turista123*', 10);

            db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)`, ['Super Administrador', 'superadmin@usb.edu.co', passSuperAdmin, 'super_admin']);
            db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)`, ['Carlos Administrador', 'admin@usb.edu.co', passAdmin, 'admin']);
            db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)`, ['Andrea Auditor', 'auditor@usb.edu.co', passAuditor, 'auditor']);
            db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)`, ['Laura Turista', 'turista@gmail.com', passTurista, 'turista']);
        }
    });

    // Semilla de destinos turísticos
    db.get("SELECT COUNT(*) as count FROM destinos_turisticos", (err, row) => {
        if (row && row.count === 0) {
            const destinos = [
                ['col01', 'Cerro de Monserrate', 'Bogotá D.C.: Santuario histórico (Asequible a pie, en funicular o teleférico).', 'historia', 3000, 1800, 25000, 95000, 1150000, 4.6058, -74.0558, 'Moderado'],
                ['col02', 'Piedra del Peñol y Guatapé', 'Antioquia: Monolito gigante (Ideal en carro o moto con parqueaderos económicos).', 'aventura', 2500, 1600, 22000, 88000, 1020000, 6.2244, -75.1606, 'Alerta Moderada'],
                ['col03', 'Parque Nacional Natural El Cocuy', 'Boyacá: Cumbres glaciares (Ruta de montaña para vehículos 4x4 o transporte especializado).', 'aventura', 1000, 300, 4000, 15000, 180000, 6.4719, -72.3161, 'Seguro'],
                ['col04', 'Parque Nacional Natural Tayrona', 'Magdalena: Playas y senderos ecológicos aptos para caminantes.', 'naturaleza', 4000, 2200, 30000, 110000, 1300000, 11.3186, -74.0863, 'Moderado'],
                ['col05', 'Valle del Cocora y Salento', 'Quindío: Recorridos en willys tradicionales, motos o caminatas.', 'naturaleza', 3500, 2100, 28000, 99000, 1200000, 4.6375, -75.5714, 'Seguro'],
                ['col06', 'Cristo Rey y San Antonio', 'Cali: Monumento accesible en moto o vehículo particular.', 'cultura', 1500, 700, 12000, 49000, 580000, 3.4419, -76.5597, 'Seguro']
            ];
            const stmt = db.prepare("INSERT INTO destinos_turisticos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            destinos.forEach(d => stmt.run(d));
            stmt.finalize();

            const hospedajes = [
                ['col01', 'Hotel Centro Colonial Bogotá', 'Hotel', '$95.000'],
                ['col01', 'Hostal Mochilero Candelaria', 'Hostal (Ideal caminantes)', '$45.000'],
                ['col02', 'Bicentenario Hotel Guatapé', 'Hotel Boutique', '$130.000'],
                ['col02', 'Glamping Embalse Guatapé', 'Glamping', '$190.000'],
                ['col03', 'Cabañas Nevado El Cocuy', 'Cabaña', '$110.000'],
                ['col04', 'Tayrona Eco-Camping', 'Camping / Económico', '$55.000'],
                ['col05', 'Finca Hotel Cafetera Salento', 'Finca Tradicional', '$120.000'],
                ['col06', 'Hotel Movich Cali', 'Hotel 4 Estrellas', '$160.000']
            ];
            const stmtH = db.prepare("INSERT INTO hospedajes (id_destino, nombre_hospedaje, tipo, precio_noche) VALUES (?, ?, ?, ?)");
            hospedajes.forEach(h => stmtH.run(h));
            stmtH.finalize();
        }
    });
});

// API: Registro de Usuario
app.post('/api/auth/registro', async (req, res) => {
    const { nombre, email, password } = req.body;
    
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ 
            error: 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un símbolo.' 
        });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)`,
            [nombre, email, passwordHash, 'turista'],
            function(err) {
                if (err) return res.status(400).json({ error: 'El correo ya está registrado.' });
                
                dispararWebhookMake('REGISTRO', { nombre, email, destino: 'N/A (Registro de cuenta)' });
                res.json({ success: true, message: 'Usuario registrado con éxito.' });
            }
        );
    } catch (e) {
        res.status(500).json({ error: 'Error interno en el servidor.' });
    }
});

// API: Inicio de Sesión
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Credenciales inválidas.' });
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Contraseña incorrecta.' });

        dispararWebhookMake('INICIO_SESION', { nombre: user.nombre, email: user.email, destino: 'N/A (Acceso a plataforma)' });
        res.json({ success: true, usuario: { id: user.id_usuario, nombre: user.nombre, email: user.email, rol: user.rol } });
    });
});

// API: Solicitar Recuperación de Contraseña
app.post('/api/auth/recuperar-password', (req, res) => {
    const { email } = req.body;
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], (err, user) => {
        if (err || !user) {
            return res.json({ success: true, message: 'Si el correo está registrado, se han enviado las instrucciones.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 3600000).toISOString();

        db.run(`UPDATE usuarios SET reset_token = ?, reset_expires = ? WHERE email = ?`, [resetToken, resetExpires, email], (errUpdate) => {
            if (errUpdate) {
                console.error("Error SQL al guardar token:", errUpdate.message);
                return res.status(500).json({ error: 'Error al procesar la recuperación.' });
            }

            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.get('host');
            const enlaceUrl = `${protocol}://${host}/reset.html?token=${resetToken}&email=${email}`;

            dispararWebhookMake('RECUPERAR_PASSWORD', { 
                nombre: user.nombre, 
                email: user.email, 
                token: resetToken,
                enlace: enlaceUrl
            });

            res.json({ success: true, message: 'Correo de recuperación enviado exitosamente a través de Make.' });
        });
    });
});

// API: Restablecer Contraseña
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, token, nuevaPassword } = req.body;

    if (!passwordRegex.test(nuevaPassword)) {
        return res.status(400).json({ 
            error: 'La nueva contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un símbolo.' 
        });
    }

    db.get(`SELECT * FROM usuarios WHERE email = ? AND reset_token = ?`, [email, token], async (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'Token inválido o expirado.' });

        if (new Date() > new Date(user.reset_expires)) {
            return res.status(400).json({ error: 'El token ha expirado. Solicite uno nuevo.' });
        }

        try {
            const nuevoHash = await bcrypt.hash(nuevaPassword, 10);
            db.run(`UPDATE usuarios SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE email = ?`, [nuevoHash, email], (errSave) => {
                if (errSave) return res.status(500).json({ error: 'Error al actualizar la contraseña.' });
                
                dispararWebhookMake('CAMBIO_PASSWORD', { nombre: user.nombre, email: user.email, destino: 'Restablecimiento exitoso' });
                res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
            });
        } catch (e) {
            res.status(500).json({ error: 'Error interno.' });
        }
    });
});

// API: Obtener destinos y hospedajes
app.get('/api/destinos', (req, res) => {
    db.all("SELECT * FROM destinos_turisticos", [], (err, destinos) => {
        db.all("SELECT * FROM hospedajes", [], (errH, hospedajes) => {
            const resultado = destinos.map(d => ({
                ...d,
                hospedajes: hospedajes.filter(h => h.id_destino === d.id_destino)
            }));
            res.json(resultado);
        });
    });
});

// API: Planificador de Rutas
app.post('/api/turista/recomendar', (req, res) => {
    const { preferencia, usuarioNombre, usuarioEmail } = req.body;
    db.all("SELECT * FROM destinos_turisticos WHERE categoria = ?", [preferencia], (err, destinos) => {
        const elegido = (destinos && destinos.length > 0) ? destinos[0] : null;
        if (!elegido) return res.status(404).json({ error: 'No hay destinos' });

        db.all("SELECT * FROM hospedajes WHERE id_destino = ?", [elegido.id_destino], (errH, hList) => {
            dispararWebhookMake('PLANIFICACION_RUTA', { nombre: usuarioNombre || 'Turista', email: usuarioEmail || 'N/A', destino: elegido.nombre });
            res.json({ destino: { ...elegido, hospedajes: hList } });
        });
    });
});

// API: Cotizador de Viaje
app.post('/api/turista/cotizar', (req, res) => {
    const { usuarioNombre, usuarioEmail, destinoNombre, personas, dias, modoTransporte } = req.body;
    let costoBaseDiario = 70000; 
    if (modoTransporte === 'Carro') costoBaseDiario = 110000;
    if (modoTransporte === 'Moto') costoBaseDiario = 60000;
    if (modoTransporte === 'A pie') costoBaseDiario = 40000;

    const costoTotal = Number(personas) * Number(dias) * costoBaseDiario;
    
    dispararWebhookMake('COTIZACION_VIAJE', { 
        nombre: usuarioNombre || 'Turista', 
        email: usuarioEmail || 'N/A', 
        destino: `${destinoNombre} (${personas} pers, ${dias} días, Modo: ${modoTransporte || 'Carro'} - Total: $${costoTotal.toLocaleString()} COP)` 
    });

    res.json({ success: true, costoTotal });
});

// API: Actualizar Aforo
app.post('/api/destinos/actualizar', (req, res) => {
    const { id_destino, afluencia_actual, usuarioEmail, rolUsuario } = req.body;
    
    if (rolUsuario !== 'admin' && rolUsuario !== 'super_admin') {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere rol Administrador o Super Administrador.' });
    }

    db.run("UPDATE destinos_turisticos SET afluencia_actual = ? WHERE id_destino = ?", [afluencia_actual, id_destino], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const fechaIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
        db.run("INSERT INTO auditoria_logs (fecha_hora, usuario, accion, criticidad) VALUES (?, ?, ?, ?)",
            [fechaIso, usuarioEmail, `Actualización aforo destino ${id_destino} a ${afluencia_actual}`, 'MEDIA']);
        
        dispararWebhookMake('ACTUALIZACION_AFORO', { nombre: 'Administrador', email: usuarioEmail, destino: `Aforo actualizado destino ID: ${id_destino} a ${afluencia_actual}` });

        res.json({ success: true, message: 'Aforo actualizado y registrado en auditoría.' });
    });
});

// API: Actualizar Precios
app.post('/api/admin/hospedajes/actualizar', (req, res) => {
    const { id_destino, nombre_hospedaje, tipo, precio_noche, rolUsuario, usuarioEmail } = req.body;
    if (rolUsuario !== 'admin' && rolUsuario !== 'super_admin') {
        return res.status(403).json({ error: 'No autorizado para modificar precios.' });
    }

    db.run(`INSERT INTO hospedajes (id_destino, nombre_hospedaje, tipo, precio_noche) VALUES (?, ?, ?, ?)`, 
        [id_destino, nombre_hospedaje, tipo, precio_noche], function(err) {
        if (err) return res.status(500).json({ error: 'Error al agregar precio.' });
        
        const fechaIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
        db.run("INSERT INTO auditoria_logs (fecha_hora, usuario, accion, criticidad) VALUES (?, ?, ?, ?)",
            [fechaIso, usuarioEmail, `Nuevo hospedaje/precio añadido: ${nombre_hospedaje} (${precio_noche})`, 'ALTA']);

        res.json({ success: true, message: 'Precio y hospedaje actualizado correctamente.' });
    });
});

// API: Listar Usuarios
app.get('/api/admin/usuarios', (req, res) => {
    const userRole = req.headers['x-user-role'];
    if (userRole !== 'super_admin') {
        return res.status(403).json({ error: 'Acceso restringido al Super Administrador.' });
    }
    db.all("SELECT id_usuario, nombre, email, rol FROM usuarios", [], (err, usuarios) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(usuarios);
    });
});

// API: Cambiar Rol
app.post('/api/admin/usuarios/rol', (req, res) => {
    const { id_usuario, nuevoRol, rolUsuario, usuarioEmail } = req.body;
    if (rolUsuario !== 'super_admin') {
        return res.status(403).json({ error: 'Solo el Super Administrador puede otorgar o revocar permisos.' });
    }

    db.run(`UPDATE usuarios SET rol = ? WHERE id_usuario = ?`, [nuevoRol, id_usuario], function(err) {
        if (err) return res.status(500).json({ error: 'Error al actualizar permisos.' });

        const fechaIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
        db.run("INSERT INTO auditoria_logs (fecha_hora, usuario, accion, criticidad) VALUES (?, ?, ?, ?)",
            [fechaIso, usuarioEmail, `Modificación de privilegios ID usuario ${id_usuario} a rol: ${nuevoRol}`, 'CRITICA']);

        res.json({ success: true, message: 'Permisos de usuario actualizados correctamente.' });
    });
});

// API: Obtener Logs
app.get('/api/auditoria/logs', (req, res) => {
    const userRole = req.headers['x-user-role'];
    if (userRole !== 'auditor' && userRole !== 'super_admin') {
        return res.status(403).json({ error: 'Acceso restringido. Solo Auditores y Super Administradores.' });
    }
    db.all("SELECT * FROM auditoria_logs ORDER BY id_log DESC LIMIT 50", [], (err, logs) => res.json(logs));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor unificado corriendo en el puerto ${PORT}`));