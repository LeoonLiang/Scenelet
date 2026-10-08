// Pure text helpers for the menu-bar / tray progress display (kept free of Electron for unit tests).
const { t } = require('./i18n.cjs');
const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const stageKey = stage => ['select', 'download', 'apply'].includes(stage) ? `stage.${stage}` : 'stage.default';
function truncate(text, max = 24) {
  const chars = [...String(text || '')];
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join('');
}
function percent(change) {
  return change?.total > 0 ? Math.min(100, Math.floor(change.received / change.total * 100)) : null;
}
function amount(change) {
  if (change?.stage !== 'download') return '';
  const pct = percent(change);
  if (pct !== null) return `${pct}%`;
  return change.received > 0 ? `${(change.received / 1048576).toFixed(1)} MB` : '';
}
// Long form for the tray menu, tooltip and the app window.
function statusText(change) {
  if (!change) return '';
  if (change.note) return change.note;
  const extra = amount(change);
  return `${t(stageKey(change.stage))}${extra ? ' ' + extra : ''}…`;
}
// Short form shown next to the macOS menu-bar icon. Empty string hides it.
function menuBarTitle(change, tick = 0, flash = null) {
  if (change) {
    const label = t(change.note ? 'stage.retry.short' : `${stageKey(change.stage)}.short`);
    const extra = change.note ? '' : amount(change);
    return `${spinner[tick % spinner.length]} ${label}${extra ? ' ' + extra : ''}`;
  }
  if (flash === 'ok') return '✓';
  if (flash === 'warning') return '⚠';
  if (flash === 'error') return t('tray.failed');
  return '';
}
function tooltip(change, { rotation = false, lastError = '', lockScreenWarning = '' } = {}) {
  const base = `${t('app.tooltip')}${rotation ? t('tray.rotating') : ''}`;
  if (change) return `${base}\n${statusText(change)}`;
  if (lastError) return `${base}\n${t('tray.lastError', { reason: truncate(firstLine(lastError), 60) })}`;
  if (lockScreenWarning) return `${base}\n${t('warn.lockScreen')}`;
  return base;
}
function firstLine(message) { return String(message || '').split('\n')[0]; }
// Menu rebuilds are throttled to stage changes and 10% steps; title/tooltip update on every tick.
function menuKey(change) {
  if (!change) return '';
  const pct = percent(change);
  return [change.stage, change.note || '', pct === null ? '' : Math.floor(pct / 10)].join('|');
}
module.exports = { spinner, truncate, percent, statusText, menuBarTitle, tooltip, firstLine, menuKey };
