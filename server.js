const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const axios = require('axios');

const app = express();

app.disable('x-powered-by');

app.use(helmet({
    contentSecurityPolicy: false,
    strictTransportSecurity: {
        maxAge: 63072000,
        includeSubDomains: true,
        preload: true
    },
    xFrameOptions: { action: 'deny' },
    xContentTypeOptions: true,
    referrerPolicy: { policy: 'no-referrer' }
}));

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-role', 'x-user-id']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// URL de tu Webhook en Make
const WEBHOOK_URL = 'https://hook.us2.make.com/zqwo5c7ngz45bm4bxxgkqsdtx8y8q6sx';

// Función auxiliar para enviar datos a Make de forma segura sin bloquear la app
async function dispararWebhookMake(tipoEvento, datos) {
    try {
        await axios.post(WEBHOOK_URL, {
            origen: 'Turismo Inteligente Backend',
            evento: tipoEvento,
            timestamp: new Date().toISOString(),
            payload: datos
        }, { headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error('Aviso: No se pudo notificar a Make:', error.message);
    }
}

// Inicializar Base de Datos SQLite con ruta absoluta segura para producción
const dbPath = path.join(__dirname, 'turismo.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Error al abrir la base de datos', err.message);
    else console.log('Conectado a la Base de Datos SQLite en:', dbPath);
});

// Crear Tablas e Insertar Datos Semilla
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        rol TEXT NOT NULL
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

    // Semilla de usuarios por defecto
    db.get("SELECT COUNT(*) as count FROM usuarios", async (err, row) => {
        if (row && row.count === 0) {
            const passGestor = await bcrypt.hash('gestor123', 10);
            const passTurista = await bcrypt.hash('turista123', 10);
            
            db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)`, 
                ['Carlos Gestor (DMO)', 'gestor@usb.edu.co', passGestor, 'dmo']);
            db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)`, 
                ['Laura Turista', 'turista@gmail.com', passTurista, 'turista']);
        }
    });

    // Semilla de destinos turísticos y alojamientos
    db.get("SELECT COUNT(*) as count FROM destinos_turisticos", (err, row) => {
        if (row && row.count === 0) {
            const destinos = [
                ['col01', 'Cerro de Monserrate', 'Bogotá: Santuario histórico y mirador.', 'historia', 3000, 1800, 25000, 95000, 1150000, 4.6058, -74.0558, 'Moderado'],
                ['col02', 'Piedra del Peñol y Guatapé', 'Antioquia: Monolito gigante y embalse.', 'aventura', 2500, 1600, 22000, 88000, 1020000, 6.2244, -75.1606, 'Alerta Moderada'],
                ['col03', 'Cristo Rey y San Antonio', 'Cali: Monumento y barrio tradicional.', 'cultura', 1500, 700, 12000, 49000, 580000, 3.4419, -76.5597, 'Seguro'],
                ['col04', 'Parque Arví y Metrocable', 'Medellín: Parque ecoturístico de alta montaña.', 'naturaleza', 2000, 900, 15000, 60000, 720000, 6.2842, -75.5028, 'Seguro'],
                ['col05', 'La Candelaria y Museo del Oro', 'Bogotá: Centro colonial histórico.', 'historia', 2500, 1200, 18000, 72000, 850000, 4.6014, -74.0721, 'Moderado'],
                ['col06', 'Santuario de Las Lajas', 'Ipiales: Basílica en el cañón.', 'historia', 1800, 600, 9500, 38000, 450000, 0.8114, -77.5878, 'Seguro']
            ];
            const stmtDestino = db.prepare("INSERT INTO destinos_turisticos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            destinos.forEach(d => stmtDestino.run(d));
            stmtDestino.finalize();

            const hospedajes = [
                ['col01', 'Hotel Dann Avenida 19', 'Hotel', '$180.000 / noche'],
                ['col01', 'Casa de Huéspedes Monserrate', 'Hostal', '$90.000 / noche'],
                ['col02', 'Bicentenario Hotel Guatapé', 'Hotel Boutique', '$250.000 / noche'],
                ['col02', 'Bosio Hostal El Peñol', 'Hostal', '$110.000 / noche'],
                ['col03', 'Hotel Movich Intercontinental Cali', 'Hotel 5 Estrellas', '$320.000 / noche'],
                ['col04', 'Hotel Parque Arví Ecoresort', 'Ecoresort', '$290.000 / noche'],
                ['col05', 'Hotel de la Opera Candelaria', 'Histórico', '$310.000 / noche'],
                ['col06', 'Hotel Las Lajas Sanctuario', 'Hotel', '$140.000 / noche']
            ];
            const stmtHospedaje = db.prepare("INSERT INTO hospedajes (id_destino, nombre_hospedaje, tipo, precio_noche) VALUES (?, ?, ?, ?)");
            hospedajes.forEach(h => stmtHospedaje.run(h));
            stmtHospedaje.finalize();
        }
    });
});

