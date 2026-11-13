const http = require('http');
const app = require('./app');
const { port, prisma } = require('./config');
const { initSocket } = require('./socket');

// Express и Socket.io работают на одном HTTP-сервере и одном порту
const server = http.createServer(app);
const io = initSocket(server);

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`Chat demo: http://localhost:${port}/chat.html`);
});

async function shutdown() {
  io.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
