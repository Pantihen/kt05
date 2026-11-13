const express = require('express');
const { validate, schemas } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { listMessages } = require('../services/messages');

const router = express.Router();

router.use(authenticate);

// GET /api/messages?room=&page=&limit= — история чата (без room — общий чат)
router.get('/', validate(schemas.messageQuery, 'query'), async (req, res) => {
  res.json(await listMessages(req.validated.query));
});

module.exports = router;
