const repository = 'LeoonLiang/Scenelet';
const releasesUrl = `https://github.com/${repository}/releases`;
function channel(arch) { if (!['x64', 'arm64'].includes(arch)) throw new Error('Unsupported update architecture'); return `latest-${arch}`; }
function version(tag) { const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag || ''); return match ? match.slice(1).map(Number) : null; }
function newer(next, current) { const a = version(next), b = version(current); if (!a || !b) return false; for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; }
function assetName(tag, platform, arch, portable = false) {
  if (!version(tag) || !['win32', 'darwin'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw new Error('Invalid release target');
  const v = tag.replace(/^v/, '');
  return `Scenelet-${v}-${platform === 'win32' ? 'windows' : 'macos'}-${arch}-${platform === 'win32' ? portable ? 'portable.zip' : 'setup.exe' : portable ? 'app.zip' : 'installer.dmg'}`;
}
function trustedReleaseUrl(value) { const url = new URL(value); if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith(`/${repository}/releases`) || !/^\/LeoonLiang\/Scenelet\/releases(?:\/latest|\/tag\/[^/]+|\/download\/[^/]+\/[^/]+)?$/.test(url.pathname)) throw new Error('更新链接必须来自 Scenelet 官方 GitHub Releases。'); return url.toString(); }
module.exports = { repository, releasesUrl, channel, version, newer, assetName, trustedReleaseUrl };
