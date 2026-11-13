const EVENTS = require('../events');
const { publicUser } = require('../presence');
const { validatePayload, schemas } = require('../../middleware/validate');
const { createMessage, getRecentMessages } = require('../../services/messages');
const { ackOf, withErrors } = require('./utils');

// Префикс, чтобы имена комнат не пересекались с id сокетов
const channel = (room) => `room:${room}`;

module.exports = function registerRoomHandlers(io, socket) {
  const { user } = socket.data;
  const isMember = (room) => socket.rooms.has(channel(room));

  // room:join { room } -> ack с историей последних сообщений
  socket.on(
    EVENTS.ROOM_JOIN,
    withErrors(async (payload, ack) => {
      const reply = ackOf(ack);
      const { value, error } = validatePayload(schemas.roomJoin, payload);
      if (error) return reply({ ok: false, error: 'Validation error', details: error });

      const { room } = value;
      if (!isMember(room)) {
        await socket.join(channel(room));
        socket.to(channel(room)).emit(EVENTS.ROOM_USER_JOINED, { room, user: publicUser(user) });
      }

      reply({ ok: true, room, history: await getRecentMessages(room) });
    })
  );

  // room:leave { room }
  socket.on(
    EVENTS.ROOM_LEAVE,
    withErrors(async (payload, ack) => {
      const reply = ackOf(ack);
      const { value, error } = validatePayload(schemas.roomJoin, payload);
      if (error) return reply({ ok: false, error: 'Validation error', details: error });

      const { room } = value;
      if (!isMember(room)) return reply({ ok: false, error: `Вы не состоите в комнате ${room}` });

      await socket.leave(channel(room));
      socket.to(channel(room)).emit(EVENTS.ROOM_USER_LEFT, { room, user: publicUser(user) });
      reply({ ok: true, room });
    })
  );

  // room:message { room, content } -> участникам комнаты room:message
  socket.on(
    EVENTS.ROOM_MESSAGE,
    withErrors(async (payload, ack) => {
      const reply = ackOf(ack);
      const { value, error } = validatePayload(schemas.roomMessage, payload);
      if (error) return reply({ ok: false, error: 'Validation error', details: error });

      const { room, content } = value;
      if (!isMember(room)) {
        return reply({ ok: false, error: `Сначала войдите в комнату ${room} (room:join)` });
      }

      const message = await createMessage({ authorId: user.id, content, room });
      io.to(channel(room)).emit(EVENTS.ROOM_MESSAGE, message);
      reply({ ok: true, message });
    })
  );

  // При отключении сообщаем комнатам, что пользователь вышел
  socket.on('disconnecting', () => {
    for (const name of socket.rooms) {
      if (name.startsWith('room:')) {
        const room = name.slice('room:'.length);
        socket.to(name).emit(EVENTS.ROOM_USER_LEFT, { room, user: publicUser(user) });
      }
    }
  });
};
