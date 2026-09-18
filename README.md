# Viewportable

A responsive development browser built on Electron `WebContentsView`.

This repository currently contains the first vertical slice: one desktop shell, one synchronized URL bar, and two real Chromium-backed viewports with mobile device emulation and Fit scaling.

## What V1 proves

- Real pages render through `WebContentsView`, not `iframe` or Electron `<webview>`.
- Two viewports render the same URL simultaneously.
- Logical device size is independent from the rendered on-screen size.
- Fit scaling uses `webContents.enableDeviceEmulation({ scale })`, never page zoom.
- Device emulation includes logical viewport size, DPR, mobile screen mode, mobile UA and touch/coarse-pointer emulation.
- Native viewport bounds follow React placeholders through `ResizeObserver` and IPC.
- Navigation state flows from Electron main process back to the toolbar.
- `target="_blank"` is contained inside Viewportable instead of spawning a bare Electron window.

## Stack

- Electron 44
- TypeScript 7
- React 19
- Vite 8 + electron-vite 5
- Zod for IPC validation
- Vitest for pure deterministic logic
- Playwright Electron for the final E2E smoke test

## Run on macOS

Requirements:

- macOS 13 or newer for Electron 44
- Node.js 22.18 or newer
- npm

```bash
git clone https://github.com/viewportable/viewportable.git
cd viewportable
npm install
npm run dev
```

The app opens `https://example.com` in two synchronized viewports:

- iPhone 15 Pro geometry: 393 × 852, DPR 3
- Pixel Tablet geometry: 800 × 1280, DPR 2

Both are rendered by Chromium. Viewportable does not claim that the iPhone geometry reproduces Safari/WebKit.

You can override the initial URL for deterministic local testing:

```bash
VIEWPORTABLE_DEFAULT_URL=http://127.0.0.1:3000 npm run dev
```

## Local checks

Fast deterministic checks:

```bash
npm run check:fast
```

Electron E2E after a build:

```bash
npm run build:app
npm run test:e2e
```

Everything:

```bash
npm run check
```

## CI strategy

The workflow is intentionally ordered by cost:

1. format check
2. lint
3. typecheck
4. unit tests
5. build
6. Electron E2E under Xvfb

The E2E job depends on the fast job, so it never starts if a cheap deterministic check fails.

CI also uses branch-scoped concurrency with `cancel-in-progress: true`, so a newer push cancels an obsolete run for the same branch/ref.

While the repository is private, push/PR jobs are skipped to avoid consuming private-runner minutes. The workflow subscribes to GitHub's `public` event, so changing the repository from private to public automatically starts CI for the default branch. Manual `workflow_dispatch` remains available when an intentional private run is needed.

The fast job skips Electron and Playwright browser binary downloads. Only the final E2E job installs the Electron binary.

## Architecture

```text
React shell
  ├─ Toolbar
  ├─ URL/navigation state
  └─ Viewport placeholders
        │ ResizeObserver
        ▼
      IPC
        ▼
ViewportManager
  ├─ Scale resolution (Fit in V1)
  ├─ iPhone 15 Pro WebContentsView
  └─ Pixel Tablet WebContentsView
```

Each native viewport keeps its declared logical CSS size while the visible native bounds are scaled to fit the available placeholder.

## Next milestones

- Proportional scale mode with one shared scale across all visible devices
- True 1:1 calibration per display
- Per-display calibration persistence and display-change handling
- Slice integration and diagnostic overlays injected into an isolated page world
