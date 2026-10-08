// Pure text helpers for the menu-bar / tray progress display (kept free of Electron for unit tests).
const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const stages = { select: ['正在选取照片', '选图'], download: ['正在下载图片', '下载'], apply: ['正在设置壁纸', '设置'] };
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
  return `${stages[change.stage]?.[0] || '正在换图'}${extra ? ' ' + extra : ''}…`;
}
// Short form shown next to the macOS menu-bar icon. Empty string hides it.
function menuBarTitle(change, tick = 0, flash = null) {
  if (change) {
    const label = change.note ? '重试中' : stages[change.stage]?.[1] || '换图';
    const extra = change.note ? '' : amount(change);
    return `${spinner[tick % spinner.length]} ${label}${extra ? ' ' + extra : ''}`;
  }
  if (flash === 'ok') return '✓';
  if (flash === 'error') return '换图失败';
  return '';
}
function tooltip(change, { rotation = false, lastError = '' } = {}) {
  const base = `拾景 Scenelet${rotation ? ' · 自动轮换中' : ''}`;
  if (change) return `${base}\n${statusText(change)}`;
  if (lastError) return `${base}\n上次换图失败：${truncate(firstLine(lastError), 60)}`;
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
