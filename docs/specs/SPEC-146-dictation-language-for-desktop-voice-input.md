# SPEC-146: Dictation language for Desktop voice input

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft; D1–D3 resolved under the owner's delegation, 2026-11-16 |
| **Owner** | Desktop host maintainers |
| **Reviewer** | Product owner |
| **Amends** | [SPEC-084](SPEC-084-composer-voice-input-via-platform-native-stt.md) Req 15 and its locale-picker open question; [SPEC-145](SPEC-145-feature-packs-and-linux-dictation.md) FR-C2, FR-C4, FR-C5 and AC-06 (D2) |

## Summary

On macOS and Windows, Desktop never chooses the dictation language; the
operating system does. The owner asked (2026-11-16) for these platforms to
read the dictation language setting that SPEC-145 gave Linux.

This SPEC makes that setting one Desktop setting, shown in a new **Voice
input** section of Settings > Desktop on every platform. It also specifies how
the host turns the setting into each helper's `--locale`.

## Current behavior

- **Desktop never passes a language.** Desktop's composers call
  `useVoiceInputComposer` without `lang`, and the host adds `--locale` only
  when a locale arrives (`buildVoiceCaptureHelperArgs`).
- **macOS.** Without `--locale`, the helper uses `Locale.current`. A locale
  that is unavailable, or lacks on-device recognition, emits
  `language_not_supported`.
- **Windows.** Without `--locale`, the helper constructs `SpeechRecognizer()`,
  which uses the system speech language, with the dictation topic constraint.
  A failed constraint compilation emits `language_not_supported`.
- **Linux.** SPEC-145 FR-C5 applies: the dictation language setting, with
  detection from speech as Automatic.
- **Other language settings.** Desktop's UI language and AI reply language do
  not reach voice input, and this SPEC keeps it that way.

## Goals

- **Choose without changing the OS.** An owner can dictate in a language other
  than the operating system's on every Desktop platform.
- **One setting, one place.** A single setting, in one place, with the same
  storage on every platform.
- **Only working choices.** macOS and Windows offer only languages that the
  machine can actually recognize (D1).

## Non-Goals

- **The Web deployment.** Browser Web Speech is unchanged.
- **Cats Bot.** It ported these helpers, and a Bot ADR follows.
- **Other places and features.** A language picker in the composer, detection
  from speech on macOS or Windows, and Chinese script conversion.
- **Windows privacy.** The Windows privacy posture (`mode: "unknown"`) is
  unchanged.
- **The open Windows defect.** SPEC-084 records that Windows text never reached
  the composer (2026-09-27 note). Fixing that is not part of this SPEC.

## Requirements

**FR-1 — One setting (host).**

- `dictationLanguage` lives in the Desktop preferences file, as SPEC-145 FR-C5
  defines it. Its value is `"auto"` or a BCP 47 tag that is valid for this
  platform:
  - on Linux, a primary subtag from the pack manifest;
  - on macOS and Windows, a tag from the helper's list (FR-3).
- The host validates a new value against the platform's current options before
  saving.
- A missing or invalid stored value means `"auto"`.
- **Shared storage.** The server rewrites the preferences file from its own
  normalized fields, so `dictationLanguage` is one of them. The server checks
  only its shape (a language subtag and up to four more) and never changes it.
  Platform data reset keeps it with the other Desktop preferences.

**FR-2 — What Automatic means (host).**

- On Linux, the helper detects the language from speech (SPEC-145 FR-D7).
- On macOS and Windows, the host passes no `--locale`, so the helper uses the
  system language as it does today. Neither platform offers detection from
  speech.

**FR-3 — Where the options come from (host, helpers).**

