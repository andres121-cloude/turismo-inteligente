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

    axios.post(WEBHOOK_URL, payload, { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000 
    })
    .catch(error => {
        console.error(`[MAKE ERROR] Fallo al enviar ${tipoEvento}:`, error.message);
    });
}

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

const dbPath = path.join(__dirname, 'turismo.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Error al abrir DB', err.message);
    else console.log('Conectado a la Base de Datos SQLite en:', dbPath);
});

db.serialize(async () => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        rol TEXT NOT NULL,
        estado_aprobacion TEXT DEFAULT 'aprobado',
        intentos_fallidos INTEGER DEFAULT 0,
        bloqueado_hasta TEXT,
        reset_token TEXT,
        reset_expires TEXT
    )`, () => {
        db.run(`ALTER TABLE usuarios ADD COLUMN intentos_fallidos INTEGER DEFAULT 0`, () => {});
        db.run(`ALTER TABLE usuarios ADD COLUMN bloqueado_hasta TEXT`, () => {});
        db.run(`ALTER TABLE usuarios ADD COLUMN reset_token TEXT`, () => {});
        db.run(`ALTER TABLE usuarios ADD COLUMN reset_expires TEXT`, () => {});
        db.run(`ALTER TABLE usuarios ADD COLUMN estado_aprobacion TEXT DEFAULT 'aprobado'`, () => {});
    });

    db.run(`CREATE TABLE IF NOT EXISTS roles_personalizados (
        id_rol INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre_rol TEXT UNIQUE NOT NULL,
        permisos TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS usuario_roles (
        id_usuario INTEGER,
        id_rol INTEGER,
        FOREIGN KEY(id_usuario) REFERENCES usuarios(id_usuario),
        FOREIGN KEY(id_rol) REFERENCES roles_personalizados(id_rol)
    )`);

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

    db.run("DELETE FROM usuarios", async () => {
        try {
            const passSuperAdmin = await bcrypt.hash('Buitre1022@', 10);
            const passAdmin = await bcrypt.hash('1022326534', 10);
            const passAuditor = await bcrypt.hash('1022326534', 10);

            db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol, estado_aprobacion) VALUES (?, ?, ?, ?, ?)`, 
                ['Andrés SuperAdmin', 'buitragoandres702@gmail.com', passSuperAdmin, 'super_admin', 'aprobado']);
            
            db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol, estado_aprobacion) VALUES (?, ?, ?, ?, ?)`, 
                ['Andrés Felipe Admin', 'andresfelipebuitragoquintero@gmail.com', passAdmin, 'admin', 'aprobado']);
            
            db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol, estado_aprobacion) VALUES (?, ?, ?, ?, ?)`, 
                ['Pepito Auditor', 'pepitosaludos717@gmail.com', passAuditor, 'auditor', 'aprobado']);
        } catch (e) {
            console.error("Error al cifrar cuentas por defecto", e);
        }
    });

    db.get("SELECT COUNT(*) as count FROM destinos_turisticos", (err, row) => {
        if (row && row.count === 0) {
            const destinos = [
                ['col01', 'Cerro de Monserrate', 'Bogotá D.C.: Santuario histórico y mirador panorámico.', 'historia', 3000, 1800, 25000, 95000, 1150000, 4.6058, -74.0558, 'Moderado'],
                ['col02', 'Piedra del Peñol y Guatapé', 'Antioquia: Monolito gigante y embalse turístico.', 'aventura', 2500, 1600, 22000, 88000, 1020000, 6.2244, -75.1606, 'Alerta Moderada'],
                ['col03', 'Parque Nacional Natural El Cocuy', 'Boyacá: Cumbres glaciares y alta montaña.', 'aventura', 1000, 300, 4000, 15000, 180000, 6.4719, -72.3161, 'Seguro'],
                ['col04', 'Parque Nacional Natural Tayrona', 'Magdalena: Playas paradisíacas y selva tropical.', 'naturaleza', 4000, 2200, 30000, 110000, 1300000, 11.3186, -74.0863, 'Moderado'],
                ['col05', 'Valle del Cocora y Salento', 'Quindío: Palmas de cera gigantes y arquitectura cafetera.', 'naturaleza', 3500, 2100, 28000, 99000, 1200000, 4.6375, -75.5714, 'Seguro'],
                ['col06', 'Cristo Rey y San Antonio', 'Cali: Monumento emblemático y barrio tradicional.', 'cultura', 1500, 700, 12000, 49000, 580000, 3.4419, -76.5597, 'Seguro']
            ];
            const stmt = db.prepare("INSERT INTO destinos_turisticos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            destinos.forEach(d => stmt.run(d));
            stmt.finalize();

            const hospedajes = [
                ['col01', 'Hostal Zona Rosa Backpackers', 'Hostal Económico', '$45.000'],
                ['col01', 'Hotel Continental Bogotá', 'Hotel Tradicional', '$110.000'],
                ['col02', 'Bicentenario Hotel Guatapé', 'Hotel Boutique', '$140.000'],
                ['col02', 'Camping & Glamping El Peñol', 'Glamping / Moto-friendly', '$85.000'],
                ['col03', 'Cabañas Andinas El Cocuy', 'Cabaña Rural', '$120.000'],
                ['col04', 'Tayrona Eco-Camping', 'Zona de Camping', '$50.000'],
                ['col04', 'Senda Watakake Tayrona', 'Eco-Hotel', '$190.000'],
                ['col05', 'Finca Hotel Cafetera Salento', 'Finca Tradicional', '$115.000'],
                ['col05', 'Hostal Los Girasoles Salento', 'Hostal', '$40.000'],
                ['col06', 'Hotel Movich Intercontinental Cali', 'Hotel 4 Estrellas', '$160.000']
            ];
            const stmtH = db.prepare("INSERT INTO hospedajes (id_destino, nombre_hospedaje, tipo, precio_noche) VALUES (?, ?, ?, ?)");
            hospedajes.forEach(h => stmtH.run(h));
            stmtH.finalize();
        }
    });
});

