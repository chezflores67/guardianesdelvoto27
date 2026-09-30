import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const AIRTABLE_TOKEN = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const JWT_SECRET = process.env.JWT_SECRET || 'guardianes-dev-secret';
const AIRTABLE_API = 'https://api.airtable.com/v0';

const TABLE_GUARDIANES = 'Guardianes';
const TABLE_REPORTES = 'Reportes';

// ─── Airtable helper ───
async function airtableFetch(tableName, options = {}) {
  const url = new URL(`${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${tableName}`);
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Airtable error ${res.status}: ${err}`);
  }
  return res.json();
}

async function airtableList(tableName, filterFormula) {
  const allRecords = [];
  let offset;
  do {
    const params = { pageSize: '100' };
    if (filterFormula) params.filterByFormula = filterFormula;
    if (offset) params.offset = offset;
    const data = await airtableFetch(tableName, { params });
    allRecords.push(...data.records);
    offset = data.offset;
  } while (offset);
  return allRecords;
}

// ─── Auth middleware ───
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  next();
}

// ─── Serve frontend ───
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(readFileSync(join(__dirname, 'index.html'), 'utf-8'));
});

// ═══ POST /api/register ═══
app.post('/api/register', async (req, res) => {
  try {
    const { nombre, email, password, partido, tel, curp, clave, perfil, municipio, colonia, experiencia, referido } = req.body;
    if (!nombre || !email || !password) return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios' });

    // Check if email already exists
    const existing = await airtableList(TABLE_GUARDIANES, `{Email} = '${email}'`);
    if (existing.length > 0) return res.status(409).json({ error: 'Ya existe un guardián con este correo' });

    const hash = await bcrypt.hash(password, 10);
    const data = await airtableFetch(TABLE_GUARDIANES, {
      method: 'POST',
      body: {
        records: [{
          fields: {
            Nombre: nombre,
            Email: email,
            Password: hash,
            Partido: partido || '',
            Telefono: tel || '',
            CURP: curp || '',
            ClaveElector: clave || '',
            Perfil: perfil || '',
            Municipio: municipio || '',
            Colonia: colonia || '',
            Experiencia: experiencia || '',
            Referido: referido || '',
            Rol: 'guardian',
            Fecha: new Date().toISOString(),
          }
        }]
      }
    });

    const record = data.records[0];
    const token = jwt.sign({ id: record.id, email, rol: 'guardian' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, guardián: { id: record.id, nombre, email, rol: 'guardian' } });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Error al registrar: ' + err.message });
  }
});

// ═══ POST /api/login ═══
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const records = await airtableList(TABLE_GUARDIANES, `{Email} = '${email}'`);
    if (records.length === 0) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const record = records[0];
    const valid = await bcrypt.compare(password, record.fields.Password);
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const rol = record.fields.Rol || 'guardian';
    const token = jwt.sign({ id: record.id, email, rol }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      guardián: {
        id: record.id,
        nombre: record.fields.Nombre,
        email: record.fields.Email,
        partido: record.fields.Partido,
        municipio: record.fields.Municipio,
        rol,
      }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// ═══ GET /api/stats ═══ (public — for hero counters)
app.get('/api/stats', async (req, res) => {
  try {
    const records = await airtableList(TABLE_GUARDIANES);
    let pan = 0, pri = 0, ciu = 0, hoy = 0;
    const todayStr = new Date().toDateString();
    records.forEach(r => {
      if (r.fields.Partido === 'PAN') pan++;
      else if (r.fields.Partido === 'PRI') pri++;
      else ciu++;
      if (r.fields.Fecha && new Date(r.fields.Fecha).toDateString() === todayStr) hoy++;
    });
    res.json({ total: records.length, pan, pri, ciu, hoy, meta: 3847 });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ═══ GET /api/guardianes ═══ (admin only)
app.get('/api/guardianes', authMiddleware, adminOnly, async (req, res) => {
  try {
    const records = await airtableList(TABLE_GUARDIANES);
    const guardianes = records.map(r => ({
      id: r.id,
      nombre: r.fields.Nombre || '',
      email: r.fields.Email || '',
      partido: r.fields.Partido || '',
      tel: r.fields.Telefono || '',
      municipio: r.fields.Municipio || '',
      colonia: r.fields.Colonia || '',
      perfil: r.fields.Perfil || '',
      fecha: r.fields.Fecha || '',
    }));
    res.json(guardianes);
  } catch (err) {
    console.error('Guardianes error:', err.message);
    res.status(500).json({ error: 'Error al obtener guardianes' });
  }
});

// ═══ GET /api/me ═══ (authenticated)
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const records = await airtableList(TABLE_GUARDIANES, `{Email} = '${req.user.email}'`);
    if (records.length === 0) return res.status(404).json({ error: 'No encontrado' });
    const r = records[0];
    res.json({
      id: r.id,
      nombre: r.fields.Nombre,
      email: r.fields.Email,
      partido: r.fields.Partido,
      municipio: r.fields.Municipio,
      tel: r.fields.Telefono,
      rol: r.fields.Rol || 'guardian',
    });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

// ═══ POST /api/reportes ═══ (authenticated)
app.post('/api/reportes', authMiddleware, async (req, res) => {
  try {
    const { contenido } = req.body;
    if (!contenido) return res.status(400).json({ error: 'Contenido requerido' });

    const data = await airtableFetch(TABLE_REPORTES, {
      method: 'POST',
      body: {
        records: [{
          fields: {
            Guardian: req.user.email,
            Contenido: contenido,
            Fecha: new Date().toISOString(),
            Estado: 'pendiente',
          }
        }]
      }
    });
    res.json({ ok: true, id: data.records[0].id });
  } catch (err) {
    console.error('Reporte error:', err.message);
    res.status(500).json({ error: 'Error al crear reporte' });
  }
});

// ═══ GET /api/reportes ═══ (admin only)
app.get('/api/reportes', authMiddleware, adminOnly, async (req, res) => {
  try {
    const records = await airtableList(TABLE_REPORTES);
    const reportes = records.map(r => ({
      id: r.id,
      guardian: r.fields.Guardian || '',
      contenido: r.fields.Contenido || '',
      fecha: r.fields.Fecha || '',
      estado: r.fields.Estado || 'pendiente',
    })).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    res.json(reportes);
  } catch (err) {
    console.error('Reportes error:', err.message);
    res.status(500).json({ error: 'Error al obtener reportes' });
  }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Guardianes del Voto backend en http://0.0.0.0:${PORT}`);
});
