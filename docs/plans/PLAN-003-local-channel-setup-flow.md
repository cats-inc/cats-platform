# PLAN-003: Local Channel Setup Flow

## Scope

Deliver the first writable workspace setup slice by adding local channel
creation across store, server API, renderer, tests, and docs.

## Tasks

1. Extend the shared workspace contract with a channel-creation input.
2. Add channel-creation support to the workspace store with file-backed persistence.
3. Expose a new workspace API for creating channels and returning the app-shell payload.
4. Add a renderer form that creates a channel and updates the selected workspace view.
5. Update tests and documentation for the new slice.

## Validation

- Typecheck server and renderer code
- Run Node integration tests
- Build both server and renderer successfully

## Risks

- Local-only channel creation can be mistaken for runtime-backed setup if the UI is not clear
- File-backed JSON persistence remains single-user and non-concurrent
- Future session bootstrapping may require reshaping the create-channel payload

---

*Last updated: 2026-03-11*
