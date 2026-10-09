import { useEffect, useRef, useState } from 'react';
import type { AppState, DesktopAPI, PhotoBatchState } from '../types';
import { demoPhotos } from '../data';
import { matches } from '../lib/sources';

export function usePhotoBatch(api: DesktopAPI | undefined, state: AppState, initialized: boolean, onError: (error: unknown) => void) {
  const [batch, setBatch] = useState<PhotoBatchState | null>(null);
  const [loading, setLoading] = useState(false);
  const settings = state.settings;
  const source = settings.rotationSource === 'online' ? settings.onlineSource : { kind: settings.rotationSource, value: '' };
  const key = JSON.stringify([source.kind, source.value, settings.orientation, settings.minWidth]);
  const keyRef = useRef(key); keyRef.current = key;
  const operation = useRef(0);
  const lastRevision = useRef(0);
  const available = initialized && (settings.rotationSource !== 'online' || !api || state.connected);
  const accept = (result: PhotoBatchState) => { if (result.key === keyRef.current && result.revision >= lastRevision.current) { lastRevision.current = result.revision; setBatch(result); } };

  async function refresh(replace = true) {
    const token = ++operation.current, requestedKey = key;
    setLoading(true);
    try {
      if (api) { const result = await api.batch({ refresh: replace }); if (token === operation.current) accept(result); }
      else {
        const pool = (settings.rotationSource === 'online' ? demoPhotos() : settings.rotationSource === 'favorites' ? state.photos.filter(p => state.favorites.includes(p.id)) : state.photos.filter(p => p.source === 'local' || p.imported)).filter(p => !p.missing && matches(p, settings));
        const shuffled = [...pool];
        for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
        const photos = shuffled.slice(0, 12);
        accept({ key, photos, selectedId: photos[0]?.id || '', revision: ++lastRevision.current });
      }
    } catch (error) { if (requestedKey === keyRef.current && token === operation.current) onError(error); }
    finally { if (token === operation.current) setLoading(false); }
  }
  async function select(id?: string) {
    if (loading || !batch) return;
    const token = operation.current, requestedKey = key;
    try {
      if (api) accept(await api.selectBatch({ id }));
      else {
        const choices = batch.photos.filter(p => p.id !== batch.selectedId);
        setBatch({ ...batch, selectedId: id ?? choices[Math.floor(Math.random() * choices.length)]?.id ?? batch.selectedId });
      }
    } catch (error) { if (token === operation.current && requestedKey === keyRef.current) onError(error); }
  }
  useEffect(() => api?.onBatch(accept), [api]);
  useEffect(() => {
    operation.current++;
    setBatch(null);
    if (available) void refresh(false);
    else { operation.current++; setLoading(false); }
  }, [key, available]);
  return { batch: batch?.key === key ? batch : null, loading, refresh, select };
}
