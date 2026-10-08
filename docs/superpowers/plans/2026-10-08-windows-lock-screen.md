# Windows Lock Screen Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Synchronize Windows lock screen with each wallpaper change, with an opt-in migration for existing users and independent failure reporting.

**Architecture:** Keep desktop and lock-screen operations separate in `electron/native-wallpaper.cjs`. All manual, tray and automatic changes use the existing `apply` pipeline, persisting desktop success through an awaited callback before optional lock-screen synchronization begins. Normalize persisted preferences with explicit legacy migration and expose warning state through existing snapshots.

**Tech Stack:** Electron, CommonJS, Windows PowerShell / WinRT, React / TypeScript, node:test.

## Global Constraints

- Windows only; macOS continues to use its current AppleScript behavior.
- New installs enable synchronization; existing installs remain disabled until the user opts in.
- No new dependencies, administrator privileges, or registry policy changes.
- Paths travel as arguments/environment values, never interpolated script source.
- Lock-screen failure must not reject a successful desktop change or stop rotation.
- Native Windows 10/11, x64/ARM64, NSIS/ZIP and Spotlight compatibility require actual Windows verification; this macOS workspace cannot establish that.

### Task 1: Preferences and native operation

**Files:** `electron/core.cjs`, new `electron/native-wallpaper.cjs`, new `electron/lock-screen.ps1`, new `tests/wallpaper.test.cjs`.

**Interfaces:** `restoreSettings(input, platform)` migrates previously saved settings. Settings add `syncLockScreen: boolean` and `lockScreenPrompt: boolean`. `createWallpaperService({ run, platform, env, arch })` produces `setDesktop(file, fit)` and `apply(file, settings, onDesktopApplied?)`; `apply` returns `{ lockScreen: 'disabled' | 'synced' | 'failed', error?: string }`.

- [x] Write failing tests for defaults/migration, strict boolean normalization, both-target success, disabled sync, desktop failure, recoverable lock-screen failure, safe Unicode paths and non-Windows behavior. Example: `assert.equal(restoreSettings({ interval: 60 }, 'win32').syncLockScreen, false)`; after a simulated second process failure, `assert.equal((await service.apply(file, settings)).lockScreen, 'failed')`.
- [x] Run `node --test tests/wallpaper.test.cjs` and confirm failures from missing behavior.
- [x] Add migration, extract existing desktop behavior, and implement awaited `StorageFile.GetFileFromPathAsync` / `LockScreen.SetImageFileAsync` in fixed PowerShell with a bounded process timeout.
- [x] Re-run the focused tests and confirm success.

### Task 2: Integration and user feedback

**Files:** `electron/main.cjs`, `electron/tray-status.cjs`, `electron/i18n.cjs`, `src/types.ts`, `src/data.ts`, `src/App.tsx`, `src/pages/SettingsPage.tsx`, new `src/components/LockScreenNotice.tsx`, `src/styles.css`, `src/i18n/{zh,en}.ts`, `tests/tray-status.test.cjs`, new `tests/wallpaper-integration.test.cjs`.

**Interfaces:** Snapshot adds optional `lockScreenWarning: string`; warning does not enter `error`. `LockScreenNotice` consumes platform, settings, warning, busy, settings change callback and settings navigation callback. Acknowledging the prompt writes `{ syncLockScreen: true, lockScreenPrompt: false }` or `{ syncLockScreen: false, lockScreenPrompt: false }`.

- [x] Test the real main-process pipeline with Electron/OS boundaries replaced: all three origins update current/history, persist preferences, and continue rotation on lock-screen failure. Test warning tooltip independently from full failure.
- [x] Route `apply` through the service; capture warning and publish desktop success. Keep `setNativeWallpaper` as desktop-only for the existing restoring smoke check.
- [x] Add warning tray/notification states, a persistent UI warning with details, Windows-only toggle and upgrade prompt, including Chinese/English copy. Enabling applies from the next wallpaper change, stated in the prompt.
- [x] Run focused integration tests and `npm run build`.

### Task 3: Verification and documentation

**Files:** `CHANGELOG.md`, `docs/architecture.md`, `docs/development.md`, this plan.

- [x] Document settings, partial success and the Windows acceptance matrix: manual/next/tray/rotation, enabled/disabled, fresh/upgrade/restart, denied-by-policy, Spotlight, Unicode image path, installation/portable package, x64/ARM64, Windows 10/11.
- [x] Run `npm test`, `npm run build`, `git diff --check`; inspect the UI using a browser preview without changing the host wallpaper.
- [x] Request an independent read-only code review; resolve confirmed issues and rerun affected checks.
- [x] Report completed behavior and the remaining native Windows verification boundary. Leave changes in the workspace; no commit or publication requested.

## Verification record

- Red/green tests covered preference migration, independent native results and all main-process origins. A review found delayed desktop persistence during lock sync; a deferred-operation regression failed before the fix and passed after moving persistence into the desktop-success callback.
- Independent follow-up review found no remaining code issues in revised paths.
- Browser preview uses a simulated Windows API at `artifacts/lock-screen-preview.html`; no host wallpaper was changed.
- Native Windows acceptance remains pending; documentation records the required matrix.
