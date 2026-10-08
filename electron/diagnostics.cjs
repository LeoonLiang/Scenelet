const { t } = require('./i18n.cjs');
function redact(value, secret = '') {
  let text = String(value || t('diag.unknown'));
  if (secret) text = text.split(secret).join(t('diag.keyHidden'));
  return text.replace(/(Client-ID\s+)[\w-]+/gi, `$1${t('diag.hidden')}`).replace(/((?:client_id|access_key|secret_key)=)[^&\s]+/gi, `$1${t('diag.hidden')}`).slice(0, 3000);
}
function serviceError(status, endpoint, details, remaining, secret) {
  const hint = t([401, 403, 404, 429, 500, 503].includes(status) ? `diag.${status}` : 'diag.default');
  return redact(`${hint}\nHTTP ${status} · GET ${endpoint}\n${remaining !== null ? `${t('diag.remaining', { remaining })}\n` : ''}${details ? t('diag.reason', { details }) : t('diag.noReason')}`, secret);
}
function networkError(error, endpoint, secret) {
  const original = error.attempts ? error.cause : error;
  const reason = original.cause?.code || original.code || original.name || 'NETWORK_ERROR';
  const hint = t(/Timeout|ABORT|ETIMEDOUT/i.test(reason) ? 'diag.timeout' : 'diag.network');
  return redact(`${hint}\n${t('diag.request', { endpoint })}\n${t('diag.error', { reason: `${reason} · ${original.cause?.message || original.message}` })}${error.attempts ? `\n${t('retry.exhausted')}` : ''}`, secret);
}
module.exports = { redact, serviceError, networkError };
