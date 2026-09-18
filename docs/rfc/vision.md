# Viewportable Vision

Status: Living RFC  
Last updated: 2026-09-19

## Product thesis

Viewportable is a responsive development browser for comparing real Chromium-backed viewports side by side, preserving truthful device geometry and eventually turning responsive QA into deterministic, automatable diagnostics.

The goal is not to clone every feature in an existing browser. The product should be unusually strong on a narrower axis:

1. Multi-device workspaces that are fast to configure.
2. Correct and explicit emulation semantics.
3. Synchronized interaction across viewports.
4. Truthful visual comparison through Proportional and calibrated True 1:1 scale.
5. Deterministic responsive diagnostics through Slice.
6. An agent-friendly core that can be driven through UI, protocol, CLI or automation.

> Viewportable = responsive browser + truthful viewport comparison + deterministic responsive QA + automation.

## Architecture decision

Product logic must not belong to Electron or React.

Electron is a host adapter. React is a visualization and interaction adapter. Reusable product rules live in a host-agnostic core.

Current migration shape:

```text
src/
├── core/        # pure product/domain logic
├── shared/      # device data and transport-safe contracts
├── renderer/    # React adapter
├── main/        # Electron adapter
└── preload/     # narrow IPC bridge
```

Target shape, once the seams are stable enough to justify workspace packages:

```text
apps/
└── desktop/

packages/
├── core/
├── react/
├── electron/
├── protocol/
└── slice/
```

We deliberately do not begin with a monorepo split. First we create stable dependency boundaries inside `src/`; package extraction should later be mechanical.

### Dependency rule

```text
React renderer ─────┐
                    ├──> core
Electron main ──────┘

React renderer ─────> protocol <──── Electron main/preload

core must not import React or Electron.
```

The same core must eventually be usable by the Electron desktop app, another React visualization, tests without Electron, CLI/agent automation and future remote-control surfaces.

## Product principles

### Logical viewport, rendered viewport and physical size are different concepts

A device can have a logical CSS viewport of 393 × 852 while being rendered smaller on the monitor. These dimensions must never be conflated.

### Emulation claims must be explicit

An iPhone geometry rendered by Chromium is not Safari/WebKit. The UI and documentation should say what is actually emulated: viewport geometry, DPR, UA, touch/pointer properties and supported media features.

### Scale modes are product semantics

- **Fit**: each viewport independently uses the available card area.
- **Proportional**: every visible viewport shares one scale factor so relative device size is preserved.
- **True 1:1**: future calibrated physical scale per display.

### Deterministic diagnostics before AI

Slice should detect measurable responsive failures such as overflow, clipping and collisions deterministically. AI can explain or prioritize findings later, but it should not be required to detect basic geometry failures.

## Competitive matrix

This matrix is directional product planning, not an exhaustive vendor audit. `?` means the capability was not confidently verified in the referenced official material.

Legend: ✅ available, ◐ partial/basic, — not a primary capability, 🧭 planned for Viewportable, ? not verified.

| Capability | Viewportable now | Viewportable target | Sizzy | Responsively | Polypane | Blisk | Chrome DevTools |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Multiple simultaneous viewports | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Device presets | ✅ basic | ✅ rich | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom viewport/device | — | 🧭 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dynamic add/remove | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a |
| Persistent device set | ✅ | ✅ presets/projects | ✅ | ✅ | ✅ | ◐ | ◐ |
| Horizontal device board | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| DPR + mobile metrics emulation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Touch/coarse-pointer emulation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Independent Fit scaling | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | single viewport |
| Shared Proportional scale | ✅ | ✅ | ? | ? | ? | ? | — |
| Calibrated physical True 1:1 | — | 🧭 differentiator | ? | ? | ? | ? | — |
| Rotate portrait/landscape | — | 🧭 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Scroll sync | — | 🧭 next | ✅ | ✅ | ✅ | ✅ | — |
| Click/input sync | — | 🧭 | ✅ | ◐ | ✅ | ◐ | — |
| Hover/focus sync | — | 🧭 | ? | ? | ✅ | ? | — |
| Navigation sync | ✅ common URL | ✅ configurable | ✅ | ✅ | ✅ | ✅ | — |
| Per-pane independent URL | — | 🧭 | ◐ | ? | ✅ | ? | n/a |
| Screenshots | — | 🧭 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Recording | — | 🧭 board + selected viewport | ✅ | ? | ◐ | ✅ | — |
| Breakpoint discovery/generation | — | 🧭 | ? | ? | ✅ | ? | ◐ |
| Accessibility audit | — | later | ? | ? | ✅ strong | ? | ✅ |
| Responsive overflow diagnostics | — | 🧭 Slice | ? | ? | ✅ debug tooling | ? | ◐ |
| Deterministic responsive QA engine | — | 🧭 differentiator | ? | ? | ◐ | ? | — |
| Agent/automation-friendly core | ◐ emerging | 🧭 differentiator | ◐ | ? | ? | ? | ◐ |

## Competitive interpretation

Polypane is the clearest current benchmark for deep synchronized interaction and responsive/accessibility debugging. Its official documentation covers synchronized navigation, scroll, hover, clicks, keyboard/form input, focus, per-pane configuration, breakpoint generation and layout/debug tooling.

Sizzy, Responsively and Blisk represent mature multi-device workflows that Viewportable still needs to reach in areas such as custom devices, screenshots, rotation and synchronization.

Chrome DevTools remains the reference for low-level Chromium debugging, network/performance tooling and single-viewport device emulation.

Viewportable's intended differentiation is the combination of Proportional scale, calibrated True 1:1, deterministic Slice diagnostics and a reusable automation-friendly core.

Screen recording is a planned developer-tool capability. The implementation must be explicit about capture scope: whole Device Board versus selected viewport. The recording path must capture the real native `WebContentsView` composition rather than only the React shell.

## Official sources

Last reviewed 2026-09-19.

- Sizzy: https://sizzy.co/
- Responsively App: https://responsively.app/
- Polypane docs: https://polypane.app/docs/
- Polypane synced interactions: https://polypane.app/docs/synced-interactions/
- Polypane responsive debugging workflow: https://polypane.app/docs/responsive-debugging-workflow/
- Blisk: https://blisk.io/
- Chrome DevTools Device Mode: https://developer.chrome.com/docs/devtools/device-mode

Update the matrix when a competitor changes meaningfully rather than treating this snapshot as permanent truth.
