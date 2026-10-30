# ADR-144: Install Git as a Desktop Setup Prerequisite

## Status

Accepted — 2026-10-31, from the owner's tool and platform decisions. D1–D3 under
[Decisions to confirm](#decisions-to-confirm) are open for the owner's review.

## Context

Cats Code runs `git` from PATH for worktrees and branches. When `git --version`
fails, cats-runtime reports repository status, commit and push as unsupported, and
it keeps that answer for the life of its process (`isGitAvailable` in
`RuntimeDeliveryService`). Desktop's setup checks Node.js/npm, the npm prefix and
GitHub CLI ([ADR-115](115-bound-bootstrap-and-provider-choices-by-runtime-selection.md),
[ADR-116](116-share-desktop-provider-management-across-onboarding-and-settings.md))
but never Git. On a clean Windows machine Code's git features stay off, and setup
never says why.

`environment-bootstrap` already installs Git on each OS. As in
[ADR-109](109-port-grok-devin-cline-aider-installers-into-packaged-setup.md),
it decides *what* to install; the packaged helpers own the JSON contract and the
non-interactive process.

## Decision

1. **Git is a fourth Desktop prerequisite**, `<platform>-git-installer`, beside
   Node.js/npm, the npm prefix and GitHub CLI. Desktop checks it in the background,
   read-only. It installs only when the user clicks Set up Git.
2. **Windows** (`Install-Git.ps1`, `windows-git-installer`, "Git for Windows")
   installs the full Git for Windows, not MinGit:
   - winget `Git.Git` first, then the official installer from the Git for Windows
     GitHub Releases API. A fresh Windows 11 has shown winget 1.6 failing (exit
     0x8A15005E), so the fallback is part of the normal path.
   - The installer follows the OS architecture: `Git-<version>-64-bit.exe` on x64,
     `Git-<version>-arm64.exe` on ARM64. Assets are matched by name, because a
     `.windows.2` tag ships `Git-<version>.2-…`.
   - It runs with `/VERYSILENT /NORESTART /NOCANCEL /SP- /SUPPRESSMSGBOXES`, elevates
     and relays its result like the GitHub CLI helper, and reports
     `relaunch_required` after an install.
   - A failed or rate-limited API call fails with a manual step pointing at
     https://git-scm.com/download/win. There is no uninstall mode.
3. **macOS** (`install-git.sh`) installs Homebrew's git without prompts
   (`HOMEBREW_NO_ASK`, no stdin). Without Homebrew it returns `changes_required` with
   a manual step naming https://brew.sh: Homebrew comes before Git.
   - Any working git on PATH counts as installed, including the Command Line Tools
     one.
   - `/usr/bin/git` is a stub that opens the Command Line Tools installer. It runs only
     after `xcode-select -p` names a developer directory that contains git.
4. **Linux** (`install-git.sh`) only checks. Platform's Linux helpers never use sudo,
   and environment-bootstrap's interactive `run_sudo` cannot prompt from a hidden
   helper. When git is missing, the manual step names `sudo apt-get install git`,
   `sudo dnf install git` or `sudo yum install git` for the package manager it finds.
   It links git-scm.com when it finds none. The asset declares check only, so Desktop
   offers no Set up button there.
5. **Commit identity**: nothing in Runtime or Platform sets `user.name` or
   `user.email`, and this ADR adds no UI for it. When git is installed but either
   global value is empty, check mode adds the manual step "Set your commit identity:
   …" and keeps the status `ready`.
6. **Readiness audit**: the Windows audit runs the Git helper and plans
   `install_git`, which the setup bridge routes to the Git helper as it routes
   `install_github_cli`. The Unix audit does not list GitHub CLI, and it does not list
   Git.
7. **Manual steps in the prerequisite card**: the shared provider manager lists each
   prerequisite's manual steps in the card's details, and shows Set up Git only where
   the helper can install. Before this the card showed only the generic summary of a
   prerequisite that was not ready, so the Linux command and the identity step would
   have reached no one.

## Decisions to confirm

- **D1. Every Desktop user, not only Cats Code.** The owner had imagined offering
  Git when Code is selected. Desktop's prerequisite list has no per-product gate, and
  the check is read-only, so Git is checked for everyone as GitHub CLI is.
  Installing still waits for a click. A Code-only gate would need product selection
  in the prerequisite path.
- **D2. Linux checks only.** Installing would need sudo from a hidden helper. The user
  runs the named command and checks again.
- **D3. Identity is a manual step only.** There is no form, no default value and no
  status change.

## Consequences

### Positive

- A clean Windows or macOS machine can get Git from Desktop setup, so Code's git
  features have what they need.
- Linux users, and users without a commit identity, see the exact command to run.

### Negative

- Runtime remembers that git was unavailable until it restarts. A newly installed Git
  reaches Code only after Cats relaunches, which is why the Windows and macOS installs
  report `relaunch_required`.
- Desktop's managed-service PATH keeps the inherited PATH first, so on a
  Finder-launched Mac Runtime finds `/usr/bin/git` before Homebrew's. Homebrew's own
  installer brings the Command Line Tools, whose git already passes the check. The
  Homebrew install therefore matters mainly when those tools are missing or broken,
  and then Runtime can still reach the stub. This ADR does not change the PATH order.
- The Windows readiness audit starts one more helper process.

### Neutral

- `-DryRun` is accepted and relayed but not honored, as in the GitHub CLI helper.
  Desktop asks for dry runs only for uninstall previews.

## Alternatives Considered

### 1. MinGit on Windows

- **Pros**: smaller, user-scoped, no installer.
- **Cons**: no Git Bash or credential manager.
- **Why rejected**: the owner chose the full Git for Windows.

### 2. Offer Git only when Code is selected

- **Pros**: users without Code never see Git.
- **Cons**: needs a product gate the prerequisite path does not have.
- **Why rejected**: see D1.

### 3. Run sudo on Linux

- **Pros**: one click on every OS.
- **Cons**: a hidden helper has no terminal for the password, and Platform's Linux
  helpers never escalate.
- **Why rejected**: see D2.

### 4. A commit identity form in Desktop

- **Pros**: no terminal needed.
- **Cons**: the identity belongs to the user's git configuration, and the owner asked
  for no UI.
- **Why rejected**: see D3.

## References

- [SPEC-023: Packaged setup wizard](../specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [SPEC-116: Desktop provider management](../specs/SPEC-116-desktop-provider-management.md)
- environment-bootstrap `platform/windows/Install-Git-Admin.ps1`,
  `platform/windows/Setup-Git.ps1`, `platform/macos/install-git.sh`,
  `platform/linux/install-git.sh`
- cats-runtime `src/core/runtime/RuntimeDeliveryService.ts` (`isGitAvailable`)
