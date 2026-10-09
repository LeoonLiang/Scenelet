export type Photo = { imported?: boolean; missing?: boolean; id: string; source: 'local' | 'unsplash' | 'demo'; title: string; width: number; height: number; thumb: string; full: string; color?: string; author: string; username?: string; link?: string; authorUrl?: string; createdAt?: string };
export type OnlineSource = { kind: string; value: string; name: string };
export type UpdateStatus = { mode: 'automatic' | 'manual' | 'disabled'; state: 'idle' | 'checking' | 'current' | 'downloading' | 'available' | 'downloaded' | 'ready' | 'error'; currentVersion: string; version: string; percent: number; message: string; url: string; packageType?: 'dmg' | 'zip' };
export type Settings = { language: 'system' | 'zh' | 'en'; interval: number; rotation: boolean; order: string; rotationSource: string; fit: string; creditStyle: string; syncLockScreen: boolean; lockScreenPrompt: boolean; autostart: boolean; minimizeToTray: boolean; quality: string; cacheLimit: number; orientation: string; minWidth: number; onlineSource: OnlineSource; settingsRevision?: number };
export type Playlist = { id: string; name: string; photoIds: string[] };
export type AppState = { previousAvailable?: boolean; recovery?: string; nextRotationAt?: number | null; photos: Photo[]; favorites: string[]; playlists: Playlist[]; history: { id: string; appliedAt: string }[]; current: { id: string; appliedAt: string; photo?: Photo } | null; settings: Settings; connected: boolean; desktop: boolean; platform: string; screens: { id: number; width: number; height: number; primary: boolean }[]; error?: string; lockScreenWarning?: string; importFailed?: number };
export type Query = { kind: string; value: string; page: number; sort: string; orientation: string; minWidth: number };
export type QueryResult = { photos: Photo[]; hasMore: boolean; nextPage: number; remaining: string | null };
export interface DesktopAPI {
  updateStatus(): Promise<UpdateStatus>;
  checkUpdate(): Promise<UpdateStatus>;
  installUpdate(): Promise<void>;
  openDownloadedUpdate(): Promise<void>;
  openUpdate(): Promise<void>;
  onUpdater(callback: (status: UpdateStatus) => void): () => void;
  bootstrap(): Promise<AppState>;
  query(q: Query): Promise<QueryResult>;
  connect(key: string): Promise<AppState>;
  credential(): Promise<string>;
  disconnect(): Promise<AppState>;
  import(): Promise<AppState>;
  favorite(data: { id: string }): Promise<AppState>;
  playlist(data: { action: string; id?: string; name?: string; photoId?: string }): Promise<AppState>;
  settings(data: Settings): Promise<AppState>;
  wallpaper(data: { id: string }): Promise<AppState>;
  next(): Promise<AppState>;
  previous(): Promise<AppState>;
  rescanLibrary(): Promise<AppState>;
  removePhoto(data: { id: string }): Promise<AppState>;
  relinkPhoto(data: { id: string }): Promise<AppState>;
  dismissRecovery(): Promise<AppState>;
  download(data: { id: string }): Promise<{ canceled: boolean }>;
  cache(): Promise<{ bytes: number; files: number }>;
  clearCache(): Promise<{ bytes: number; files: number }>;
  openLink(data: { url: string }): Promise<void>;
  /** Opens a new GitHub issue in the browser. */
  feedback(): Promise<void>;
  /** Hides every window so the real desktop shows; they come back when Scenelet is reopened. */
  showDesktop(): Promise<void>;
  /** Copies a share message (with the Unsplash link) for this photo to the clipboard. */
  share(data: { id: string }): Promise<void>;
  /** Saves a previewed Unsplash photo to the library without applying it. */
  importShared(data: { id: string }): Promise<AppState>;
  /** Loads the photo from a pasted share message; reads the clipboard when no text is given. */
  openShared(data: { text?: string }): Promise<Photo>;
  onUpdate(callback: (state: AppState) => void): () => void;
  onProgress(callback: (message: string) => void): () => void;
  /** Wallpaper change status (from the tray, auto rotation or the window); empty string when idle. */
  onChanging(callback: (status: string) => void): () => void;
}
declare global { interface Window { framewall?: DesktopAPI } }
