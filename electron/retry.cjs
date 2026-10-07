const { setTimeout: sleep } = require('node:timers/promises');
function isTransient(error) {
  if (error.status) return error.status === 408 || error.status >= 500 && error.status <= 599;
  const code = error.cause?.code || error.code || error.name;
  return ['TimeoutError', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code);
}
async function withRetry(work, { wait = sleep, onRetry = () => {}, shouldContinue = () => true } = {}) {
  const delays = [1000, 2000, 4000];
  for (let attempt = 0; ; attempt++) {
    if (!shouldContinue()) throw new Error('连接配置已修改，本次请求已取消。');
    try { return await work(); }
    catch (error) {
      if (!(error.retryable ?? isTransient(error))) throw error;
      if (attempt === delays.length) { const exhausted = new Error(`${error.message}\n已尝试 4 次（首次请求 + 3 次自动重试），仍未成功。`, { cause: error }); exhausted.attempts = 4; throw exhausted; }
      onRetry({ retry: attempt + 1, total: delays.length, delay: delays[attempt] });
      await wait(delays[attempt]);
    }
  }
}
module.exports = { withRetry, isTransient };
