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

// Inicializar Base de Datos SQLite con ruta absoluta para producción
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

    // Semilla de destinos turísticos
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
        }
    });
});

// API: Registro de nuevos usuarios
app.post('/api/auth/register', async (req, res) => {
    const { nombre, email, password } = req.body;
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const rol = 'turista'; 
        
        db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)`,
            [nombre, email, passwordHash, rol],
            function(err) {
                if (err) {
                    return res.status(400).json({ error: 'El correo ya está registrado o los datos son inválidos.' });
                }
                res.json({ success: true, mensaje: 'Usuario registrado correctamente.', id: this.lastID });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Error en el servidor al registrar.' });
    }
});

// API: Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Credenciales inválidas.' });
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Contraseña incorrecta.' });
        res.json({ success: true, usuario: { id: user.id_usuario, nombre: user.nombre, email: user.email, rol: user.rol } });
    });
});

// API: Obtener destinos
app.get('/api/destinos', (req, res) => {
    db.all("SELECT * FROM destinos_turisticos", [], (err, destinos) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(destinos);
    });
});

// API: Webhook para Make con manejo blindado de errores
app.post('/api/webhook/automatizacion', async (req, res) => {
    try {
        const datosEvento = req.body;
        const WEBHOOK_URL = 'https://hook.us2.make.com/zqwo5c7ngz45bm4bxxgkqsdtx8y8q6sx';

        await axios.post(WEBHOOK_URL, {
            origen: 'Turismo Inteligente Backend',
            timestamp: new Date().toISOString(),
            payload: datosEvento
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        res.json({ success: true, mensaje: 'Enviado a Make correctamente.' });
    } catch (error) {
        console.error('Error detallado con Make:', error.response?.status, error.message);
        res.status(500).json({ error: 'Fallo al conectar con Make', detalle: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});