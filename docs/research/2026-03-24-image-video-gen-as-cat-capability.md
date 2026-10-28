# Image/Video Generation as Cat Capability

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: Package image/video generation as a Cat capability, not an API gateway
- **Related**:
  - `cats-runtime/src/core/browser/previewSurfaces.ts` — already recognizes image file extensions
  - `cats-runtime/src/core/browser/RuntimeBrowserService.ts` — preview surface registration
  - `cats-runtime/docs/specs/SPEC-005-runtime-managed-skills-v0.md`
  - `cats-runtime/docs/decisions/011-runtime-owned-browser-preview-subsystem.md`

---

## Core Claim

> **Image/video generation is a capability of a Cat, not an API gateway.
> The runtime does not proxy APIs, manage API keys, or do rate limiting.
> A Cat calls the generation features its provider offers through its own CLI
> subscription, the output files are stored in the workspace, and the product
> layer is responsible for presenting them.**

---

## Why Not an API Gateway

| | API gateway approach | Capability approach (this proposal) |
|--|------------------|-------------------------|
| API key | Held by the runtime | Comes with the Cat's CLI subscription |
| Invocation | Runtime forwards HTTP requests | The Cat calls the CLI tool itself in its session |
| Billing | Runtime must track it | The provider bills the subscription owner directly |
| Output | API response (base64 / URL) | Files land in the workspace directory |
| Error handling | Runtime must handle each provider's errors | The Cat handles it and reports success or failure |
| Support for a new provider | Runtime must add an adapter | Just write a new SKILL.md |

**The benefit of the capability approach**: the runtime needs no knowledge of
image generation details at all. To the runtime, a Cat producing a `.png` is no
different from producing a `.ts` — both are files in the workspace.

---

## How It Works

### Cat Side (SKILL.md injection)

Declare that the Cat has image/video generation capability:

```yaml
# SKILL.md frontmatter
family: work
role: designer
capabilityTags:
  - image_gen
  - video_gen
```

The prompt guidance (SKILL.md body) tells the Cat:

- You can use the image generation tool the provider offers
- Save output files to a designated directory in the workspace (for example `output/`)
- Report the output file path and metadata (size, format, prompt used)
- If the provider does not support it or generation fails, report honestly

### Runtime Side (no changes needed)

The mechanisms cats-runtime already has are sufficient:

**Workspace**
- A Cat's session has its own workspace directory (shared / isolated / worktree)
- Generated files are written straight into the workspace, no different from code output

**Preview Surface recognition**
- `previewSurfaces.ts` already recognizes image file extensions:
  `.png` / `.jpg` / `.jpeg` / `.gif` / `.webp` / `.svg`
- It automatically tags `mediaType: 'image/png'` and so on
- It sets `renderHint: 'download'` (currently)

**Delivery Primitives**
- Artifact publish / export mechanisms already exist
- Generated images can be delivered as delivery artifacts

**Usage Metering**
- Token tracking already exists
- If the provider consumes tokens during image generation, metering records them as usual

### Product Side (needs a small extension)

**Showing images in the Canvas / Chat**
- Currently the preview surface `renderHint` for images is `'download'`
- A new `'inline_image'` or similar render hint is needed
- On receiving this hint, the product layer shows the file in the workspace directly with `<img>`
- Video works the same way, shown with `<video>`

**Images appearing in the conversation**
- A Cat's message carries an image path → the renderer detects the image → shows it inline
- Similar to the experience of sending a picture in a chat app

---

## Supported Scenarios

### Scenario 1: Designer Cat generates assets

```
Owner: Make a hero image for my landing page, techy, blue tones

Boss Cat: Understood, assigning to the Designer Cat

Designer Cat: (generates images through the CLI provider's image gen tool)
Designer Cat: Generated 3 candidates, please take a look:
  [Image 1] [Image 2] [Image 3]
  Which one do you like?

Owner: [selects Image 2]

Designer Cat: Okay, saved to output/hero-image.png
```

### Scenario 2: Coder Cat generates placeholder images

```
While implementing a landing page, the Coder Cat needs placeholder images
→ calls the image gen tool itself to generate them
→ saves to public/images/
→ references them directly in the code
→ the running page, images included, can be seen in the Canvas
```

### Scenario 3: Marketing Cat generates social media assets

```
Owner: Make me an Instagram post image

Marketing Cat: What style do you want?
  [Minimal text] [Product photo style] [Illustration style] [...]

Owner: [Illustration style]

Marketing Cat: (generates the image)
  Done, saved to output/ig-post.png
  [Preview image]
  Publish it directly?

Owner: [Download] [Revise] [Publish]
```

### Scenario 4: Video gen (future)

The same pattern applies to video generation:
- The Cat calls the provider's video gen tool
- Output `.mp4` / `.webm` is stored in the workspace
- The Canvas shows it with `<video>`
- Takes longer → can pair with the wakeup substrate (notify the owner when generation finishes)

---

## Which Providers May Support It

Different CLI providers have different image gen capabilities, but the
capability model does not need to care which provider it is:

- **Claude**: the CLI does not support image gen directly today, but it can be connected through an MCP tool
- **Codex / OpenAI**: may generate through a DALL-E tool
- **Gemini**: natively supports image generation
- **Ollama + local model**: can connect a local Stable Diffusion and similar
- **Future providers**: as long as the CLI has image gen capability, writing a SKILL.md is enough to support it

**Key point: supporting a new provider needs no runtime code changes, only a new SKILL.md.**

---

## Quality and Limits

**Output quality is not guaranteed**
- The quality of image/video generation depends entirely on the provider and model
- The Cat can describe the requirement as fully as possible in the prompt, but final quality is not under our control
- The Owner's approval gate (structured choices) is the last line of defense for quality control

**Successful generation is not guaranteed**
- The provider may refuse (content policy)
- The provider may be temporarily unavailable (rate limit / downtime)
- The Cat should report failure honestly and not fake a result

**No managed prompt engineering**
- A Cat's SKILL.md can provide basic guidance on writing image prompts
- But how the requirement the owner describes is turned into an image prompt is the Cat's own ability
- Different providers have different prompt styles, which SKILL.md guides specifically

---

## Relationship to Existing Research

- **Structured Choices**: used when the Owner picks among candidate images
- **Peer Review**: a Designer Cat's output can be reviewed by Peer Cats (composition, brand consistency)
- **Task Substrate**: image gen tasks are tracked as CoreTaskRecord
- **Cats Work Aggregator**: if a freelance job needs design assets, the Designer Cat can produce them directly

---

## Conclusion

- Image/video generation naturally exists as a Cat capability and needs no API gateway
- The runtime needs no changes — workspace files plus preview surface metadata are enough
- The product layer needs only a small extension to the Canvas render hint to show images/videos inline
- Supporting a new provider needs only a SKILL.md, no code changes
- Quality and success rate are decided by the provider, with the owner's approval as the final gate

---

*This document is for review discussion. If the review passes, it is
recommended to fold it into the cats-runtime skill library documentation as
part of the SKILL.md capability standard.*
