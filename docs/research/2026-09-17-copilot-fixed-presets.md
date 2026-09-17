# Copilot 1.0.85 fixed shortlist

Date: 2026-09-17

The operator selected six models and confirmed fixed efforts: Medium for GPT-5.6 Terra,
Claude Sonnet 5, Gemini 3.8 Flash, Grok 4.6 and MAI-Code-1.1-Flash; High for Kimi K3.
GPT-5.6 Terra is explicitly marked default. Context figures are informational and omitted
from labels. Names retain upstream case, followed by the fixed effort.

The [Runtime evidence note](../../../cats-runtime/docs/research/2026-09-17-copilot-fixed-presets.md)
owns raw IDs, picker evidence, fixed-effort execution and shortlist membership. The verified
six-model shortlist is reflected in Desktop's fallback; Gemini's ID and effort were confirmed
by the operator's actual session selection message after it was absent from models.list.
Desktop uses the existing custom-input action. Runtime supplies no editable effort controls
for these fixed combos and resolves the selected effort server-side.

On 2026-09-18, the operator replaced GPT-5.6 Luna with MAI-Code-1.1-Flash at fixed Medium.
Runtime verified the new ID and effort through the installed Copilot 1.0.85 `models.list`.
Desktop preserves the exact model name, shortlist position, Terra default and custom input.
The Runtime note links the revised shortlist and targeted metadata. Original validation below
applies to the initial six-model implementation; revision checks are recorded separately.

Revision validation: the official UI test bundle, 44 focused selector/default/persistence/audience
tests, renderer TypeScript and test TypeScript checks passed. The fallback assertion verifies
MAI's raw ID, exact display name and fifth position. Diff checks passed. No installed Desktop
or live model-turn smoke was performed.

Validation:

- Official UI test bundle built; selector, defaults, label persistence and audience tests:
  44 passed across four files.
- Renderer and test TypeScript checks passed.
- No installed Desktop or live model-turn smoke performed.
- PR delivery was subsequently authorized; no version bump or release.
