// auth/jwt.js

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
const JWT_ISSUER = process.env.JWT_ISSUER || 'smart-schedule-app'; // tùy chỉnh nếu muốn
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'smart-schedule-frontend';

if (!JWT_SECRET) {
  throw new Error('Missing JWT_SECRET in environment');
}

/**
 * Tạo JWT. Chỉ gắn những trường cần thiết.
 * @param {{ uuid: string, email?: string }} payload
 */
export function generateJWT(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    jwtid: payload.uuid.toString(), // có thể thêm uuid riêng nếu cần revoke riêng lẻ
  });
}

/**
 * Middleware yêu cầu có token hợp lệ.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Authorization header malformed' });
  }

  const token = parts[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    req.user = payload; // ví dụ: { uuid: "...", email: "...", iat, exp, ... }
    next();
  } catch (err) {
    console.error('JWT verification failed:', err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
