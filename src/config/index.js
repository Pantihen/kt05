require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const nodeEnv = process.env.NODE_ENV || 'development';
const databaseUrl = process.env.DATABASE_URL || '';

const jwt = {
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
};

if (!jwt.accessSecret || !jwt.refreshSecret) {
  throw new Error('JWT_ACCESS_SECRET и JWT_REFRESH_SECRET должны быть заданы в .env');
}

// Один экземпляр PrismaClient на всё приложение.
// Поле password никогда не попадает в ответы (глобальный omit).
const prisma = new PrismaClient({
  omit: { user: { password: true } },
});

module.exports = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv,
  isProduction: nodeEnv === 'production',
  // mode: 'insensitive' поддерживается только PostgreSQL (и MongoDB)
  isPostgres: databaseUrl.startsWith('postgres'),
  pagination: { defaultLimit: 10, maxLimit: 100 },
  bcryptRounds: 10,
  jwt,
  refreshCookie: {
    name: 'refreshToken',
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },
  chat: {
    corsOrigin: (process.env.CLIENT_ORIGIN || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    historyLimit: Number(process.env.CHAT_HISTORY_LIMIT) || 50,
    maxMessageLength: Number(process.env.CHAT_MAX_MESSAGE_LENGTH) || 1000,
    maxRoomNameLength: 50,
  },
  prisma,
};
