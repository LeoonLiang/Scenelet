const { execFileSync } = require('node:child_process');
const pkg = require('../package.json');
require('./check-release.cjs').check();
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) throw new Error('Commit all changes before tagging.');
if (execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim() !== 'main') throw new Error('Release tags must be created on main.');
const tag = `v${pkg.version}`;
execFileSync('git', ['tag', '-a', tag, '-m', `Scenelet ${tag}`], { stdio: 'inherit' });
console.log(`Created ${tag}. Push explicitly: git push origin main ${tag}. Actions will create a draft release.`);