app.post('/api/auth/registro', async (req, res) => {
    const { nombre, email, password, rolSolicitado } = req.body;
    
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], async (err, existingUser) => {
        if (existingUser) {
            return res.status(400).json({ error: 'El correo electrónico ya se encuentra registrado en el sistema.' });
        }

        if (!passwordRegex.test(password)) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un símbolo.' });
        }

        const rolFinal = (rolSolicitado === 'admin') ? 'admin' : 'turista';
        const estado = (rolFinal === 'admin') ? 'pendiente' : 'aprobado';

        try {
            const passwordHash = await bcrypt.hash(password, 10);
            db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol, estado_aprobacion) VALUES (?, ?, ?, ?, ?)`,
                [nombre, email, passwordHash, rolFinal, estado],
                function(err) {
                    if (err) return res.status(400).json({ error: 'Error al registrar el usuario.' });
                    
                    const fechaIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
                    db.run("INSERT INTO auditoria_logs (fecha_hora, usuario, accion, criticidad) VALUES (?, ?, ?, ?)",
                        [fechaIso, email, `Registro de nuevo usuario con rol: ${rolFinal}`, 'BAJA']);

                    if (rolFinal === 'admin') {
                        dispararWebhookMake('SOLICITUD_ADMIN', { 
                            nombre, 
                            email, 
                            destino: 'Solicitud de cuenta Administrador pendiente de aprobación por el Super Administrador' 
                        });
                        return res.json({ success: true, message: 'Registro de administrador exitoso. Requiere aprobación del Super Administrador.' });
                    }

                    dispararWebhookMake('REGISTRO', { nombre, email, destino: 'N/A (Registro de cuenta)' });
                    res.json({ success: true, message: 'Usuario registrado con éxito.' });
                }
            );
        } catch (e) {
            res.status(500).json({ error: 'Error interno en el servidor.' });
        }
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Credenciales inválidas o usuario no encontrado.' });
        }

        if (user.bloqueado_hasta && new Date() < new Date(user.bloqueado_hasta)) {
            return res.status(403).json({ error: 'La cuenta se encuentra bloqueada temporalmente por 5 intentos fallidos consecutivos.' });
        }

        if (user.estado_aprobacion === 'pendiente') {
            return res.status(403).json({ error: 'Su cuenta de administrador está pendiente de aprobación.' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            const nuevosIntentos = (user.intentos_fallidos || 0) + 1;
            let bloqueoTiempo = null;

            if (nuevosIntentos >= 5) {
                bloqueoTiempo = new Date(Date.now() + 15 * 60000).toISOString();
            }

            db.run(`UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id_usuario = ?`, 
                [nuevosIntentos, bloqueoTiempo, user.id_usuario]);

            const fechaIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
            db.run("INSERT INTO auditoria_logs (fecha_hora, usuario, accion, criticidad) VALUES (?, ?, ?, ?)",
                [fechaIso, email, `Intento fallido de inicio de sesión (#${nuevosIntentos})`, 'MEDIA']);

            return res.status(401).json({ error: `Contraseña incorrecta. Intentos fallidos: ${nuevosIntentos}/5.` });
        }

        db.run(`UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = ?`, [user.id_usuario]);

        const fechaIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
        db.run("INSERT INTO auditoria_logs (fecha_hora, usuario, accion, criticidad) VALUES (?, ?, ?, ?)",
            [fechaIso, email, 'Inicio de sesión exitoso', 'BAJA']);

        dispararWebhookMake('INICIO_SESION', { nombre: user.nombre, email: user.email, destino: 'N/A (Acceso a plataforma)' });
        res.json({ success: true, usuario: { id: user.id_usuario, nombre: user.nombre, email: user.email, rol: user.rol } });
    });
});

