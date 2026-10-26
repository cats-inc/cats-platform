# Provider CLI Session Titles

> Can Cats reuse the summarized titles that Claude Code and Codex show in a
> terminal as conversation titles? Evidence for
> [ADR-140](../decisions/140-let-catlas-curate-assist-content-and-titles-through-host-validated-output.md).

## Question

Interactive Claude Code and Codex sessions rename the terminal window to a
model-written summary. Cats titles a conversation with the first 48 characters
of its first message. Is the provider summary available to Cats?

## Findings

- **How Runtime launches the CLIs.** Claude Code runs as
  `-p --input-format stream-json --output-format stream-json`
  (`cats-runtime/src/backends/cli/providers/claude.ts`). Codex runs as
  `app-server` (`cats-runtime/src/backends/cli/providers/codex.ts`). Neither
  has a terminal, so there is no window-title escape sequence to observe.
- **Claude Code.**
  - Interactive sessions write `{"type":"ai-title","aiTitle":…}` entries to
    their transcript.
  - On the owner's machine, 2026-10-27, Claude Code 2.1.310: both transcripts
    from Runtime-driven sessions (entrypoint `sdk-cli`, more than 40 assistant
    messages each) contained no `ai-title` entry, while interactive sessions in
    the same store did.
  - Print mode does not run the title side call, and reading another tool's
    private transcript would not be a stable contract anyway.
- **Codex.**
  - The 0.164.0 app-server protocol (`codex app-server generate-json-schema`)
    has `Thread.name` ("Optional user-facing thread title"), a
    `thread/name/set` request and a `thread/name/updated` notification.
    `Thread.preview` is "usually the first user message".
  - Runtime does not subscribe to the notification.
  - Whether app-server fills `name` on its own was not verified, because that
    needs a live turn against the owner's account.
- **ACP adapters.** Runtime already maps `session_info_update.title` to
  `adapterState.sessionTitle` and re-emits it on its ACP facade. Platform has
  no consumer.
- **Room shape.** A Cats room has one provider session per participant, while
  the title belongs to the room. Even uniform provider titles would leave
  Platform to choose among them.

## Conclusion

Provider titles may at best inform a title; they cannot be its source.
ADR-140 has Catlas generate one title per conversation through a host-validated
call instead.
