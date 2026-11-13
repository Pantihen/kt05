const { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } = require('../../src/utils/jwt');

const user = { id: 42, role: 'MODERATOR' };

describe('utils/jwt (unit)', () => {
  test('access token подписывается и проверяется, payload содержит id и роль', () => {
    const payload = verifyAccessToken(signAccessToken(user));
    expect(payload.sub).toBe('42');
    expect(payload.role).toBe('MODERATOR');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  test('подделанный токен отклоняется', () => {
    const token = signAccessToken(user);
    const tampered = `${token.slice(0, -2)}xx`;
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  test('refresh token нельзя использовать как access token (разные секреты)', () => {
    const refresh = signRefreshToken(user);
    expect(verifyRefreshToken(refresh).sub).toBe('42');
    expect(() => verifyAccessToken(refresh)).toThrow();
  });
});
