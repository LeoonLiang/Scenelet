function redact(value, secret = '') {
  let text = String(value || '未知错误');
  if (secret) text = text.split(secret).join('[Key 已隐藏]');
  return text.replace(/(Client-ID\s+)[\w-]+/gi, '$1[已隐藏]').replace(/((?:client_id|access_key|secret_key)=)[^&\s]+/gi, '$1[已隐藏]').slice(0, 3000);
}
function serviceError(status, endpoint, details, remaining, secret) {
  const hints = { 401: 'Access Key 无效或已停用，请检查 Access Key（不是 Secret Key）。', 403: '服务拒绝访问，请检查 Key 权限或配额。', 429: '请求过于频繁或配额已用尽，请稍后重试。', 404: '未找到来源或符合条件的照片，请检查用户名、Collection ID 与方向筛选。', 500: 'Unsplash 服务暂时异常，请稍后重试。', 503: 'Unsplash 服务暂时不可用，请稍后重试。' };
  return redact(`${hints[status] || 'Unsplash 请求失败，请重试。'}\nHTTP ${status} · GET ${endpoint}\n${remaining !== null ? `剩余请求：${remaining}\n` : ''}${details ? `服务端原因：${details}` : '服务端未提供进一步原因。'}`, secret);
}
function networkError(error, endpoint, secret) {
  const original = error.attempts ? error.cause : error;
  const reason = original.cause?.code || original.code || original.name || 'NETWORK_ERROR';
  const hint = /Timeout|ABORT|ETIMEDOUT/i.test(reason) ? '请求超时，请检查网络后重试。' : '无法连接服务，请检查网络、代理或防火墙。';
  return redact(`${hint}\n请求：${endpoint}\n错误：${reason} · ${original.cause?.message || original.message}${error.attempts ? '\n已尝试 4 次（首次请求 + 3 次自动重试），仍未成功。' : ''}`, secret);
}
module.exports = { redact, serviceError, networkError };
