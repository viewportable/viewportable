# Viewportable

A responsive development browser built on Electron `WebContentsView`.

Viewportable renders real Chromium-backed viewports side by side and keeps logical device geometry separate from on-screen scaling. The current product includes a persistent Device Board, mobile emulation, Fit and shared Proportional scale modes, navigation synchronization and layered automated tests.

- [Product vision and competitive matrix](docs/rfc/vision.md)
- [Roadmap](docs/roadmap.md)
- [Monetization and feature tiers](docs/features/monetization.md)

## See it catch a real PR

[Viewportable Engine PR #44](https://github.com/viewportable/engine/pull/44) is the public red-to-green proof for the product's deterministic PR review loop.

A candidate introduced two responsive structural regressions only from **350px through 499px**. Ordinary repository CI stayed green, while Viewportable produced exact evidence, a failing `Viewportable Engine` Check Run, a retained `structural-diff.json`, and one managed PR comment.

After the fix commit, the next run reported all sampled widths clean, created a successful Check Run for the new head, and updated the **same PR comment** from:

```text
❌ 2 structural regressions introduced
```

to:

```text
✅ No structural regressions introduced
```

The PR body keeps links to both the failing and successful workflow/check evidence.

## Current vertical slice

- Dynamic Device Board with Phones and Tablets.
- Add/remove devices with persisted selection.
- Real `WebContentsView` instances, not iframes or Electron `<webview>`.
- Chromium DevTools Protocol device metrics emulation.
- Logical viewport size, DPR, mobile UA, touch, coarse pointer and hover-none emulation.
- Fit mode: independent scale per viewport.
- Proportional mode: one shared scale across visible viewports.
- Synchronized URL/navigation.
- Horizontal board with native viewport lifecycle managed by Electron main.
- Vitest unit tests, React Testing Library component tests, native Electron integration tests and Playwright Electron E2E.

Viewportable does not claim that an iPhone geometry rendered by Chromium reproduces Safari/WebKit.

## Stack

- Electron 44
- TypeScript 7
- React 19
- Vite 7 + electron-vite 5
- Zod for validated IPC contracts in the main process
- Vitest
- React Testing Library
- Playwright Electron

## Run on macOS

Requirements: macOS 13+, Node.js 22.18+, npm.

```bash
git clone https://github.com/viewportable/viewportable.git
cd viewportable
npm install
npm run dev
```

Override the initial URL:

```bash
VIEWPORTABLE_DEFAULT_URL=http://127.0.0.1:3000 npm run dev
```

## Checks

```bash
npm test
npm run test:electron
npm run test:e2e
```

`test:electron` and `test:e2e` build before launching Electron so they do not test a stale `out/` directory.

```bash
npm run check:fast
npm run check
```

## Architecture

```text
React renderer ─────┐
                    ├──> core product logic
Electron main ──────┘

React renderer ─────> validated protocol <──── Electron main/preload
```

Current source boundaries:

```text
src/
├── core/        # host-agnostic product rules
├── shared/      # device data and shared contracts
├── renderer/    # React adapter
├── main/        # Electron/WebContentsView/CDP adapter
└── preload/     # narrow IPC bridge
```

Electron-specific code should not leak into `core`. React should not own domain rules that another visualization would need to reimplement.

See [docs/rfc/vision.md](docs/rfc/vision.md) for the target package architecture.

## CI strategy

CI is ordered by cost and uses branch-scoped concurrency with `cancel-in-progress: true`:

1. lint
2. typecheck
3. unit tests
4. component tests
5. build
6. native Electron integration on macOS

Playwright Electron E2E remains available as a local/manual regression layer while the native Electron integration runner is the required desktop gate.
