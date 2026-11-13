const Joi = require('joi');
const { pagination, chat } = require('../config');

const ROLES = ['USER', 'MODERATOR', 'ADMIN'];

const paginationFields = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(pagination.maxLimit).default(pagination.defaultLimit),
};

const email = Joi.string().trim().lowercase().email();
const name = Joi.string().trim().min(1).max(100);
// bcrypt учитывает только первые 72 байта пароля
const password = Joi.string().min(6).max(72);
const tags = Joi.array().items(Joi.string().trim().min(1).max(50)).unique();

const schemas = {
  idParam: Joi.object({
    id: Joi.number().integer().min(1).required(),
  }),

  // ---------- auth ----------
  register: Joi.object({
    email: email.required(),
    name: name.required(),
    password: password.required(),
  }),

  login: Joi.object({
    email: email.required(),
    password: Joi.string().required(),
  }),

  // ---------- users ----------
  userQuery: Joi.object(paginationFields),

  userCreate: Joi.object({
    email: email.required(),
    name: name.required(),
    password: password.required(),
    role: Joi.string().valid(...ROLES),
  }),

  userUpdate: Joi.object({ email, name, password }).min(1),

  roleUpdate: Joi.object({
    role: Joi.string().valid(...ROLES).required(),
  }),

  // ---------- posts ----------
  postQuery: Joi.object({
    search: Joi.string().trim().min(1),
    published: Joi.boolean(),
    authorId: Joi.number().integer().min(1),
    ...paginationFields,
  }),

  // authorId берётся из токена (req.user.id), а не из тела запроса
  postCreate: Joi.object({
    title: Joi.string().trim().min(1).max(200).required(),
    content: Joi.string().allow('', null),
    published: Joi.boolean(),
    tags,
  }),

  postUpdate: Joi.object({
    title: Joi.string().trim().min(1).max(200),
    content: Joi.string().allow('', null),
    published: Joi.boolean(),
    tags,
  }).min(1),
};

// ---------- chat (Socket.io и REST) ----------
const roomName = Joi.string()
  .trim()
  .min(1)
  .max(chat.maxRoomNameLength)
  .pattern(/^[\p{L}\p{N}_-]+$/u)
  .messages({ 'string.pattern.base': 'room может содержать только буквы, цифры, _ и -' });
const messageContent = Joi.string().trim().min(1).max(chat.maxMessageLength);

Object.assign(schemas, {
  chatMessage: Joi.object({ content: messageContent.required() }),
  roomJoin: Joi.object({ room: roomName.required() }),
  roomMessage: Joi.object({ room: roomName.required(), content: messageContent.required() }),
  messageQuery: Joi.object({ room: roomName, ...paginationFields }),
});

function formatDetails(error, fallbackField) {
  return error.details.map((d) => ({
    field: d.path.join('.') || fallbackField,
    message: d.message.replace(/"/g, ''),
  }));
}

// Проверка данных вне Express (например, payload событий Socket.io)
function validatePayload(schema, data) {
  const { error, value } = schema.validate(data ?? {}, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  return error ? { error: formatDetails(error, 'payload') } : { value };
}

// Фабрика middleware: source — 'body' | 'query' | 'params'
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source] ?? {}, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: formatDetails(error, source),
      });
    }

    // В Express 5 req.query — только для чтения, поэтому кладём результат отдельно
    req.validated = { ...(req.validated || {}), [source]: value };
    next();
  };
}

module.exports = { validate, validatePayload, schemas, ROLES };
