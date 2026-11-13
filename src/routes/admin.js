const express = require('express');
const { prisma } = require('../config');
const { validate, schemas } = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorize('ADMIN'));

// PATCH /admin/users/:id/role — сменить роль пользователя (только ADMIN)
router.patch(
  '/users/:id/role',
  validate(schemas.idParam, 'params'),
  validate(schemas.roleUpdate),
  async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.validated.params.id },
      data: { role: req.validated.body.role },
    });
    res.json(user);
  }
);

module.exports = router;
