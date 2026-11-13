const { app, prisma, request, resetDb } = require('./helpers');

beforeAll(resetDb);
afterAll(() => prisma.$disconnect());

describe('безопасность', () => {
  test('helmet: заголовки X-Frame-Options и X-Content-Type-Options', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('тело запроса больше 10kb: 413', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'big@test.com', name: 'x'.repeat(11 * 1024), password: 'secret123' });
    expect(res.status).toBe(413);
  });

  test('rate limit на /auth/login: 11-й запрос за 15 минут — 429', async () => {
    const creds = { email: 'nobody@test.com', password: 'wrong' };
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app).post('/auth/login').send(creds);
      expect(res.status).toBe(401);
    }
    const blocked = await request(app).post('/auth/login').send(creds);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.ratelimit).toBeDefined();
  });
});
