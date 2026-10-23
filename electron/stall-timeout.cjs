function createStallTimeout(milliseconds, message) {
  const controller = new AbortController();
  let timer;
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(Object.assign(new Error(message), { name: 'TimeoutError' })), milliseconds);
  };
  const clear = () => clearTimeout(timer);
  return { signal: controller.signal, touch, clear, aborted: () => controller.signal.aborted };
}

module.exports = { createStallTimeout };
