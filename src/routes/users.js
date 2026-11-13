const express = require('express');
const { prisma } = require('../config');
const { validate, schemas } = require('../middleware/validate');
const { authenticate, authorize, authorizeOwnerOr } = require('../middleware/auth');
const { hashPassword } = require('../utils/password');

const router = express.Router();

router.use(authenticate);

// Владелец профиля — сам пользователь
const userOwnerId = async (req) => {
  const user = await prisma.user.findUnique({
    where: { id: req.validated.params.id },
    select: { id: true },
  });
  return user ? user.id : null;
};

// GET /api/users — список с пагинацией (MODERATOR, ADMIN)
router.get(
  '/',
  authorize('MODERATOR', 'ADMIN'),
  validate(schemas.userQuery, 'query'),
  async (req, res) => {
    const { page, limit } = req.validated.query;

    const [data, total] = await prisma.$transaction([
      prisma.user.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'asc' },
        include: { _count: { select: { posts: true } } },
      }),
      prisma.user.count(),
    ]);

    res.json({
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  }
);

// GET /api/users/:id — пользователь с постами (новые сверху)
router.get('/:id', validate(schemas.idParam, 'params'), async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.validated.params.id },
    include: {
      posts: {
        orderBy: { createdAt: 'desc' },
        include: { tags: true },
      },
    },
  });

  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json(user);
});

// POST /api/users — создать пользователя с любой ролью (ADMIN).
// Обычная регистрация — POST /auth/register
router.post('/', authorize('ADMIN'), validate(schemas.userCreate), async (req, res) => {
  const { password, ...data } = req.validated.body;
  const user = await prisma.user.create({
    data: { ...data, password: await hashPassword(password) },
  });
  res.status(201).json(user);
});

// PATCH /api/users/:id — свой профиль или ADMIN. Роль меняется только через /admin
router.patch(
  '/:id',
  validate(schemas.idParam, 'params'),
  authorizeOwnerOr(userOwnerId, 'ADMIN'),
  validate(schemas.userUpdate),
  async (req, res) => {
    const data = { ...req.validated.body };
    if (data.password) data.password = await hashPassword(data.password);

    const user = await prisma.user.update({
      where: { id: req.validated.params.id },
      data,
    });
    res.json(user);
  }
);

// DELETE /api/users/:id — свой аккаунт или ADMIN, посты удаляются вместе с ним
router.delete(
  '/:id',
  validate(schemas.idParam, 'params'),
  authorizeOwnerOr(userOwnerId, 'ADMIN'),
  async (req, res) => {
    const id = req.validated.params.id;
    await prisma.$transaction([
      prisma.post.deleteMany({ where: { authorId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);
    res.status(204).end();
  }
);

module.exports = router;
