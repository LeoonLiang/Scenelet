const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');
function releaseNotes(version) {
  const text = fs.readFileSync(path.join(__dirname, '../CHANGELOG.md'), 'utf8');
  const escaped = version.replace(/\./g, '\\.');
  const match = new RegExp(`^## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm').exec(text);
  if (!match || !match[1].trim() || /TODO|待填写/.test(match[1])) throw new Error(`CHANGELOG.md is missing complete notes for ${version}`);
  return match[1].trim() + '\n';
}
function check(tag = `v${pkg.version}`) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag) || tag !== `v${pkg.version}`) throw new Error('Tag must match package.json stable version');
  const lock = require('../package-lock.json'); if (lock.version !== pkg.version || lock.packages[''].version !== pkg.version) throw new Error('Lockfile version mismatch');
  const versionSource = fs.readFileSync(path.join(__dirname, '../src/version.ts'), 'utf8'); if (!versionSource.includes(`'${pkg.version}'`)) throw new Error('UI version mismatch');
  return releaseNotes(pkg.version);
}
if (require.main === module) { const notes = check(process.argv[2]); const output = process.argv[3]; if (output) fs.writeFileSync(output, notes); else console.log(notes); }
module.exports = { check, releaseNotes };