app.post('/api/auth/recuperar-password', (req, res) => {
    const { email } = req.body;
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], (err, user) => {
        if (err || !user) {
            return res.json({ success: true, message: 'Si el correo está registrado, se han enviado las instrucciones.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 3600000).toISOString();

        db.run(`UPDATE usuarios SET reset_token = ?, reset_expires = ? WHERE email = ?`, [resetToken, resetExpires, email], (errUpdate) => {
            if (errUpdate) return res.status(500).json({ error: 'Error al procesar la recuperación.' });

            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.get('host');
            const enlaceUrl = `${protocol}://${host}/reset.html?token=${resetToken}&email=${email}`;

            const fechaIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
            db.run("INSERT INTO auditoria_logs (fecha_hora, usuario, accion, criticidad) VALUES (?, ?, ?, ?)",
                [fechaIso, email, 'Solicitud de restablecimiento de contraseña', 'MEDIA']);

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

app.post('/api/auth/reset-password', async (req, res) => {
    const { email, token, nuevaPassword } = req.body;

    if (!passwordRegex.test(nuevaPassword)) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres, mayúscula, minúscula, número y símbolo.' });
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
                
                const fechaIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
                db.run("INSERT INTO auditoria_logs (fecha_hora, usuario, accion, criticidad) VALUES (?, ?, ?, ?)",
                    [fechaIso, email, 'Contraseña actualizada correctamente vía recuperación', 'ALTA']);

                dispararWebhookMake('CAMBIO_PASSWORD', { nombre: user.nombre, email: user.email, destino: 'Restablecimiento exitoso' });
                res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
            });
        } catch (e) {
            res.status(500).json({ error: 'Error interno.' });
        }
    });
});

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

app.post('/api/turista/cotizar', (req, res) => {
    const { usuarioNombre, usuarioEmail, destinoNombre, personas, dias, modoTransporte } = req.body;
    let costoBaseDiario = 65000; 
    if (modoTransporte === 'Carro') costoBaseDiario = 100000;
    if (modoTransporte === 'Moto') costoBaseDiario = 55000;
    if (modoTransporte === 'A pie') costoBaseDiario = 35000;

    const costoTotal = Number(personas) * Number(dias) * costoBaseDiario;
    
    dispararWebhookMake('COTIZACION_VIAJE', { 
        nombre: usuarioNombre || 'Turista', 
        email: usuarioEmail || 'N/A', 
        destino: `${destinoNombre} (${personas} pers, ${dias} días, Total: $${costoTotal.toLocaleString()} COP)` 
    });

    res.json({ success: true, costoTotal });
});

app.post('/api/destinos/actualizar', (req, res) => {
    const { id_destino, afluencia_actual, usuarioEmail, rolUsuario } = req.body;
    
    if (rolUsuario !== 'admin' && rolUsuario !== 'super_admin') {
        return res.status(403).json({ error: 'Acceso denegado.' });
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

app.get('/api/auditoria/logs', (req, res) => {
    const userRole = req.headers['x-user-role'];
    if (userRole !== 'auditor' && userRole !== 'super_admin') {
        return res.status(403).json({ error: 'Acceso restringido.' });
    }
    db.all("SELECT * FROM auditoria_logs ORDER BY id_log DESC LIMIT 50", [], (err, logs) => res.json(logs));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor unificado corriendo en el puerto ${PORT}`));