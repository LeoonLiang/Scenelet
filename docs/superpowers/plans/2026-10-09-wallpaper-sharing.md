# Wallpaper sharing and import Implementation Plan

> Execute inline in this session, with a failing integration test before implementation and a final review.

**Goal:** Share a specific Unsplash wallpaper and recover exactly that photo through the existing import entry.

**Architecture:** Keep the public Unsplash photo URL as the portable identifier. A unified import dialog offers local files and a link form with metadata preview and explicit confirmation. Confirmed links persist as imported Unsplash records in My Library, retaining attribution and sharing support.

**Tech Stack:** React, TypeScript, Electron IPC, Node test runner.

## Constraints

- Remove the standalone home paste button.
- Pasting outside an input opens the same import confirmation flow.
- No automatic wallpaper change or library write during preview.
- Local imports continue working. Remote imports require an Unsplash key.
- Keep Chinese and English copy aligned.

## Steps

- [x] Add main-process integration tests for share → exact photo resolution → explicit import → persisted library membership, duplicates, removal, invalid links, and missing credentials. Run `node --test tests/share-integration.test.cjs` and observe the missing import handler fail.
- [x] Add `importShared({ id })` IPC: validate the loaded Unsplash record, mark `imported: true`, upsert into state.photos, save and publish. Include these records in the library rotation pool and support removal without deleting remote assets.
- [x] Add `ImportDialog.tsx`: native modal with local import, link text input, clipboard paste, metadata preview, retryable inline errors and explicit Import confirmation. Wire all existing import buttons and global paste into it. Show imported photos in My Library; keep local-only relink controls.
- [x] Keep sharing on individual photo previews and add it to the current photo. Explain the return path in share text and copied feedback.
- [ ] Extend real Electron experience coverage for sharing through IPC, importing from the UI, exact identity, persistence, cancellation, invalid input, and local import entry. Run `npm test`, `npm run build`, and `npm run test:experience`; inspect the import screenshot.
- [x] Review the final diff and resolve material issues.

## Verification record

- Main-process integration test failed on missing import IPC before implementation, then passed. The refreshed-record removal regression failed before the membership fix and passed afterward.
- Production build passed. Full Node suite: 101 passed, 1 platform-specific test skipped.
- Electron runs exercised sharing, invalid-link recovery, exact-photo preview, confirmation, persistence, and local import. Inspected import.png. The second run ended on a test expectation missing the local file extension, which has been corrected using the actual persisted file record.
- Final Electron rerun (also covering global paste) could not start because automatic approval review disconnected twice. This remains unverified in the final test version.
- Read-only review identified refreshed metadata losing imported status; removal now checks persisted library membership and the regression test passes.
