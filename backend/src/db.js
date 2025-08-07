// db.js
import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

// Lấy biến môi trường từ .env (theo cấu trúc cũ)
const {
  DB_SERVER,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_PORT = '1433', // default
} = process.env;

if (!DB_SERVER) {
  console.error('[DB] Missing DB_SERVER in environment');
  process.exit(1);
}
if (!DB_NAME) {
  console.error('[DB] Missing DB_NAME in environment');
  process.exit(1);
}
if (!DB_USER) {
  console.error('[DB] Missing DB_USER in environment');
  process.exit(1);
}
if (!DB_PASSWORD) {
  console.error('[DB] Missing DB_PASSWORD in environment');
  process.exit(1);
}

const config = {
  user: DB_USER,
  password: DB_PASSWORD,
  server: DB_SERVER,
  port: parseInt(DB_PORT, 10),
  database: DB_NAME,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  options: {
    encrypt: true, // tùy nếu dùng Azure hoặc yêu cầu TLS
    trustServerCertificate: true, // trong production cân nhắc thay đổi
  },
};

// Singleton connection pool
let poolPromise = null;

export function getPool() {
  if (!poolPromise) {
    poolPromise = (async () => {
      try {
        const pool = await new sql.ConnectionPool(config).connect();
        console.log('[DB] Connected to MSSQL');
        pool.on('error', err => {
          console.error('[DB] Pool error:', err);
          poolPromise = null;
        });
        return pool;
      } catch (err) {
        console.error('[DB] Connection failed:', err);
        poolPromise = null;
        throw err;
      }
    })();
  }
  return poolPromise;
}

export async function runQuery(queryText, params = {}, timeoutMs = 5000) {
  const pool = await getPool();
  const request = pool.request();
  request.commandTimeout = Math.ceil(timeoutMs / 1000);
  for (const [name, { value, type }] of Object.entries(params)) {
    if (type) request.input(name, type, value);
    else request.input(name, value);
  }
  const result = await request.query(queryText);
  return result;
}

export async function healthCheck() {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT 1 AS ok');
    return result.recordset[0]?.ok === 1;
  } catch (err) {
    console.error('[DB] Health check failed:', err);
    return false;
  }
}

export { sql };
