function rotationKey(settings) {
  return JSON.stringify([settings.rotation, settings.interval, settings.rotationSource,
    settings.rotationSource === 'online' ? settings.onlineSource : null,
    settings.orientation, settings.minWidth, settings.order]);
}
function deadline(settings, saved, now = Date.now()) {
  if (!settings.rotation) return null;
  return Number.isFinite(saved) && saved > 0 ? saved : now + settings.interval * 60000;
}
function screenQuality(displays) {
  const width = Math.max(1920, ...displays.map(d => Math.round(d.size.width * (d.scaleFactor || 1))));
  return String([1920, 2560, 3840].find(value => value >= width) || width);
}
module.exports = { rotationKey, deadline, screenQuality };