// API: Registro (Dispara webhook a Make automáticamente)
app.post('/api/auth/registro', async (req, res) => {
    const { nombre, email, password, rol } = req.body;
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const tipoRol = rol || 'turista';
        
        db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)`,
            [nombre, email, passwordHash, tipoRol],
            async function(err) {
                if (err) return res.status(400).json({ error: 'El correo ya está registrado.' });
                
                // Disparar automatización en Make al registrarse
                await dispararWebhookMake('REGISTRO_USUARIO', { nombre, email, rol: tipoRol });

                res.json({ success: true, message: 'Usuario registrado con éxito.' });
            }
        );
    } catch (e) {
        res.status(500).json({ error: 'Error interno en el servidor.' });
    }
});

// API: Login (Dispara webhook a Make automáticamente)
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Credenciales inválidas.' });
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Contraseña incorrecta.' });

        // Disparar automatización en Make al iniciar sesión
        await dispararWebhookMake('INICIO_SESION', { nombre: user.nombre, email: user.email, rol: user.rol });

        res.json({ success: true, usuario: { id: user.id_usuario, nombre: user.nombre, email: user.email, rol: user.rol } });
    });
});

// API: Obtener destinos con sus respectivos alojamientos
app.get('/api/destinos', (req, res) => {
    db.all("SELECT * FROM destinos_turisticos", [], (err, destinos) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.all("SELECT * FROM hospedajes", [], (errH, hospedajes) => {
            if (errH) return res.status(500).json({ error: errH.message });

            const resultado = destinos.map(d => ({
                ...d,
                hospedajes: hospedajes.filter(h => h.id_destino === d.id_destino)
            }));
            res.json(resultado);
        });
    });
});

// API: Recomendador para Turistas según preferencia
app.post('/api/turista/recomendar', (req, res) => {
    const { preferencia } = req.body;
    db.all("SELECT * FROM destinos_turisticos WHERE categoria = ?", [preferencia], (err, destinos) => {
        if (err || destinos.length === 0) {
            db.get("SELECT * FROM destinos_turisticos LIMIT 1", [], (err2, destFallback) => {
                if (!destFallback) return res.status(404).json({ error: 'No hay destinos' });
                db.all("SELECT * FROM hospedajes WHERE id_destino = ?", [destFallback.id_destino], (errH, hList) => {
                    res.json({ destino: { ...destFallback, hospedajes: hList } });
                });
            });
            return;
        }
        const elegido = destinos[0];
        db.all("SELECT * FROM hospedajes WHERE id_destino = ?", [elegido.id_destino], (errH, hList) => {
            res.json({ destino: { ...elegido, hospedajes: hList } });
        });
    });
});

// API: Actualizar aforo (Gestor DMO) y registrar auditoría ISO
app.post('/api/destinos/actualizar', async (req, res) => {
    const { id_destino, afluencia_actual, usuarioEmail } = req.body;
    db.run("UPDATE destinos_turisticos SET afluencia_actual = ? WHERE id_destino = ?", [afluencia_actual, id_destino], async function(err) {
        if (err) return res.status(500).json({ error: err.message });

        const fechaIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
        db.run("INSERT INTO auditoria_logs (fecha_hora, usuario, accion, criticidad) VALUES (?, ?, ?, ?)",
            [fechaIso, usuarioEmail, `Actualización aforo destino ${id_destino} a ${afluencia_actual} visitantes`, 'MEDIA']);

        // Notificar también a Make sobre el cambio de aforo crítico
        await dispararWebhookMake('ACTUALIZACION_AFORO', { id_destino, afluencia_actual, usuarioEmail });

        res.json({ success: true, message: 'Aforo actualizado y registrado en auditoría correctamente.' });
    });
});

// API: Obtener logs de auditoría
app.get('/api/auditoria/logs', (req, res) => {
    db.all("SELECT * FROM auditoria_logs ORDER BY id_log DESC LIMIT 20", [], (err, logs) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(logs);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});