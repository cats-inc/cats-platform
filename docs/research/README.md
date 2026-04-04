# Research Log

> Track external sources and findings that inform decisions.

## Index

| Document | Date | Topic | Summary |
|----------|------|-------|---------|
| [2026-04-04-self-hosted-cli-provider-port-matrix](./2026-04-04-self-hosted-cli-provider-port-matrix.md) | 2026-04-04 | Self-hosted CLI provider port matrix | Freeze which `environment-bootstrap` CLI provider lanes are now repo-owned in `cats-platform`, which never existed upstream, and which remaining gaps are product-integration rather than missing scripts |
| [2026-03-31-packaged-startup-terminal-popup-investigation](./2026-03-31-packaged-startup-terminal-popup-investigation.md) | 2026-03-31 | Packaged startup terminal popup investigation | Trace why packaged post-onboarding startup still opened visible terminal windows, then lock the fix around persisted setup truth, lightweight runtime health, and manual-only background discovery |
| [2026-03-29-packaged-setup-knowledge-extraction-inventory](./2026-03-29-packaged-setup-knowledge-extraction-inventory.md) | 2026-03-29 | Packaged setup knowledge extraction inventory | Freeze which setup/install knowledge is already extracted, still trapped in `environment-bootstrap`, or safe to defer before the `cats` / `cats-runtime` repo split |
| [2026-03-30-packaged-setup-split-safety-validation](./2026-03-30-packaged-setup-split-safety-validation.md) | 2026-03-30 | Packaged setup split-safety validation | Evidence that the first packaged setup helper baseline, host bridge, and staged asset contract now work from repo-owned `cats` assets without direct bootstrap shell-outs |
| [2026-03-30-companion-external-knowledge-ingestion-strategy](./2026-03-30-companion-external-knowledge-ingestion-strategy.md) | 2026-03-30 | Companion external knowledge ingestion strategy | Evaluate Google Drive read-only connectors, Google Photos limits, and FB/IG plus LINE import paths for companion resources and memory promotion |
| [2026-03-29-cats-a2a-pilot-alignment](./2026-03-29-cats-a2a-pilot-alignment.md) | 2026-03-29 | Cats A2A pilot alignment | Mirror the validated `cats-runtime` A2A layering pilot into `cats` so both repos share the same first-wave collaboration posture |
| [2026-03-20-codex-cats-chat-work-code-product-boundaries](./2026-03-20-codex-cats-chat-work-code-product-boundaries.md) | 2026-03-20 | Codex view of Chat / Work / Code product boundaries | Capture a separate Codex-authored view of how `Cats Chat`, `Cats Work`, and `Cats Code` should split their product promises, shared foundation, and first-slice focus |
| [2026-03-19-openclaw-memory-layering-benchmark](./2026-03-19-openclaw-memory-layering-benchmark.md) | 2026-03-19 | OpenClaw memory layering benchmark | Compare OpenClaw's transcript, compaction, durable memory, and retrieval split to the Cats suite's product/runtime memory needs |
| [2026-03-20-openclaw-chat-runtime-gap-analysis](./2026-03-20-openclaw-chat-runtime-gap-analysis.md) | 2026-03-20 | OpenClaw gaps for Cats Chat + runtime | Re-audit the latest local OpenClaw submodule and identify the main remaining channel-native agent runtime gaps for `Boss Cat` transport flows, specialist-Cat orchestration, and chat/runtime maturity |
| [2026-03-20-paperclip-killer-feature-gap-analysis](./2026-03-20-paperclip-killer-feature-gap-analysis.md) | 2026-03-20 | Paperclip killer-feature gaps for Chat + runtime | Re-audit the latest local Paperclip submodule and identify the highest-value remaining `Cats Chat + cats-runtime` killer features after the 2026-03-20 spec/ADR pass |
| [2026-04-02-paperclip-control-plane-analysis](./2026-04-02-paperclip-control-plane-analysis.md) | 2026-04-02 | Paperclip concepts and feature map | Unreviewed local analysis of Paperclip's control-plane model and rewrite takeaways for `cats` |
| [2026-04-01-aos-reference-system-evaluation-airtable-monday-clickup](./2026-04-01-aos-reference-system-evaluation-airtable-monday-clickup.md) | 2026-04-01 | AOS reference system evaluation | Deep research comparing Airtable, monday.com, and ClickUp as agent operating system reference for one-person/zero-person digital company |
| [2026-03-26-openmanus-killer-feature-gap-analysis](./2026-03-26-openmanus-killer-feature-gap-analysis.md) | 2026-03-26 | OpenManus killer-feature gaps for Chat + runtime | Identify execution-engine gaps (structured planning, stuck detection, container sandbox, A2A, multimodal tools, unified tool registry) from OpenManus submodule v0.3.0 |
| [2026-03-26-unified-planning-language-and-cross-product-strategy](./2026-03-26-unified-planning-language-and-cross-product-strategy.md) | 2026-03-26 | Unified planning language and cross-product strategy | CoreTaskRecord as cross-strategy plan exchange format, pluggable strategy selection (Chat=ReAct, Work=PDCA, Code=Reflexion), cross-product plan handoff |
| [2026-03-26-cats-chat-spatial-layout-guidelines](./2026-03-26-cats-chat-spatial-layout-guidelines.md) | 2026-03-26 | Cats Chat spatial layout guidelines | Define the intended spatial model for transcript, split artifact view, pane-local action bars, compose-config/operator/cwd secondary surfaces, and companion-aware workspace structure |
| [2026-03-26-companion-core-capabilities](./2026-03-26-companion-core-capabilities.md) | 2026-03-26 | Companion core capabilities | Define the minimum companion feature set, dashboard sections, identity/profile model, presence toggles, and current gap areas for `Cats Chat` |
| [2026-03-26-cats-ai-first-app-store-vision](./2026-03-26-cats-ai-first-app-store-vision.md) | 2026-03-26 | Cats as an AI-first app store | Define the vision where users learn the platform with an AI coach, build apps with Work + Code inside the suite, and publish/install those apps back into `Cats` |
| [2026-03-26-cats-coding-playground-vision](./2026-03-26-cats-coding-playground-vision.md) | 2026-03-26 | Cats Coding playground vision | Define `Cats Code > Playground` as a playful LAN/tablet mode where real-cat fish selections become software ideas, briefs, and generated outputs |
| [2026-03-27-companion-agent-toggle-baseline-and-openclaw-parity](./2026-03-27-companion-agent-toggle-baseline-and-openclaw-parity.md) | 2026-03-27 | Companion/Agent toggle baseline and OpenClaw parity path | Define current progress snapshot for `cats`/`cats-runtime`/`openclaw` submodule state, then propose baseline skills/tools and architecture changes for one-click companion↔agent persona switching with OpenClaw-level agent capability targets |

## Entry Template

```
Date:
Topic:
Source:
Summary:
Relevance:
Action Items:
```

---

*Last updated: 2026-04-04*