- **Linux.** The active pack manifest's `languages` (SPEC-145 FR-A3).
- **macOS and Windows** (D1). The platform's native helper gains
  `--list-languages`:
  - It prints exactly one stdout line,
    `{ "type": "languages", "system": "<tag>" | null, "languages": ["<tag>", …] }`,
    and exits with status 0. Tags use BCP 47 hyphens, with the region the
    platform reports, such as `zh-TW`.
  - **macOS** lists the locales whose recognizer is available and supports
    on-device recognition, the same test a session applies today.
  - **Windows** lists the languages that the dictation topic constraint
    supports.
  - It opens no microphone and must not cause a permission prompt. If the
    platform cannot list without one, it prints an empty `languages`.
  - The host kills a listing after 5 seconds, and treats a timeout, a non-zero
    exit or malformed output as "no list".
  - Malformed means anything but one such line: no line or a second one,
    invalid JSON, another `type`, or a non-string entry. A string tag outside
    the host's tag shape is dropped, and the rest of the list stays.
  - Today's helpers reject the flag and exit 2, so they offer Automatic only.

**FR-4 — Fetching the options (host).**

- The host lists when the Voice input section asks for options, one listing at
  a time.
- It keeps the result for the app session and refreshes it each time the
  section opens.
- With no list, the only option is Automatic.

**FR-5 — Session start (host).**

- **Automatic.** The host passes no `--locale` on macOS and Windows. Linux
  follows SPEC-145 FR-C5.
- **A saved tag on macOS and Windows.** The host passes `--locale <tag>` as
  saved, without listing first.
  - A language that is no longer available makes the helper emit
    `language_not_supported`, as it does today.
  - The composer's toast for that reason gains **Open Settings**, which opens
    the Voice input section (D3).
  - There is no silent fallback to the system language. Without detection
    from speech, that would recognize the wrong language.
- **A saved tag on Linux.** SPEC-145 FR-C5 applies: a subtag missing from the
  manifest runs as Automatic, which still detects from speech.
- **Renderer locales.** On every platform, the Desktop host ignores a locale
  sent by the renderer.
  - This amends SPEC-084 Req 15, under which an explicit user choice reached
    the host through the renderer's `options.locale`. That choice now comes
    from Settings.
  - It also resolves SPEC-084's open question about a locale picker.
- **Timing.** A change applies to the next recording, not to one in progress.
  - The host reads the setting before it starts the helper. A stop or cancel
    that arrives meanwhile ends the session without one, as SPEC-145's pack
    check does.
  - A setting that cannot be read means Automatic.

**FR-6 — Settings (renderer).**

- **Placement.** Settings > Desktop gains a **Voice input** section:
  - after Startup behavior, and before SPEC-145's Optional downloads on Linux;
  - shown wherever Desktop has a native voice bridge: always on macOS and
    Windows, and on Linux per SPEC-145 FR-D1.
- **The "Dictation language" select.**
  - The first option is Automatic, labelled per platform:
    - on Linux, "Automatic (detect from speech)";
    - on macOS and Windows, "Follow system". When the list reports `system`,
      the label adds its native name, for example "Follow system (中文（台灣）)".
  - The other options follow in tag order, each labelled with its own native
    name from `Intl.DisplayNames` in that language, such as "中文（台灣）" and
    "English (United States)". A tag the runtime cannot name shows as the tag.
  - A saved tag that is no longer among the options stays selected, labelled
    "<name> (not available)", and cannot be chosen again.
- **Linux before the pack.** The select is disabled until `linux-stt` allows
  dictation (its `usable`, not its status). A line points to Optional
  downloads, with a button that scrolls there. The options reload when the
  pack starts or stops allowing dictation.
- **Help text.**
  - **Linux:** SPEC-145 FR-C5's text, that short phrases may be detected
    wrongly and Chinese may come out in Simplified characters.
  - **macOS:** only languages available for on-device recognition are listed.
  - **Windows:** the existing Windows privacy message.
- **Feedback.** Feedback follows AGENTS.md's Settings UI rules: silent on
  success, and a toast that restores the previous value on failure.

**FR-7 — Bridge (host).**

- The host bridge gains `getDictationLanguageOptions()`. It returns:
  - `{ automatic: "detect" | "system", system?: string, options: string[], value: string }`.
  - `value` is the saved value, which may no longer be among `options`.
