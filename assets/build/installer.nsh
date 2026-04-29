; --- Per-user-only install: suppress multi-user choice page ---
;
; Cats packaged setup helpers (Install-ClaudeCode.ps1, Install-NodeCliPack.ps1,
; etc.) refuse to run under an elevated shell because every CLI provider we
; install (Claude / Cursor / Goose / Junie / npm-global pack / Ollama) is
; user-scoped: binaries land in $env:USERPROFILE\.local\bin or
; %LOCALAPPDATA%, auth files live under the user's profile, and the npm
; prefix is per-user. An all-users install would put Cats.exe under
; Program Files but every spawned helper would either reject elevation or
; write into the wrong profile, so the choice is a footgun. Define
; MULTIUSER_INSTALLMODE_NO_PAGE in customHeader before electron-builder's
; bundled MultiUser.nsh runs so the install-mode page is skipped while the
; rest of the wizard (license, install directory) stays available.
!macro customHeader
  !define MULTIUSER_INSTALLMODE_NO_PAGE
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

  ${NSD_CreateLabel} 0 0 100% 40u "Cats will be uninstalled. You may also choose to remove all user data (settings, logs, and sessions)."
  Pop $0

  ${NSD_CreateCheckbox} 0 50u 100% 16u "Remove all user data ($PROFILE\.cats)"
  Pop $RemoveUserDataCheckbox
  ${NSD_SetState} $RemoveUserDataCheckbox ${BST_UNCHECKED}

  nsDialogs::Show
FunctionEnd

Function un.UserDataRemovalPageLeave
  ${NSD_GetState} $RemoveUserDataCheckbox $RemoveUserDataState
FunctionEnd

!endif

!macro customUnInstall
  ; Always clean Electron internal cache (not user-meaningful).
  RMDir /r "$APPDATA\Cats"
  ${If} $RemoveUserDataState == ${BST_CHECKED}
    RMDir /r "$PROFILE\.cats"
  ${EndIf}
!macroend
