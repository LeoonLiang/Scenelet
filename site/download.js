(() => {
  const repo = 'https://github.com/LeoonLiang/Scenelet';
  const platform = document.querySelector('#platform'), arch = document.querySelector('#arch');
  const button = document.querySelector('#recommended'), status = document.querySelector('#download-status');
  let release = null;
  const targets = [['win32', 'x64', false, 'Windows x64 · 安装版（推荐）'], ['win32', 'x64', true, 'Windows x64 · 便携版'], ['win32', 'arm64', false, 'Windows ARM64 · 安装版（推荐）'], ['win32', 'arm64', true, 'Windows ARM64 · 便携版'], ['darwin', 'arm64', false, 'macOS Apple Silicon · DMG（推荐）'], ['darwin', 'arm64', true, 'macOS Apple Silicon · ZIP'], ['darwin', 'x64', false, 'macOS Intel · DMG（推荐）'], ['darwin', 'x64', true, 'macOS Intel · ZIP']];
  function name(os, cpu, portable) { const version = release.tag_name.replace(/^v/, ''); return `Scenelet-${version}-${os === 'win32' ? 'windows' : 'macos'}-${cpu}-${os === 'win32' ? portable ? 'portable.zip' : 'setup.exe' : portable ? 'app.zip' : 'installer.dmg'}`; }
  function safeUrl(value) { try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith('/LeoonLiang/Scenelet/releases/download/') ? u.href : null; } catch { return null; } }
  function asset(os, cpu, portable = false) { if (!release) return null; return release.assets.find(a => a.name === name(os, cpu, portable) && safeUrl(a.browser_download_url)); }
  function render() {
    button.href = `${repo}/releases`; button.classList.remove('disabled'); button.removeAttribute('aria-disabled'); button.textContent = '查看发行版本 ↗';
    if (platform.value === 'other') { status.textContent = '暂不提供此系统的安装包。可以查看源码与发行版本。'; return; }
    if (!arch.value) { status.textContent = platform.value === 'darwin' ? '请在「关于本机」确认是 Apple 芯片还是 Intel，再选择架构。' : '请选择电脑的处理器架构。'; return; }
    if (!release) return;
    const selected = asset(platform.value, arch.value);
    if (!selected) { status.textContent = '这个系统 / 架构的安装包尚未发布，请查看全部发行版本。'; return; }
    button.href = safeUrl(selected.browser_download_url); button.classList.remove('disabled'); button.setAttribute('aria-disabled', 'false'); button.textContent = `下载 ${platform.value === 'darwin' ? arch.value === 'arm64' ? 'Apple Silicon DMG' : 'Intel DMG' : `Windows ${arch.value} 安装版`} ↗`;
    status.textContent = `${release.tag_name} · ${(selected.size / 1024 / 1024).toFixed(0)} MB · 来自官方 GitHub Releases`;
  }
  function renderAll() {
    const container = document.querySelector('#all-downloads'); container.replaceChildren();
    for (const [os, cpu, portable, label] of targets) { const found = asset(os, cpu, portable); const element = document.createElement(found ? 'a' : 'p'); element.textContent = label + (found ? '' : ' · 尚未发布'); if (found) element.href = safeUrl(found.browser_download_url); container.append(element); }
  }
  platform.addEventListener('change', render); arch.addEventListener('change', render);
  async function detect() {
    const ua = navigator.userAgent;
    platform.value = /Windows/i.test(ua) ? 'win32' : /Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua) ? 'darwin' : 'other';
    if (platform.value === 'win32') arch.value = /ARM64|aarch64/i.test(ua) ? 'arm64' : 'x64';
    try { const info = await navigator.userAgentData?.getHighEntropyValues(['architecture']); if (info?.architecture === 'arm') arch.value = 'arm64'; else if (info?.architecture === 'x86') arch.value = 'x64'; } catch {}
    render();
  }
  async function load() {
    try {
      const response = await fetch('https://api.github.com/repos/LeoonLiang/Scenelet/releases/latest', { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
      if (response.status === 404) { document.querySelector('#release-version').textContent = '首个正式版本准备中'; status.textContent = '发行包通过检查后会在这里提供下载。'; button.classList.remove('disabled'); button.removeAttribute('aria-disabled'); return; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json(); if (!/^v?\d+\.\d+\.\d+$/.test(data.tag_name) || data.draft || data.prerelease || !Array.isArray(data.assets)) throw new Error('版本数据不正确');
      release = data; document.querySelector('#release-version').textContent = `最新版本 ${data.tag_name}`; renderAll(); render();
    } catch { document.querySelector('#release-version').textContent = '下载信息暂时不可用'; status.textContent = '无法读取 GitHub。请点击按钮到 Releases 页面手动下载。'; button.removeAttribute('aria-disabled'); button.classList.remove('disabled'); }
  }
  renderAll(); void detect(); void load();
})();
