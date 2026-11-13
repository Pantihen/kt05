const { app, prisma, request, resetDb } = require('./helpers');

const newUser = { email: 'ann@test.com', name: 'Ann', password: 'secret123' };

beforeAll(resetDb);
afterAll(() => prisma.$disconnect());

describe('POST /auth/register', () => {
  test('успешная регистрация: 201, пароль захэширован и не возвращается', async () => {
    const res = await request(app).post('/auth/register').send(newUser);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: newUser.email, name: 'Ann', role: 'USER' });
    expect(res.body.password).toBeUndefined();

    const db = await prisma.user.findUnique({
      where: { email: newUser.email },
      omit: { password: false },
    });
    expect(db.password).not.toBe(newUser.password);
    expect(db.password).toMatch(/^\$2[aby]\$/); // формат bcrypt-хэша
  });

  test('дублирующийся email: 409', async () => {
    const res = await request(app).post('/auth/register').send(newUser);
    expect(res.status).toBe(409);
  });

  test('невалидные данные: 400 с details', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'bad', password: '1' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toEqual(
      expect.arrayContaining(['email', 'name', 'password'])
    );
  });

  test('роль из тела запроса игнорируется — всегда USER', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'hacker@test.com', name: 'H', password: 'secret123', role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('USER');
  });
});

describe('POST /auth/login', () => {
  test('успешный логин: access token в ответе, refresh token в httpOnly cookie', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: newUser.email, password: newUser.password });

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.user.password).toBeUndefined();

    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/refreshToken=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  test('неверный пароль: 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: newUser.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.accessToken).toBeUndefined();
  });
});

describe('refresh / logout', () => {
  test('refresh по cookie выдаёт новый access token, без cookie — 401', async () => {
    const agent = request.agent(app); // хранит cookie между запросами
    await agent.post('/auth/login').send({ email: newUser.email, password: newUser.password });

    const ok = await agent.post('/auth/refresh');
    expect(ok.status).toBe(200);
    expect(typeof ok.body.accessToken).toBe('string');

    const noCookie = await request(app).post('/auth/refresh');
    expect(noCookie.status).toBe(401);
  });

  test('logout очищает cookie, после этого refresh — 401', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email: newUser.email, password: newUser.password });

    const out = await agent.post('/auth/logout');
    expect(out.status).toBe(204);
    expect(out.headers['set-cookie'].join(';')).toMatch(/refreshToken=;/);

    const res = await agent.post('/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('GET /auth/me (защищённый маршрут)', () => {
  test('с токеном: 200 и текущий пользователь', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ email: newUser.email, password: newUser.password });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(newUser.email);
    expect(res.body.password).toBeUndefined();
  });

  test('без токена: 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('с поддельным токеном: 401', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
  });
});
