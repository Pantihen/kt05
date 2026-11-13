const jsonwebtoken = require('jsonwebtoken');
const { jwt } = require('../config');

function payloadFor(user) {
  return { sub: String(user.id), role: user.role };
}

function signAccessToken(user) {
  return jsonwebtoken.sign(payloadFor(user), jwt.accessSecret, { expiresIn: jwt.accessExpiresIn });
}

function signRefreshToken(user) {
  return jsonwebtoken.sign(payloadFor(user), jwt.refreshSecret, { expiresIn: jwt.refreshExpiresIn });
}

// Бросают ошибку, если токен подделан, просрочен или подписан другим секретом
function verifyAccessToken(token) {
  return jsonwebtoken.verify(token, jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jsonwebtoken.verify(token, jwt.refreshSecret);
}

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
