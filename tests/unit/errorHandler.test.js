function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

function loadErrorHandler(nodeEnv) {
  let handler;
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  jest.isolateModules(() => {
    ({ errorHandler: handler } = require('../../src/middleware/errorHandler'));
  });
  process.env.NODE_ENV = prev;
  return handler;
}

describe('middleware/errorHandler (unit)', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  test('в production stack trace и текст внутренней ошибки скрыты', () => {
    const res = mockRes();
    loadErrorHandler('production')(new Error('DB password leaked'), {}, res, () => {});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Внутренняя ошибка сервера' });
  });

  test('в development stack trace отдаётся для отладки', () => {
    const res = mockRes();
    loadErrorHandler('development')(new Error('boom'), {}, res, () => {});

    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('boom');
    expect(body.stack).toMatch(/Error: boom/);
  });
});
