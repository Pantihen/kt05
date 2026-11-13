// Один раз перед всеми тестами: пересоздаём тестовую SQLite-базу и применяем миграции
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

module.exports = async () => {
  const dbFile = path.join(__dirname, '..', 'prisma', 'test.db');
  fs.rmSync(dbFile, { force: true });
  fs.rmSync(`${dbFile}-journal`, { force: true });

  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'ignore',
  });
};
