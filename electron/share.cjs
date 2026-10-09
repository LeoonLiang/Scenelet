// Sharing a wallpaper is plain text with an Unsplash photo link: it reads fine in any chat app,
// opens in a browser for people without Scenelet, and Scenelet turns it back into the photo when pasted.
const { t } = require('./i18n.cjs');

const truncate = (text, max) => text.length > max ? `${text.slice(0, max - 1)}…` : text;

function shareText(photo) {
  if (photo?.source !== 'unsplash' || !/^[a-zA-Z0-9_-]{1,100}$/.test(photo.id || '')) throw new Error(t('err.shareLocal'));
  const title = truncate(String(photo.title || '').replace(/\s+/g, ' ').trim() || 'Untitled', 60);
  return t('share.text', { title, author: photo.author || 'Unsplash', url: `https://unsplash.com/photos/${photo.id}` });
}

// Accepts unsplash.com/photos/<id> and the newer unsplash.com/photos/<slug>-<id> form, anywhere in the text.
// Unsplash ids are 11 characters and may themselves contain "-" or "_".
function parseShared(text) {
  const match = /(?:^|[^a-zA-Z0-9.-])(?:www\.)?unsplash\.com\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?photos\/([a-zA-Z0-9_-]{1,200})/.exec(String(text || ''));
  if (!match) return null;
  const segment = match[1];
  if (segment.length > 11 && segment[segment.length - 12] === '-') return segment.slice(-11);
  return segment.length <= 100 ? segment : null;
}

module.exports = { shareText, parseShared };
