# Photo batches Implementation Plan

> **For agentic workers:** Execute this plan task-by-task in the current session. Review the finished change with the requesting-code-review skill.

**Goal:** Let users inspect a stable batch from their chosen source on Home and in a left-click tray panel, refresh explicitly, randomly select a preview, and apply their selection.

**Architecture:** A main-process batch store owns random candidate photos, recent display history and selected ID. Both React surfaces consume the same IPC state; hiding the tray panel preserves its renderer. Source/filter changes invalidate the batch, unrelated settings and wallpaper changes do not.

**Tech Stack:** Electron, React, TypeScript, node:test, real Electron experience tests.

## Global Constraints

- Selecting a source collapses its controls and loads candidates without applying a wallpaper.
- Opening or closing the tray never replaces the batch.
- Refresh replaces candidates; random selection changes the selected preview, not the batch.
- Keep right-click tray commands, source filters, local imports, attribution, favorites, download and rotation available.
- Keep Chinese and English messages complete.

### Task 1: Shared candidate state

Files: electron/photo-batch.cjs, electron/main.cjs, electron/preload.cjs, src/types.ts, tests/photo-batch.test.cjs.

- [x] Add tests for cached reads, shared in-flight loads, explicit refresh, source changes, stale results, failure preservation, unique candidates and random selection without applying.
- [x] Run `node --test tests/photo-batch.test.cjs` and confirm missing implementation failures.
- [x] Implement `createPhotoBatch({ randomPhotos, localPhotos, publish })` with `get(settings, refresh)` and `select(settings, id)`; expose batch / select-batch and onBatch IPC.
- [x] Run the targeted tests.

### Task 2: Home and tray picker

Files: src/components/PhotoBatch.tsx, src/App.tsx, src/pages/HomePage.tsx, src/components/SourcePanel.tsx, src/styles.css, src/i18n/zh.ts, src/i18n/en.ts, electron/main.cjs, electron/i18n.cjs.

- [x] Add real Electron assertions for collapsing the source, selecting a preview without applying, explicit apply, refresh and reopening the tray.
- [x] Implement a shared preview / thumbnails / actions component, collapsed source summary and a frameless tray window anchored within the screen work area.
- [x] Keep the tray window alive when hidden and validate both renderer IPC senders.
- [x] Rename direct next-wallpaper commands to random wallpaper and enforce shuffle for manual random actions.
- [ ] Rerun the expanded native experience checks and inspect final Home/tray screenshots. Earlier Home selection / apply checks passed, but the final tray rerun is blocked by the approval service disconnecting (including after explicit user approval).

### Task 3: Verification and documentation

Files: README.md, tests/experience-electron.cjs.

- [x] Document choosing a batch and left / right click behavior.
- [x] Run `npm test` and `npm run build`; run the earlier Home experience checks.
- [ ] Complete the expanded `npm run test:experience` run after the approval service recovers.
- [x] Review the resulting diff and fix actionable findings; report any unverified OS behavior.

Review fixes: preserve normal application exit after a picker was created, reconcile removed local candidates and newly populated empty pools, reject stale source requests by entry identity and renderer revision. Node integration tests also cover actual tray click handlers with simulated Electron windows, IPC frame validation and window reuse.

## Follow-up: compact Home and genuinely random batches

User feedback: keep source controls collapsed after every source-setting flow, keep the Home picker visible even while editing, and stop walking ordered pages for new batches.

- [x] Home: keep a one-line source summary with an explicit expand/collapse control; confirmation and gallery `start()` both collapse it. Keep `batchPanel` mounted and fold the duplicate current-wallpaper section.
- [x] Random batches: `fetchRandomBatch(source, settings, fetchAPI, recentIds)` calls `/photos/random` within the selected source; fetch at most 3 samples, filter/deduplicate, shuffle, and prefer candidates not seen in the last 72 displayed photos. Reuse topic slug resolution from single-wallpaper random selection. Remove batch page/cursor state.
- [ ] Test random endpoint/source filters, bounded retries, repeat avoidance, stable reopening, and Home collapse through direct confirmation and gallery return. Build, run Node regressions and retry the already-authorized isolated Electron UI suite.

Follow-up validation: scoped random endpoint, author/dimension filtering, bounded fallback, recent-batch avoidance and main/tray topic resolution covered by Node tests. Build passes; independent review found no actionable issue. The previously authorized native UI suite remains blocked by approval-service connection failures, so the new source-collapse/gallery-return assertions have not yet run in a real window.

## Follow-up: adaptive monitor mockup on Home

- [x] Create `src/components/DesktopPreview.tsx` for a CSS-drawn display bezel, stand and wallpaper viewport. Use physical primary-display dimensions supplied by Electron; use browser screen dimensions as fallback. Fit inside the Home card on landscape, ultrawide and portrait screens without altering the simulated display ratio. Keep the tray preview compact.
- [x] Add a pure `src/lib/display-preview.ts` helper and behavior tests for fill cropping, contain letterboxing, stretch and native-pixel centering; no screenshot-copying or bitmap mockup assets.
- [x] Pass display/layout data into PhotoBatch, move photo metadata outside the simulated screen, and react to display configuration changes.
- [ ] Build and run relevant checks; extend the isolated UI assertions for display ratio, resize containment and image replacement. Report any remaining native verification block.

Monitor preview verification: 125 Node tests passed, one Windows-only check skipped; production build passed. Added native ratio/resize/tray-isolation assertions, but real-window rendering is still unverified: the browser layout-preview request was not executed because automatic approval review disconnected. Reviewed and fixed platform-mode and remote download-size discrepancies; macOS is explicitly labeled as a system-layout illustration.
