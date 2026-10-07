const fs = require('node:fs');
const path = require('node:path');
const { build, Platform, Arch } = require('electron-builder');
const pkg = require('../package.json');
const core = require('../electron/update-core.cjs');
const platform = process.argv[2] || process.platform;
const arch = process.argv[3] || process.arch;
if (!['win32', 'darwin'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw new Error('Use: node scripts/build-release.cjs win32|darwin x64|arm64');
const notes = require('./check-release.cjs').releaseNotes(pkg.version);
const config = { ...pkg.build, directories: { output: `release/v${pkg.version}/${platform}-${arch}` }, publish: { provider: 'github', owner: 'LeoonLiang', repo: 'Scenelet', channel: core.channel(arch), releaseType: 'draft' }, releaseInfo: { releaseNotes: notes }, generateUpdatesFilesForAllChannels: false };
if (platform === 'win32') config.win = { ...config.win, target: ['nsis', 'zip'] };
else config.mac = { ...config.mac, target: ['dmg', 'zip'] };
const target = platform === 'win32' ? Platform.WINDOWS : Platform.MAC;
build({ targets: target.createTarget(undefined, Arch[arch]), config, publish: 'never' }).then(files => {
  const dir = path.resolve(__dirname, '..', config.directories.output);
  const list = fs.readdirSync(dir).filter(name => /\.(exe|dmg|zip|yml|blockmap)$/.test(name));
  console.log('Release artifacts:', list.join('\n'));
  fs.writeFileSync(path.join(dir, 'release-notes.md'), notes);
}).catch(error => { console.error(error); process.exitCode = 1; });
