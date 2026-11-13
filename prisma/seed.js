// Создаёт демо-аккаунты ADMIN и MODERATOR для локальной разработки.
// npm run seed  (логины/пароли можно переопределить через переменные окружения)
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const accounts = [
  {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'admin123',
    name: 'Admin',
    role: 'ADMIN',
  },
  {
    email: process.env.SEED_MODERATOR_EMAIL || 'moderator@example.com',
    password: process.env.SEED_MODERATOR_PASSWORD || 'moderator123',
    name: 'Moderator',
    role: 'MODERATOR',
  },
];

async function main() {
  for (const { password, ...data } of accounts) {
    const hash = await bcrypt.hash(password, 10);
    await prisma.user.upsert({
      where: { email: data.email },
      update: { role: data.role },
      create: { ...data, password: hash },
    });
    console.log(`${data.role}: ${data.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
