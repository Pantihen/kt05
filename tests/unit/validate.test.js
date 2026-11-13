const { validate, schemas } = require('../../src/middleware/validate');

function run(schema, body) {
  const req = { body };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  validate(schema)(req, res, next);
  return { req, res, next };
}

describe('middleware/validate (unit)', () => {
  test('валидные данные: next(), данные очищены и нормализованы', () => {
    const { req, res, next } = run(schemas.register, {
      email: '  Ann@Test.COM ',
      name: 'Ann',
      password: 'secret123',
      role: 'ADMIN', // лишнее поле вырезается
    });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validated.body).toEqual({ email: 'ann@test.com', name: 'Ann', password: 'secret123' });
  });

  test('невалидные данные: 400 и массив details по всем полям', () => {
    const { res, next } = run(schemas.postCreate, { title: '', tags: 'not-array' });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const { details } = res.json.mock.calls[0][0];
    expect(details.map((d) => d.field)).toEqual(['title', 'tags']);
  });
});
