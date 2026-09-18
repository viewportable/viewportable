# Monetization and feature tiers

Status: proposed product policy.

## Principle

Viewportable should keep the core responsive-development experience useful forever without requiring an account.

The paywall should not block the reason the product exists. It should monetize workflow acceleration, history, automation, integrations, cloud features, and collaboration.

A simple framing:

```text
Free
"What does my site look like?"

Pro
"Tell me what changed, find problems, remember everything, and automate this."

Team
"Make this part of how our team ships software."
```

## Free forever

The local desktop product should remain useful without sign-up or cloud dependency.

- Open any URL or localhost.
- Multiple simultaneous viewports.
- Built-in device presets.
- Custom viewport sizes.
- Portrait and landscape.
- Zoom and layout controls.
- Synchronized navigation.
- Synchronized scrolling.
- Synchronized clicks/interactions where supported.
- Basic DevTools access.
- Manual screenshots.
- Local projects and preferences.
- Basic network/device controls that do not require cloud infrastructure.
- Basic local MCP/control surface for external agents.
- No account required.

Do not artificially limit local viewports just to create a paywall. Local rendering consumes the user's CPU and memory, not Viewportable cloud resources.

## Pro

Pro should remove repetitive manual work and preserve useful state over time.

Initial Pro candidates:

1. Visual history and screenshot history.
2. Visual diff against saved baselines.
3. Automatic breakpoint sweep.
4. Project history and reusable test configurations.
5. Cloud sync between machines.
6. Batch URL/page testing.
7. Advanced device and network emulation.
8. Video/session recording.
9. Shareable reports.
10. CLI and headless runs.
11. GitHub PR integration.
12. Preview-deployment integrations such as Render, Vercel, Fly.io, Netlify and similar services.
13. CI visual-regression workflow.
14. Advanced agent workflows that scan, compare, explain and report.

The core distinction is:

```text
Free MCP / API
controls Viewportable

Pro automation
understands + scans + compares + reports
```

## Team

Team should monetize shared process rather than individual local functionality.

- Shared workspaces.
- Shared projects and device sets.
- Shared visual baselines.
- Shared history.
- Team reports.
- Comments and review.
- Approval workflow.
- CI organization settings.
- Role and permission management.
- Central billing.
- Audit/history features where required.

## Feature matrix

| Feature | Free | Pro | Team |
| --- | :---: | :---: | :---: |
| Open URL / localhost | Yes | Yes | Yes |
| Multiple viewports | Yes | Yes | Yes |
| Built-in devices | Yes | Yes | Yes |
| Custom viewport sizes | Yes | Yes | Yes |
| Sync scroll/navigation | Yes | Yes | Yes |
| Basic DevTools | Yes | Yes | Yes |
| Manual screenshots | Yes | Yes | Yes |
| Local projects | Yes | Yes | Yes |
| Basic local MCP/control API | Yes | Yes | Yes |
| Cloud sync | No | Yes | Yes |
| Workspace history | No | Yes | Yes |
| Screenshot history | No | Yes | Yes |
| Visual diff | No | Yes | Yes |
| Baseline snapshots | No | Yes | Yes |
| Automated breakpoint sweep | No | Yes | Yes |
| Batch URLs/pages | No | Yes | Yes |
| Video/session recording | No | Yes | Yes |
| Advanced emulation | No | Yes | Yes |
| CLI / headless automation | Limited | Yes | Yes |
| GitHub PR integration | No | Yes | Yes |
| Deployment integrations | No | Yes | Yes |
| CI visual regression | No | Yes | Yes |
| Shareable cloud reports | No | Yes | Yes |
| Shared team workspace | No | No | Yes |
| Shared baselines | No | No | Yes |
| Comments / approvals | No | No | Yes |
| Central billing | No | No | Yes |

## Account policy

The Free product should remain local-first and work without an account.

```text
brew install --cask viewportable
open Viewportable
use it
```

An account should appear only when it unlocks a clear benefit:

- cloud sync;
- cloud history;
- sharing;
- billing;
- team workspaces;
- CI;
- integrations requiring server-side state.

Recommended authentication:

- GitHub as the primary developer-oriented identity provider.
- Google as a secondary identity provider for QA, designers, product teams and agencies.
- Other providers only when there is a clear product reason.

Authentication and service integrations are separate concepts.

For example:

```text
Sign in with GitHub
= identity

Install/connect GitHub App
= repository, pull request and checks integration
```

Likewise, Render, Fly.io, Vercel, here.now and similar services should normally be integrations, not login providers.

The local workspace should not be owned by the cloud account. Signing out or losing connectivity must not make local projects unusable.

## First paid features to build

If we need the smallest paid vertical slice, prioritize:

### 1. Visual history + diff

Save a baseline, capture the current state, highlight meaningful visual changes.

### 2. Automatic breakpoint sweep

Test a page across a range of viewport widths without manually creating each viewport.

Longer term this can become a layout-break detector:

```text
320 -------------------------------- 1920
               ^
               layout changes/breaks
               around 731-764 px
```

### 3. Projects + history

Persist environments, device sets, screenshots, baselines and previous sessions.

### 4. GitHub + deployment previews

A pull request can resolve its preview deployment and open it directly in Viewportable.

```text
GitHub PR
  -> preview deployment
  -> Viewportable
  -> responsive scan
```

### 5. CLI / CI

Example target workflow:

```bash
viewportable test https://preview.example.com
```

Potential result:

```text
PASS 320px
PASS 375px
PASS 768px
FAIL 1024px
PASS 1440px

1 visual regression
```

## Pricing hypothesis

Pricing is a hypothesis to validate, not a commitment.

A simple starting model:

| Plan | Candidate price | Positioning |
| --- | ---: | --- |
| Free | $0 forever | Responsive development, local-first |
| Pro | about $9/month or $79/year | Professional individual workflow |
| Team | about $15/user/month | Shared workflow, CI and collaboration |

An early-adopter lifetime license may be useful during initial launch, but it should be evaluated against long-term cloud and support costs.

Avoid unnecessary plan complexity. Start with Free, Pro and Team unless real customer segmentation proves another tier is needed.

## Product rule

The paywall test for every feature:

> Does this feature make the basic local responsive browser work, or does it save professional time / provide cloud or team value?

If it is core local browsing, prefer Free.

If it adds automation, durable history, integration, collaboration or cloud cost, it is a strong Pro/Team candidate.

The intended positioning:

> Viewportable Free helps you see responsive UI.
>
> Viewportable Pro helps you stop checking it manually.