- It also gains `setDictationLanguage(value)`.
- Both accept the Platform window's main frame only. `value` is validated per
  FR-1.
- They replace SPEC-145 FR-C4's `setLanguage(id, value)` and its language
  fields.

**FR-8 — Strings (renderer).** Every new string has `en` and `zh-TW` catalog
entries.

### Changes to SPEC-145 (D2)

- **FR-C2.** The dictation language select leaves the Optional downloads row.
  The row points to Voice input instead.
- **FR-C4.** The pack bridge loses `setLanguage` and the language fields.
- **FR-C5.** The Linux rules stay:
  - options from the manifest;
  - Automatic detects from speech;
  - a subtag missing from the manifest runs as Automatic;
  - the host passes `--locale`.

  The control, its help text and its feedback move to this SPEC's FR-6.
- **AC-06.** The select is checked in Voice input.

## Acceptance Criteria

- **AC-01 — Host.**
  - The helper arguments for Automatic and for a tag, on each platform.
  - A renderer locale is ignored.
  - A saved value is validated.
  - A listing timeout, a non-zero exit or malformed output leaves Automatic
    only.
- **AC-02 — Listing contract.** Scripted macOS and Windows helpers that print
  valid, empty and malformed `languages` lines are handled as FR-3 and FR-4
  say.
- **AC-03 — Settings.**
  - Section visibility per platform, and the Automatic labels.
  - The Linux disabled state.
  - The choice persists across a restart and a Platform data reset.
  - Feedback is toast-only, and `en` and `zh-TW` strings exist.
- **AC-04 — macOS (manual, on a real Mac).**
  - With the system language set to English, choosing 中文（台灣） dictates
    Chinese on-device.
  - Listing causes no permission prompt.
  - Making that language unavailable gives `language_not_supported` with
    **Open Settings**.
- **AC-05 — Windows (manual).**
  - Listing works, and choosing a language other than the system's reaches
    `ready`.
  - Text reaching the composer is accepted only after SPEC-084's open Windows
    defect is fixed.

## Resolved Decisions

The owner delegated D1–D3 on 2026-11-16.

- **D1 — Where the macOS and Windows options come from: the helper's
  `--list-languages`.**
  - It offers only languages that work on that machine, and the session path
    stays unchanged.
  - The cost is new Swift and C# code in `desktop/native/`, which Bot's ported
    copies take later.
  - A fixed list in Desktop was rejected because it would offer languages the
    machine cannot recognize, and those fail only when a recording starts.
- **D2 — Move the Linux control to Voice input.**
  - Every platform now sets the language in one place.
  - This moves the control out of the SPEC-145 Optional downloads row that the
    owner had approved. The row now links to Voice input, and SPEC-145 is
    amended as listed above.
- **D3 — An unavailable saved language on macOS or Windows fails closed.**
  - The composer shows a `language_not_supported` toast with **Open Settings**.
  - A silent fallback to the system language was rejected: without detection
    from speech, it would recognize the wrong language.

## Follow-up

- A Bot ADR that adopts the setting for Bot's notes, and ports FR-3 to Bot's
  copies of the helpers.

## References

- [SPEC-084](SPEC-084-composer-voice-input-via-platform-native-stt.md), [SPEC-145](SPEC-145-feature-packs-and-linux-dictation.md), [SPEC-111](SPEC-111-packaged-desktop-update-surfaces-and-release-contract.md)
- [ADR-079](../decisions/079-use-platform-native-stt-with-linux-toast-fallback.md), [ADR-154](../decisions/154-deliver-optional-native-dependencies-as-host-managed-feature-packs.md)
- [Bot ADR-018](https://github.com/cats-inc/cats-bot/blob/main/docs/decisions/018-dictate-through-native-speech-helpers.md)

---

*Created: 2026-11-16*
*Related Plan: [PLAN-138](../plans/PLAN-138-feature-packs-linux-dictation-and-dictation-language.md)*
