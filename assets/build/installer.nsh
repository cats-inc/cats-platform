; --- Per-user-only install: skip multi-user choice page ---
;
; Cats packaged setup helpers (Install-ClaudeCode.ps1, Install-NodeCliPack.ps1,
; etc.) refuse to run under an elevated shell because every CLI provider we
; install (Claude / Cursor / Goose / Junie / npm-global pack / Ollama) is
; user-scoped: binaries land in $env:USERPROFILE\.local\bin or
; %LOCALAPPDATA%, auth files live under the user's profile, and the npm
; prefix is per-user. An all-users install would put Cats.exe under
; Program Files but every spawned helper would either reject elevation or
; write into the wrong profile, so the choice is a footgun.
;
; electron-builder's assistedInstaller.nsh inserts PAGE_INSTALL_MODE before
; customHeader runs, so we cannot suppress it via MULTIUSER_INSTALLMODE_NO_PAGE.
; Instead we hook customInstallMode (invoked inside the install-mode PRE
; function in multiUserUi.nsh): forcing $isForceCurrentInstall = "1" makes
; that function take the per-user branch and Abort the page before any UI
; is drawn, so the dialog never appears and the install always lands under
; the current user's profile.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; --- Uninstaller: optional user-data removal ---
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!ifdef BUILD_UNINSTALLER

Var RemoveUserDataCheckbox
Var RemoveUserDataState

UninstPage custom un.UserDataRemovalPage un.UserDataRemovalPageLeave

Function un.UserDataRemovalPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 40u "Cats will be uninstalled. You may also choose to remove all user data. Cats stores data in two locations: Electron UI state (window prefs, localStorage, IndexedDB) under %APPDATA%\Cats, and Cats runtime/platform state (settings, logs, sessions) under %USERPROFILE%\.cats."
  Pop $0

  ${NSD_CreateCheckbox} 0 60u 100% 16u "Remove all user data (%APPDATA%\Cats and %USERPROFILE%\.cats)"
  Pop $RemoveUserDataCheckbox
  ${NSD_SetState} $RemoveUserDataCheckbox ${BST_UNCHECKED}

  nsDialogs::Show
FunctionEnd

Function un.UserDataRemovalPageLeave
  ${NSD_GetState} $RemoveUserDataCheckbox $RemoveUserDataState
FunctionEnd

!endif

!macro customUnInstall
  ; $APPDATA\Cats holds Electron's userData (localStorage, IndexedDB,
  ; Preferences). On Windows the installer-driven upgrade flow runs the old
  ; uninstaller silently before the new version installs, so wiping this
  ; directory unconditionally would reset Chromium-backed prefs every
  ; upgrade. The Guide Cat placement / floatingAnchor / sidecarSeen, the
  ; renderer's product surface memory, and any localStorage-driven UI
  ; state live here, so we only remove it when the user explicitly opts in
  ; via the "Remove all user data" checkbox.
  ${If} $RemoveUserDataState == ${BST_CHECKED}
    RMDir /r "$APPDATA\Cats"
    RMDir /r "$PROFILE\.cats"
  ${EndIf}
!macroend
