# Viewportable Roadmap

Last updated: 2026-09-19

The roadmap is ordered by product value and architectural leverage, not by feature count.

## Now: establish reusable product seams

- [x] Keep device data separate from Electron.
- [x] Keep scale calculations pure.
- [x] Introduce `src/core/board.ts` as the single source of truth for board selection and reconcile rules.
- [ ] Move workspace/preset state transitions into core.
- [x] Move layout decisions into a pure core layout module.
- [ ] Define sync semantics in core before wiring Electron events.
- [ ] Keep React components dependent on core/protocol, never Electron APIs directly.
- [ ] Reduce `ViewportManager` to orchestration + WebContentsView/CDP lifecycle.

Exit criterion: board selection, ordering, scaling and sync state can be tested without React, Electron, DOM or IPC.

## Next: make the Device Board feel native

- [ ] Correct partially visible viewport behavior.
- [ ] Add horizontal scroll snapping.
- [ ] Preserve selected/revealed device during board changes.
- [ ] Add clear loading/error states per viewport.
- [ ] Add keyboard navigation across devices.
- [ ] Keep off-screen native views resource-aware without corrupting board state.

## Next: synchronized interaction

First vertical slice:

- [ ] `Sync scroll` toggle.
- [ ] Synchronize document scroll by normalized progress.
- [ ] Prevent feedback loops.
- [ ] Handle different document heights.
- [ ] Add deterministic integration coverage.

Then:

- [ ] Click sync.
- [ ] Input/form sync with safety rules.
- [ ] Hover/focus sync.
- [ ] Configurable navigation sync.

## Device workflow

- [ ] Custom viewport: width, height, DPR.
- [ ] Portrait/landscape rotate.
- [ ] Reorder devices.
- [ ] Favorites.
- [ ] Named board presets: Mobile, Tablet, Smoke, custom project sets.
- [ ] Persist ordering and preset selection.

## Truthful scale

- [x] Fit.
- [x] Proportional.
- [ ] True 1:1 mode.
- [ ] Per-display calibration using a known physical object/card.
- [ ] Calibration persistence.
- [ ] Display-change handling.
- [ ] Explain logical CSS size vs rendered size vs physical size in UI.

## Responsive diagnostics

Integrate Slice as a separate diagnostics layer rather than coupling it to the Electron host.

- [ ] Isolated-world page probe.
- [ ] Shadow DOM overlay.
- [ ] Overflow detection.
- [ ] Clipping detection.
- [ ] Collision/occlusion detection.
- [ ] Stable finding identity across reruns.
- [ ] Per-device findings.
- [ ] Cross-device summary.
- [ ] Machine-readable diagnostics export.

## Developer tooling

- [ ] Chromium DevTools entry point per viewport.
- [ ] Screenshot single viewport.
- [ ] Screenshot whole board.
- [ ] Record selected viewport.
- [ ] Record whole Device Board, including native `WebContentsView` content.
- [ ] Recording controls: start/stop, elapsed time, save/export.
- [ ] Decide cursor/audio behavior after reviewing real usage video.
- [ ] Breakpoint discovery from page CSS.
- [ ] Relevant media/user preference emulation.
- [ ] Network throttling where useful.

## Automation and agents

- [ ] Stable command protocol.
- [ ] CLI/headless board configuration.
- [ ] JSON findings output.
- [ ] Agent-facing commands for open URL, select devices, inspect and capture.
- [ ] CI use case for responsive regressions.

## Package extraction / React merge readiness

Only after internal seams are stable:

```text
apps/desktop
packages/core
packages/react
packages/electron
packages/protocol
packages/slice
```

Extraction is complete when another React application can render and control a board by importing `core` + `react` without importing Electron.

## Product priority rule

Before implementing a feature, ask whether it improves the multi-device testing loop, strengthens truthful comparison, produces deterministic responsive evidence, makes the core more reusable/automatable, or closes a table-stakes competitor gap.
