# Cats as an AI-First App Store

## Metadata

- **Date**: 2026-03-26
- **Author**: Codex
- **Scope**: Product vision for turning `Cats` into an AI-first app platform,
  builder, and store
- **Related**:
  - [Cats Product Lines: Chat, Work, and Code](./2026-03-20-cats-product-lines-chat-work-code.md)
  - [Companion Core Capabilities](./2026-03-26-companion-core-capabilities.md)
  - [Unified Planning Language and Cross-Product Strategy](./2026-03-26-unified-planning-language-and-cross-product-strategy.md)
  - [Cats Chat Spatial Layout Guidelines](./2026-03-26-cats-chat-spatial-layout-guidelines.md)

## Purpose

Capture the next-stage vision for `Cats`: not just a suite with `Chat`, `Work`,
and `Code`, but a platform where users can learn the system, use the system to
build apps, and then publish those apps back into the same suite.

This is a vision note, not an implementation spec.

## Core Thesis

`Cats` should evolve from:

- one AI product with several surfaces

into:

- an **AI-first app platform**
- an **AI-assisted app builder**
- an **AI-first app store**

The key distinction is that users do not leave the suite to build apps.
Instead:

1. they learn the platform inside `Cats`
2. they use `Work + Code` inside `Cats` to build an app
3. they install or publish that app back into `Cats`

In other words:

`Cats` should eventually be able to build more `Cats-native apps` from inside
itself.

## The Missing Step Beyond "App Store"

The target is not merely a marketplace full of apps made by other people.

The stronger ambition is:

- users can develop apps themselves
- with AI assistance from day 0
- inside the suite
- and then ship those apps into the suite as installable products

That makes the vision closer to:

- an AI-native operating shell
- an AI-native builder platform
- an AI-native distribution layer

all at once.

## Day 0 User Journey

This vision only works if the platform teaches itself.

### Day 0 must include an AI assistant

From the very first launch, the user should have an AI assistant that helps
them:

- understand what `Cats` is
- learn how the suite works
- discover what `Chat`, `Work`, and `Code` each do
- choose what kind of app or workflow to build
- move from using the platform to creating on the platform

This assistant is not optional polish. It is part of the platform strategy.

Without it, the platform will feel too meta and too complex too early.

### Learning path

The intended learning path is:

1. **Learn to use the suite**
   - understand rooms, cats, tasks, artifacts, settings, permissions
2. **Learn to build with the suite**
   - start a project
   - let `Work` decompose it
   - let `Code` implement and preview it
3. **Learn to publish into the suite**
   - package the result as a Cats-native app
   - install it into the current suite
   - optionally share it later

So the first AI assistant is not just a chat helper. It is also:

- platform coach
- builder guide
- publishing guide

## Role of Chat, Work, and Code

The three product lines become one creation loop.

### Chat

`Chat` remains:

- the easiest entry point
- the natural-language interface
- the learning and coaching surface
- the companion/help layer

It is where ideas begin and where the platform teaches itself.

### Work

`Work` becomes:

- the planning and decomposition layer
- the team and workflow layer
- the place where app requirements become structured work

It turns "I want an app that does X" into:

- plan
- tasks
- approvals
- checkpoints
- release criteria

### Code

`Code` becomes:

- the implementation and preview layer
- the packaging/build layer
- the place where installable Cats-native apps are produced

It turns planned work into:

- code
- assets
- manifests
- previewable product output
- installable app package

## What Counts as a "Cats App"

A Cats-native app should not be defined as just a folder of UI code.

It is better understood as an installable bundle that can include:

- app identity and metadata
- one or more UI surfaces
- one or more cats/companions/teams
- permissions and capability declarations
- settings surfaces
- transport hooks
- memory/data boundaries
- artifact types
- workflows and skill packs
- onboarding and usage guidance

This means an app could look like:

- a companion app
- a team/workflow app
- a productivity tool
- a vertical domain micro-product
- a content or creation app

## Why This Vision Is Strong

This direction is stronger than a generic "AI chat app plus plugins" story for
several reasons:

- it turns `Chat`, `Work`, and `Code` into one coherent creation loop
- it gives `Cats` a platform identity, not just a feature checklist
- it makes AI onboarding part of the product, not a documentation afterthought
- it lets users grow from "using AI" to "building with AI" without leaving the
  suite
- it creates a believable private-first path to a future marketplace without
  requiring public distribution on day one

This is what makes the idea compelling rather than merely large.

## Why "AI-First" Matters

This should not be a traditional app store with AI bolted on.

An AI-first app store means:

- discovery is conversational
- onboarding is assisted
- app generation is assisted
- app configuration is assisted
- publishing is assisted
- installed apps can themselves be agentic

The store is not just a catalog. It is part of the suite's intelligence layer.

## Store, Builder, and Runtime as One System

The long-term loop looks like this:

1. user describes a need in `Chat`
2. `Work` turns it into a product plan
3. `Code` builds the app
4. the suite previews it
5. the suite packages it
6. the user installs it into `Cats`
7. the app becomes part of the suite's available surfaces

