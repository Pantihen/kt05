// Клиент может не передать callback — тогда ответ просто не отправляется
const ackOf = (ack) => (typeof ack === 'function' ? ack : () => {});

// Ошибки обработчиков не роняют сервер: логируем и отвечаем через ack
function withErrors(handler) {
  return async (payload, ack) => {
    try {
      await handler(payload, ack);
    } catch (err) {
      console.error(err);
      ackOf(ack)({ ok: false, error: 'Внутренняя ошибка сервера' });
    }
  };
}

module.exports = { ackOf, withErrors };
