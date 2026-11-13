const express = require('express');
const { prisma, isPostgres } = require('../config');
const { validate, schemas } = require('../middleware/validate');
const { authenticate, authorizeOwnerOr } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

const postInclude = {
  author: { select: { id: true, name: true, email: true } },
  tags: true,
};

// Массив имён тегов -> connectOrCreate
function tagsConnectOrCreate(tags) {
  return tags.map((name) => ({
    where: { name },
    create: { name },
  }));
}

// Владелец поста — его автор
const postOwnerId = async (req) => {
  const post = await prisma.post.findUnique({
    where: { id: req.validated.params.id },
    select: { authorId: true },
  });
  return post ? post.authorId : null;
};

// USER — только свои посты, MODERATOR и ADMIN — любые
const canModifyPost = authorizeOwnerOr(postOwnerId, 'MODERATOR', 'ADMIN');

// GET /api/posts — список с фильтрацией и пагинацией
router.get('/', validate(schemas.postQuery, 'query'), async (req, res) => {
  const { search, published, authorId, page, limit } = req.validated.query;

  const where = {};
  if (search) {
    where.title = { contains: search, ...(isPostgres && { mode: 'insensitive' }) };
  }
  if (published !== undefined) where.published = published;
  if (authorId !== undefined) where.authorId = authorId;

  const [data, total] = await prisma.$transaction([
    prisma.post.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: postInclude,
    }),
    prisma.post.count({ where }),
  ]);

  res.json({
    data,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
});

// GET /api/posts/:id — пост с автором и тегами
router.get('/:id', validate(schemas.idParam, 'params'), async (req, res) => {
  const post = await prisma.post.findUnique({
    where: { id: req.validated.params.id },
    include: postInclude,
  });

  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  res.json(post);
});

// POST /api/posts — автор = текущий пользователь, теги через connectOrCreate
router.post('/', validate(schemas.postCreate), async (req, res) => {
  const { tags = [], ...data } = req.validated.body;

  const post = await prisma.post.create({
    data: {
      ...data,
      authorId: req.user.id,
      tags: { connectOrCreate: tagsConnectOrCreate(tags) },
    },
    include: postInclude,
  });

  res.status(201).json(post);
});

// PATCH /api/posts/:id — tags заменяет набор тегов целиком
router.patch(
  '/:id',
  validate(schemas.idParam, 'params'),
  canModifyPost,
  validate(schemas.postUpdate),
  async (req, res) => {
    const { tags, ...data } = req.validated.body;
    if (tags) {
      data.tags = { set: [], connectOrCreate: tagsConnectOrCreate(tags) };
    }

    const post = await prisma.post.update({
      where: { id: req.validated.params.id },
      data,
      include: postInclude,
    });

    res.json(post);
  }
);

// DELETE /api/posts/:id
router.delete('/:id', validate(schemas.idParam, 'params'), canModifyPost, async (req, res) => {
  await prisma.post.delete({ where: { id: req.validated.params.id } });
  res.status(204).end();
});

module.exports = router;
