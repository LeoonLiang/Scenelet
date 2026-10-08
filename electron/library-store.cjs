const fs = require('node:fs/promises');

const validPhoto = p => p && typeof p.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(p.id) && ['local', 'unsplash'].includes(p.source) && (p.source !== 'local' || typeof p.localPath === 'string');

function parseLibrary(text) {
  const value = JSON.parse(text);
  if (!value || !Array.isArray(value.photos) || !Array.isArray(value.favorites) || !value.settings || typeof value.settings !== 'object' ||
      !value.photos.every(validPhoto) ||
      !value.favorites.every(id => typeof id === 'string') ||
      (value.current != null && (typeof value.current !== 'object' || typeof value.current.id !== 'string' || (value.current.photo !== undefined && !validPhoto(value.current.photo)))) ||
      (value.history !== undefined && (!Array.isArray(value.history) || !value.history.every(h => h && typeof h.id === 'string'))) ||
      (value.playlists !== undefined && (!Array.isArray(value.playlists) || !value.playlists.every(p => p && typeof p.id === 'string' && Array.isArray(p.photoIds) && p.photoIds.every(id => typeof id === 'string')))) ||
      ['folders', 'ignoredPaths'].some(key => value[key] !== undefined && (!Array.isArray(value[key]) || !value[key].every(item => typeof item === 'string')))) throw new Error('Invalid library');
  return value;
}

async function loadLibrary(file) {
  try { return { data: parseLibrary(await fs.readFile(file, 'utf8')), recovery: '' }; }
  catch (error) {
    try { return { data: parseLibrary(await fs.readFile(file + '.bak', 'utf8')), recovery: 'backup' }; }
    catch {
      if (error.code === 'ENOENT') return { data: null, recovery: '' };
      // Preserve the unreadable file for inspection before any subsequent save.
      await fs.copyFile(file, file + `.corrupt-${Date.now()}`);
      return { data: null, recovery: 'unavailable' };
    }
  }
}

async function writeLibrary(file, snapshot) {
  parseLibrary(snapshot);
  try {
    const previous = await fs.readFile(file, 'utf8');
    parseLibrary(previous);
    await fs.writeFile(file + '.bak.tmp', previous, 'utf8');
    await fs.rename(file + '.bak.tmp', file + '.bak');
  } catch (error) {
    if (error.code && error.code !== 'ENOENT') throw error;
    // Never replace a valid backup with an unreadable primary file.
  }
  await fs.writeFile(file + '.tmp', snapshot, 'utf8');
  await fs.rename(file + '.tmp', file);
}
module.exports = { parseLibrary, loadLibrary, writeLibrary };
