const { prisma } = require('../config');
const { verifyAccessToken } = require('../utils/jwt');

// Проверяет заголовок Authorization: Bearer <accessToken>
async function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ error: 'Недействительный или просроченный токен' });
  }

  // Берём пользователя из БД: роль всегда актуальна, удалённый пользователь не пройдёт
  const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
  if (!user) {
    return res.status(401).json({ error: 'Пользователь не найден' });
  }

  req.user = user;
  next();
}

// Пропускает только перечисленные роли
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    next();
  };
}

// Владелец ресурса или одна из привилегированных ролей.
// getOwnerId(req) возвращает id владельца или null, если ресурса нет.
function authorizeOwnerOr(getOwnerId, ...privilegedRoles) {
  return async (req, res, next) => {
    const ownerId = await getOwnerId(req);
    if (ownerId === null || ownerId === undefined) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    if (ownerId !== req.user.id && !privilegedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    next();
  };
}

module.exports = { authenticate, authorize, authorizeOwnerOr };
