const { Prisma } = require('@prisma/client');
const { isProduction } = require('../config');

function notFound(req, res) {
  res.status(404).json({ error: `Маршрут ${req.method} ${req.originalUrl} не найден` });
}

function prismaError(err) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;
  switch (err.code) {
    case 'P2002': // нарушение уникальности
      return {
        status: 409,
        message: `Значение поля ${[].concat(err.meta?.target || 'unique').join(', ')} уже занято`,
      };
    case 'P2025': // запись не найдена
      return { status: 404, message: 'Запись не найдена' };
    case 'P2003': // нарушение внешнего ключа
      return { status: 400, message: 'Связанная запись не существует' };
    default:
      return null;
  }
}

// Перехватывает все необработанные ошибки.
// В production stack trace и детали внутренних ошибок клиенту не отдаются.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const known = prismaError(err);
  let status = known?.status || err.status || err.statusCode || 500;
  let message = known?.message || err.message;

  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Некорректный JSON в теле запроса';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Тело запроса слишком большое (максимум 10kb)';
  }

  if (status >= 500) {
    console.error(err);
    if (isProduction) message = 'Внутренняя ошибка сервера';
  }

  const body = { error: message };
  if (!isProduction) body.stack = err.stack;

  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
