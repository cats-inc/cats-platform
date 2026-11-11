# Cat profile publication PoC evidence — 2026-11-11

Implementation branches: Platform `feat/companion-profile-poc`, Runtime
`feat/companion-media-poc`. Product scope and remaining acceptance are tracked in
[PLAN-136](../plans/PLAN-136-cat-profile-posts-media-and-sharing.md).

## Native generation

Runtime [SPEC-044](https://github.com/cats-inc/cats-runtime/blob/main/docs/specs/SPEC-044-reference-media-generation.md)
and its [native evidence](https://github.com/cats-inc/cats-runtime/blob/main/docs/research/2026-11-11-reference-media-native-evidence.md)
record four genuine Grok executions, exact reference paths, session/job IDs and
output hashes: avatar → Paris photograph; photograph → 6-second MP4; source-video
middle frame → new cafe photograph; source-video middle frame → new 6-second MP4.
No output was synthesized by a test stub in those native probes. Host integration
tests use a controlled Runtime to exercise receipt recovery and post sequencing.

## Isolated Windows Desktop

The standard source-candidate command built both members, renderer and Electron
host into a private profile. It used a new fixture account and Cat, no copied
owner conversations/state. Candidate launch ID:
`c67aba52e10c7dfc34385a5c9fab258a28472fb46d30427cbd074f2c4d9569fe`.

| Input | Source digest |
| --- | --- |
| Platform | `da1cdbae71678d9294fd054dd37cba1738121bcd11a92255af2dc8f444ee4d75` |
| Runtime | `2e406ca627a62e92d6ccc21d75d38fa2033feea70ee5f74f4b137cbe55e0eaca` |

Observed in the actual Electron window: Directory profile cover/avatar, two-column
feed, text/photo post, full photograph dialog, remote-access-required hint,
video tab and advancing playback through the 6-second clip. The authenticated
MP4 endpoint returned `206` and exactly 1024 requested bytes. UI input did not
complete a reliable compose/edit/delete walkthrough; those remain covered by
API/domain tests rather than claimed native UI acceptance.

Private evidence remains under workspace `.cache/companion-candidate-2`:
`screenshot-1794409944261.png` (profile), `screenshot-1794409975753.png` (Paris post),
`screenshot-1794410005074.png` (viewer), `screenshot-1794410139863.png` (remote hint),
`screenshot-1794410241419.png` (playing video). The candidate drained with exit 0;
its Runtime and Platform services stopped. The installed user's Desktop was not changed.

The captured candidate predates final backend race fixes, profile-reference
revocation checks and the small cancellation-error UI message. Those changes
were separately rebuilt/typechecked and verified by focused tests; this is not
an exact-final-package acceptance claim.

## Checks and independent review

- Platform server build and renderer `tsc --noEmit` passed; the standard candidate
  also completed Runtime, server, renderer and Desktop builds.
- Initial affected Platform batch: 110/110 passed (ledger, existing direct image
  delivery, generation, media/store, heartbeat and initiative).
- Added regression coverage passed: policy-account idempotency, commit-time share
  settings, stop versus revoke lifecycle, Cat removal, source-reference revoke,
  final async notification lookup revocation, and real authenticated host plus
  dedicated ingress. Final core publication/MCP batch: 33/33 passed.
- Bundled UI/post/ingress regression batch: 20/20 passed after marking native
  Sharp external in the test bundle. Renderer bundle's optional Expo-config
  warning remains; mobile dependencies were not installed for this Desktop PoC.
- Runtime image/reference tests: 18/18 passed, including real local MP4 decode
  and frame extraction, legacy contract 2 and bounded native invocation arguments.
- Independent agent review closed all reported P1/P2 findings; its isolated probes
  confirm no upload after reference revocation and no send after grant revocation.

The real host/ingress test requires no Desktop cookie for the granted post/image,
returns 206 for media ranges, rejects internal MCP routes, preserves private API
authentication and returns 404 after revocation. It uses a local dedicated listener,
not Tailscale, Funnel or ngrok. Local DM idempotency is tested against an isolated
canonical chat store. No real Telegram message or external-phone open was performed.

## Still pending

Live tunnel/owner Telegram configuration and one continuous provider-to-phone
run; native UI compose/edit/delete completion; dedicated video/OG poster;
source/feed server pagination and a frame timestamp picker; cross-platform
FFmpeg/FFprobe packaging and license notices before release. No version bump,
installation upgrade, publication or release was performed.
