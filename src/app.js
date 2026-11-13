const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const usersRouter = require('./routes/users');
const postsRouter = require('./routes/posts');
const messagesRouter = require('./routes/messages');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(helmet()); // X-Frame-Options, X-Content-Type-Options, CSP и др.
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Демо-клиент чата: /chat.html
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/api/users', usersRouter);
app.use('/api/posts', postsRouter);
app.use('/api/messages', messagesRouter);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