That makes the store, builder, and runtime inseparable.

The most important idea is:

> build-in-suite, run-in-suite, install-in-suite

## First Closed Loop

The first successful version of this vision should not try to be a full public
store.

The first real closed loop should be:

1. the user learns the suite with an AI platform coach
2. the user describes an app idea
3. `Work` turns it into a plan
4. `Code` builds and previews it
5. the result is packaged as a private Cats-native app
6. the user installs that app back into their own suite

This is enough to validate the platform thesis without immediately taking on:

- public marketplace discovery
- creator reputation systems
- ratings and reviews
- monetization
- third-party trust and moderation pipelines

## Platform Coach as First-Class Product

The Day 0 assistant deserves first-class treatment.

It should be capable of:

- teaching the suite layout
- explaining product boundaries
- recommending whether something should be a companion, workflow, or app
- helping users pick between `Chat`, `Work`, and `Code`
- guiding them through app creation
- helping them prepare an app for internal or public release

This assistant is effectively the onboarding and enablement layer for the
entire platform.

Without it, only power users will reach the app-builder/store potential.

## Suggested App Lifecycle

### 1. Idea

The user describes a need or a concept.

### 2. Framing

The assistant helps determine:

- is this a companion?
- a workflow/tool?
- a full installable app?
- a private internal app or something later shareable?

### 3. Planning

`Work` creates:

- requirements
- task graph
- acceptance criteria
- release checklist

### 4. Implementation

`Code` generates:

- app code
- assets
- manifests
- preview surfaces

### 5. Preview and iteration

The user tests the app in-suite, not just by reading code.

### 6. Packaging

The output becomes a Cats-native app package.

### 7. Installation

The app is installed into the user's suite.

### 8. Publication

Later, the user may share or publish it for others.

## Private-First, Public-Later

The first store does not need to be a public marketplace.

The strongest first version is probably:

- personal/private suite app catalog
- local install/uninstall/update
- internal app registry

Only later does this need to expand toward:

- shareable packages
- templates
- public marketplace
- ratings/reviews/distribution

Private-first is more achievable and aligns better with the current
desktop-local direction.

## Relationship to Companion Vision

Companion should be one important app category, but not the whole story.

This means:

- some apps are companions
- some apps are tools
- some apps are teams
- some apps are workflows
- some apps are full domain experiences

`Cats` should not flatten all future apps into "just another Cat". The platform
should be able to host richer app identities and surfaces.

## Required Platform Primitives

This vision implies several primitives that the suite will eventually need.

### Packaging and install

- app manifest
- app install/update/remove lifecycle
- app versioning
- compatibility checks

### Surface model

- app entrypoints
- app-owned views or routes
- app settings surfaces
- app artifact surfaces

### Permissions and capabilities

- runtime permissions
- transport permissions
- memory/data access declarations
- tool/capability declarations

### Data and memory

- app-owned storage boundary
- app memory/profile boundary
- import/export rules

### Build and publish pipeline

- preview contract
- packaging contract
- validation contract
- installability contract

### Assistant enablement

- platform coach flows
- builder assistant flows
- publish assistant flows

## What Makes This Different from GPT Store / Plugin Store

The goal is not merely:

- prompt packs
- small plugins
- remote hosted bots

The difference is that `Cats` apps should be:

- suite-native
- installable
- stateful
- multi-surface
- capable of combining UI, cats, tasks, memory, transports, and artifacts

That is a stronger and more product-complete vision than a pure agent or
prompt marketplace.

## Risks

### 1. Platform complexity

If the suite becomes a builder platform too early, users may be overwhelmed.

This is why the Day 0 teaching assistant matters so much.

### 2. Weak app definition

If "app" is under-specified, every future feature will become an ad hoc
special case.

The suite will eventually need a clean app contract.

### 3. Premature public marketplace thinking

Going public-store too early could distract from the more important first step:

- private app creation
- private install
- private suite-native iteration

### 4. Collapsing everything into Chat

The vision only works if `Chat`, `Work`, and `Code` keep distinct roles while
still forming one creation loop.

## Explicit Non-Goals for the First Slice

The first slice of the AI-first app-store direction should **not** try to do
all of the following:

- public marketplace discovery
- creator rankings or ratings
- revenue sharing
- app monetization
- large third-party moderation systems
- giant open plugin ecosystems from day one

Those may become later concerns, but they are not required to prove the core
platform loop.

## Recommendation Summary

1. Treat `Cats` as a future AI-first app platform, not only a chat product.
2. Define success as:
   - learn the suite inside the suite
   - build apps inside the suite
   - install/publish apps back into the suite
3. Make the Day 0 AI assistant a first-class platform coach, not a minor
   onboarding helper.
4. Keep the first store private-first and suite-native.
5. Eventually define a real Cats-native app contract, not just code output.

---

*Research note completed: 2026-03-26*
*Author: Codex*
