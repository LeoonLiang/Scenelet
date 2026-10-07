const { spawn } = require('node:child_process');
const path = require('node:path');
const project = path.resolve(__dirname, '..');
const children = [];
let stopped = false;
function stop(code = 0) { if (stopped) return; stopped = true; children.forEach(p => p.kill()); process.exitCode = code; }
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
const vite = spawn(process.execPath, [path.join(project, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], { cwd: project, stdio: 'inherit', windowsHide: true });
children.push(vite); vite.on('error', e => { console.error(e.message); stop(1); }); vite.on('exit', code => stop(code || 0));
(async () => {
  let ready = false;
  for (let i = 0; i < 100 && !stopped; i++) { try { const r = await fetch('http://127.0.0.1:5173'); if (r.ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 200)); }
  if (!ready || stopped) { stop(1); return; }
  const desktop = spawn(require('electron'), ['.', '--dev'], { cwd: project, stdio: 'inherit', windowsHide: true }); children.push(desktop);
  desktop.on('error', e => { console.error(e.message); stop(1); }); desktop.on('exit', code => stop(code || 0));
})().catch(e => { console.error(e.message); stop(1); });
