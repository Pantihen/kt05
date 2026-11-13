const { app, prisma, request, resetDb, createUserAndLogin } = require('./helpers');

let owner;
let other;
let moderator;
let admin;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function createPost(token, title = 'My post') {
  const res = await request(app).post('/api/posts').set(auth(token)).send({ title, tags: ['rbac'] });
  return res.body;
}

beforeAll(async () => {
  await resetDb();
  owner = await createUserAndLogin('USER');
  other = await createUserAndLogin('USER');
  moderator = await createUserAndLogin('MODERATOR');
  admin = await createUserAndLogin('ADMIN');
});

afterAll(() => prisma.$disconnect());

describe('posts: ownership', () => {
  test('POST /api/posts — автором становится текущий пользователь', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set(auth(owner.token))
      .send({ title: 'Hello', authorId: other.user.id });

    expect(res.status).toBe(201);
    expect(res.body.authorId).toBe(owner.user.id);
  });

  test('GET /api/posts доступен любой роли, без токена — 401', async () => {
    for (const { token } of [owner, moderator, admin]) {
      const res = await request(app).get('/api/posts').set(auth(token));
      expect(res.status).toBe(200);
    }
    expect((await request(app).get('/api/posts')).status).toBe(401);
  });

  test('владелец удаляет свой пост: 204', async () => {
    const post = await createPost(owner.token);
    const res = await request(app).delete(`/api/posts/${post.id}`).set(auth(owner.token));

    expect(res.status).toBe(204);
    expect(await prisma.post.findUnique({ where: { id: post.id } })).toBeNull();
  });

  test('другой USER не может удалить чужой пост: 403', async () => {
    const post = await createPost(owner.token);
    const res = await request(app).delete(`/api/posts/${post.id}`).set(auth(other.token));

    expect(res.status).toBe(403);
    expect(await prisma.post.findUnique({ where: { id: post.id } })).not.toBeNull();
  });

  test('другой USER не может редактировать чужой пост: 403, владелец может: 200', async () => {
    const post = await createPost(owner.token);

    const denied = await request(app)
      .patch(`/api/posts/${post.id}`)
      .set(auth(other.token))
      .send({ title: 'Hacked' });
    expect(denied.status).toBe(403);

    const ok = await request(app)
      .patch(`/api/posts/${post.id}`)
      .set(auth(owner.token))
      .send({ title: 'Edited' });
    expect(ok.status).toBe(200);
    expect(ok.body.title).toBe('Edited');
  });

  test('MODERATOR и ADMIN могут редактировать и удалять любые посты', async () => {
    const p1 = await createPost(owner.token);
    const edited = await request(app)
      .patch(`/api/posts/${p1.id}`)
      .set(auth(moderator.token))
      .send({ published: true });
    expect(edited.status).toBe(200);

    expect((await request(app).delete(`/api/posts/${p1.id}`).set(auth(moderator.token))).status).toBe(204);

    const p2 = await createPost(owner.token);
    expect((await request(app).delete(`/api/posts/${p2.id}`).set(auth(admin.token))).status).toBe(204);
  });

  test('несуществующий пост: 404', async () => {
    const res = await request(app).delete('/api/posts/999999').set(auth(admin.token));
    expect(res.status).toBe(404);
  });
});

describe('users: роли', () => {
  test('GET /api/users: USER — 403, MODERATOR и ADMIN — 200', async () => {
    expect((await request(app).get('/api/users').set(auth(owner.token))).status).toBe(403);

    const mod = await request(app).get('/api/users').set(auth(moderator.token));
    expect(mod.status).toBe(200);
    expect(mod.body.meta).toMatchObject({ total: 4, page: 1 });
    expect(mod.body.data.every((u) => u.password === undefined)).toBe(true);

    expect((await request(app).get('/api/users').set(auth(admin.token))).status).toBe(200);
  });

  test('PATCH /admin/users/:id/role: только ADMIN', async () => {
    const url = `/admin/users/${other.user.id}/role`;

    expect((await request(app).patch(url).set(auth(other.token)).send({ role: 'ADMIN' })).status).toBe(403);
    expect((await request(app).patch(url).set(auth(moderator.token)).send({ role: 'ADMIN' })).status).toBe(403);

    const res = await request(app).patch(url).set(auth(admin.token)).send({ role: 'MODERATOR' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('MODERATOR');

    // новая роль действует сразу: роль берётся из БД, а не из токена
    expect((await request(app).get('/api/users').set(auth(other.token))).status).toBe(200);
  });

  test('PATCH /admin/users/:id/role: невалидная роль — 400', async () => {
    const res = await request(app)
      .patch(`/admin/users/${owner.user.id}/role`)
      .set(auth(admin.token))
      .send({ role: 'SUPERUSER' });
    expect(res.status).toBe(400);
  });
});
