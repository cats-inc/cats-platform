# PLAN-129: Desktop and Bot script convergence

Status: Implementation, local acceptance and independent review complete.
The owner authorized the complete script inventory on 2026-11-01.

## Scope and boundaries

Converge CDP restart/inspection, repository maintenance, provider-resource refresh,
.NET and renderer notices, icon generation, isolated source candidates and the
common process/source-verification portions of packaging. Retain product-specific
profiles, Hub/core lifetime, release identities, signing and installer policies.
No version bump, publication, installed-app replacement or live-app restart is authorized.

cats-one owns repository maintenance. Platform owns Desktop/Bot development and
build mechanisms. Consumers carry complete, explicitly refreshed source closures
with source commits, SHA-256 and licenses; checkout/build never imports a sibling.
This is script convergence, not completion or publication of PLAN-127's proposed
host packages. Existing public script entrypoints remain available as adapters.

The legacy Platform `--clean` behavior is intentionally narrowed to preserve
unrelated discovery skills. Record this script CLI behavior change at the next
Platform minor boundary (0.13.x); this task does not bump or publish a version.

## Implementation

- [x] Shared source synchronization/check command with immutable provenance.
- [x] Safe recursive skill sync and cross-platform merged-branch helpers in both products.
- [x] Shared CDP transport and macOS restart mechanism, with separate Desktop/Bot adapters.
- [x] Shared .NET/renderer notice collection and product-specific output adapters.
- [x] Shared icon rendering primitives and explicit product output specifications.
- [x] Isolated candidate controls for Bot; share process/environment/source primitives.
- [x] Share bounded build/source verification utilities while retaining release policy.
- [x] Validate both consumers without sibling imports; independent review and documentation.

## Validation

Use temporary repositories/profiles, deterministic process fixtures and local
candidate builds. Cover occupied ports, active provider processes, graceful-only
quit, loopback target selection, nested skills, duplicate names, links, unrelated
skills, notice closure and reproducible source pins. Live user profiles and real
provider installation are excluded. Record actual commands/results here at completion.

## Local validation record

- cats-one: complete suite 119 tests, 116 passed and three environment skips;
  four new maintenance/provenance regressions passed and independently reviewed.
- Platform: host/renderer builds and 26 focused consumer tests passed; additional
  CDP handshake regression passed. Source-candidate and renderer fixtures now
  canonicalize macOS temporary paths rather than comparing `/var` aliases.
  The full-suite skill fixtures now copy the complete shared helper closure and
  verify unrelated skills survive `--clean`; Desktop's original strict release
  tag parser remains product-owned, including rejection of leading zeros.
- Bot: complete suite 368 passed, no skips, after integrating the Linux icon
  update; typecheck and production build passed.
- Real isolated candidates: Desktop `/private/tmp/cats-desktop-tools-candidate-20261101-d`
  and Bot `/private/tmp/cats-bot-tools-candidate-20261101-b` reached setup, produced
  inspected screenshots and stopped with `drained`, exit code 0. Installed apps
  and real profiles were not restarted or modified. Initial candidate issues
  found by acceptance were fixed before this successful run.
- Platform generated its actual PNG/ICO/ICNS outputs in a temporary root; Bot
  generated all 12 PNG outputs, including the eight Linux sizes, in another
  temporary root. The shared pipeline's real PNG dimensions are regression tested.
- Independent review closed the preflight, executable-mode, Git-replacement and
  CDP handshake/redirect findings. Final consumers verify exact committed source
  bytes, SHA-256 and executable modes: maintenance sources use cats-one
  `f17ae5f488b774116b82f04ff2781576a3460b12`; Bot's Platform closure and 35 provider
  resources use `fd61bc2bb980e491f63b4035d04abee9b99c5021`. Both consumers' offline
  checks and producer-Git verification passed.
