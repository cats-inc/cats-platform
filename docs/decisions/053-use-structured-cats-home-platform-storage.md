# ADR-053: Use Structured `~/.cats` Platform Storage

## Status

Accepted

## Context

`cats-platform` has already moved durable user data out of Electron `userData`
and into `~/.cats`, but the platform-owned files are still only partially
structured:

- `chat-state.local.json` defaults under `~/.cats/platform`
- `platform-onboarding-history.json` and `platform-preferences.json` are derived
  as sibling sidecars beside `chat-state.local.json`
- some older documentation still refers to repo-local `config/`
- file-level overrides such as `CATS_STATE_PATH` are easier to reason about than
  directory ownership, but they make the overall storage model fragment over
  time

We want a stable, developer-visible storage contract that:

- keeps platform-owned durable data under `~/.cats/platform`
- separates state/history from configuration
- does not default back into repo-local `cats-platform/config`
- remains compatible with legacy `~/.cats/platform/*.json` layouts when reading
  existing installs

## Decision

`cats-platform` will treat `~/.cats/platform` as the durable platform root and
split platform-owned files into explicit subdirectories:

```text
~/.cats/
  platform/
    state/
      chat-state.local.json
      platform-onboarding-history.json
    config/
      platform-preferences.json
  desktop/
    state.json
    logs/
```

The platform will follow these rules:

1. `CATS_PLATFORM_DIR` is the primary directory-level override for platform
   storage.
2. `CATS_STATE_PATH` remains supported as a fine-grained chat-state override,
   but it is no longer the primary shape of the storage contract.
3. When `CATS_STATE_PATH` is relative, it is resolved under `CATS_PLATFORM_DIR`
   rather than under the current working directory.
4. Default platform state must never fall back to repo-local
   `cats-platform/config`.
5. Helper files derived from the chat-state location must use the structured
   layout:
   - product state/history under `platform/state`
   - platform preferences under `platform/config`
6. Legacy installs that still use `~/.cats/platform/*.json` remain readable.
   The structured layout is canonical for new writes, but legacy root-level
   paths may still be honored when the active chat-state path itself still uses
   the legacy layout.

## Consequences

### Positive

- Platform-owned storage becomes explicit instead of “chat-state plus sibling
  sidecars”.
- New installs stop writing any durable product data into repo-local
  `cats-platform/config`.
- Future migrations can reason about platform state vs platform preferences
  cleanly.
- Desktop and server code can share the same storage vocabulary.

### Negative

- Path helper logic becomes slightly more complex because legacy
  `~/.cats/platform/*.json` paths still need compatibility handling.
- Some tests and docs must be updated to stop assuming sibling sidecars beside
  `chat-state.local.json`.

### Neutral

- `CATS_STATE_PATH` is not removed; it is demoted to a fine-grained override.

## Alternatives Considered

### Alternative 1: Keep all platform files flat under `~/.cats/platform`

- **Pros**: Simpler helpers; no migration considerations.
- **Cons**: State, history, and preferences remain conflated.
- **Why rejected**: We already decided to move toward `DIR`-first ownership.
  Keeping the root flat would preserve the ambiguity we are trying to remove.

### Alternative 2: Put every platform file under `~/.cats/platform/config`

- **Pros**: Single directory; easy to explain.
- **Cons**: `chat-state.local.json` and onboarding history are not configuration.
- **Why rejected**: It misnames durable state/history as config and creates a
  misleading storage model.

## References

- [052-use-canonical-platform-settings-routes-inside-product-shells](./052-use-canonical-platform-settings-routes-inside-product-shells.md)
- `cats-runtime` ADR-030: `Use structured ~/.cats runtime storage with a config subtree`

---

*Decision made: 2026-04-05*
*Decision makers: User, Codex*
