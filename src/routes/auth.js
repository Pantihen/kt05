const express = require('express');
const rateLimit = require('express-rate-limit');
const { prisma, isProduction, refreshCookie } = require('../config');
const { validate, schemas } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { hashPassword, comparePassword } = require('../utils/password');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');

const router = express.Router();

// Не более 10 попыток входа за 15 минут с одного IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа, попробуйте через 15 минут' },
});

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/auth',
};

function setRefreshCookie(res, user) {
  res.cookie(refreshCookie.name, signRefreshToken(user), {
    ...cookieOptions,
    maxAge: refreshCookie.maxAgeMs,
  });
}

// POST /auth/register — регистрация, пароль хэшируется bcrypt
router.post('/register', validate(schemas.register), async (req, res) => {
  const { email, name, password } = req.validated.body;

  const user = await prisma.user.create({
    data: { email, name, password: await hashPassword(password) },
  });

  res.status(201).json(user);
});

// POST /auth/login — access token в ответе, refresh token в httpOnly cookie
router.post('/login', loginLimiter, validate(schemas.login), async (req, res) => {
  const { email, password } = req.validated.body;

  const user = await prisma.user.findUnique({
    where: { email },
    omit: { password: false },
  });

  if (!user || !(await comparePassword(password, user.password))) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  const { password: _hash, ...safeUser } = user;
  setRefreshCookie(res, user);
  res.json({ accessToken: signAccessToken(user), user: safeUser });
});

// POST /auth/refresh — новый access token по refresh token из cookie
router.post('/refresh', async (req, res) => {
  const token = req.cookies?.[refreshCookie.name];
  if (!token) {
    return res.status(401).json({ error: 'Refresh token отсутствует' });
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    res.clearCookie(refreshCookie.name, cookieOptions);
    return res.status(401).json({ error: 'Недействительный или просроченный refresh token' });
  }

  const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
  if (!user) {
    res.clearCookie(refreshCookie.name, cookieOptions);
    return res.status(401).json({ error: 'Пользователь не найден' });
  }

  setRefreshCookie(res, user); // ротация refresh token
  res.json({ accessToken: signAccessToken(user) });
});

// POST /auth/logout — очистка cookie
router.post('/logout', (req, res) => {
  res.clearCookie(refreshCookie.name, cookieOptions);
  res.status(204).end();
});

// GET /auth/me — текущий пользователь
router.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

module.exports = router;
