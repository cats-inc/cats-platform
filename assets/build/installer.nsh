; --- Per-user-only install: skip multi-user choice page ---
;
; Cats packaged setup helpers (Install-ClaudeCode.ps1, the per-CLI
; Install-Codex.ps1 / Install-Copilot.ps1 / ... wrappers around
; _NpmCliInstaller.ps1, native Antigravity setup, etc.) refuse to run under an
; elevated shell because every CLI provider we install (Claude / Antigravity /
; Cursor / Goose / Junie / npm-global CLIs / Ollama) is user-scoped:
; binaries land in $env:USERPROFILE\.local\bin or %LOCALAPPDATA%, auth files
; live under the user's profile, and the npm
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

!define CATS_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define CATS_APPROVED_KEY "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"

; desktopStartup.ts writes Start at login as the HKCU Run value
; DESKTOP_WINDOWS_LOGIN_ITEM_NAME, and neither Electron nor electron-builder
; removes it, so an uninstall deletes it when it starts this installation,
; with the StartupApproved value Task Manager keeps under the same name.
!macro removeLoginEntry RUN_KEY APPROVED_KEY NAME
  Push $R0
  Push $R1
  ClearErrors
  ReadRegStr $R0 HKCU "${RUN_KEY}" "${NAME}"
  ${IfNot} ${Errors}
    StrLen $R1 '"$INSTDIR\'
    StrCpy $R0 $R0 $R1
    ${If} $R0 == '"$INSTDIR\'
      ClearErrors
      DeleteRegValue HKCU "${RUN_KEY}" "${NAME}"
      ${IfNot} ${Errors}
        DeleteRegValue HKCU "${APPROVED_KEY}" "${NAME}"
      ${EndIf}
    ${EndIf}
  ${EndIf}
  Pop $R1
  Pop $R0
!macroend

; NSIS's RMDir /r enters junctions and directory symlinks and empties their
; targets, such as a junctioned node_modules in an agent workspace. cmd's
; rd /s removes such links without entering them, and a root that is itself
; a link loses only the link.
!macro removeDataRoot DIR
  Push $R0
  System::Call 'kernel32::GetFileAttributesW(w "${DIR}") i .R0'
  ${If} $R0 != -1
    IntOp $R0 $R0 & 0x400
    ${If} $R0 != 0
      RMDir "${DIR}"
    ${Else}
      ; The path reaches cmd through a variable, so % and ! in it stay literal.
      System::Call 'kernel32::SetEnvironmentVariableW(w "CATS_REMOVE_ROOT", w "${DIR}") i .R0'
      nsExec::Exec '"$SYSDIR\cmd.exe" /d /v:off /c rd /s /q "%CATS_REMOVE_ROOT%"'
      Pop $R0
      System::Call 'kernel32::SetEnvironmentVariableW(w "CATS_REMOVE_ROOT", i 0) i .R0'
    ${EndIf}
  ${EndIf}
  Pop $R0
!macroend

!ifdef BUILD_UNINSTALLER

Var RemoveUserDataCheckbox
Var RemoveUserDataState
Var RemoveUserDataLeft
Var RemoveUserDataPerUser

; Runs after initMultiUser. A per-machine install would remove another
; account's data, so its uninstall skips the page.
!macro customUnInit
  StrCpy $RemoveUserDataPerUser "1"
  ${If} $installMode == "all"
    StrCpy $RemoveUserDataPerUser ""
  ${EndIf}
!macroend

UninstPage custom un.UserDataRemovalPage un.UserDataRemovalPageLeave

Function un.UserDataRemovalPage
  ${If} $RemoveUserDataPerUser != "1"
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 56u "Cats will be uninstalled. You may also choose to remove all user data. Cats stores data in two locations: Electron UI state (window prefs, localStorage, IndexedDB) under %APPDATA%\Cats, and Cats runtime/platform state (settings, logs, sessions) under %USERPROFILE%\.cats. Downloaded updates in %LOCALAPPDATA%\cats-updater are removed with them. Links inside them are removed, never followed."
  Pop $0

  ${NSD_CreateCheckbox} 0 72u 100% 16u "Remove all user data (%APPDATA%\Cats, %USERPROFILE%\.cats and downloaded updates)"
  Pop $RemoveUserDataCheckbox
  ${NSD_SetState} $RemoveUserDataCheckbox ${BST_UNCHECKED}

  nsDialogs::Show
FunctionEnd

Function un.UserDataRemovalPageLeave
  ${NSD_GetState} $RemoveUserDataCheckbox $RemoveUserDataState
FunctionEnd

!macro noteDataRootLeft DIR
  ${If} ${FileExists} "${DIR}\*.*"
    StrCpy $RemoveUserDataLeft "$RemoveUserDataLeft$\r$\n${DIR}"
  ${EndIf}
!macroend

!endif

!macro customUnInstall
  ; Installing over a copy, updates included, runs this uninstaller silently
  ; with --updated: Start at login must survive that. A per-machine install
  ; would reach another account's profile and registry, so it removes
  ; neither the login entry nor data.
  ${IfNot} ${isUpdated}
  ${AndIf} $installMode != "all"
    !insertmacro removeLoginEntry "${CATS_RUN_KEY}" "${CATS_APPROVED_KEY}" "Cats"
    ; $APPDATA\Cats holds Electron's userData (localStorage, IndexedDB,
    ; Preferences). On Windows the installer-driven upgrade flow runs the old
    ; uninstaller silently before the new version installs, so wiping this
    ; directory unconditionally would reset Chromium-backed prefs every
    ; upgrade. The Guide Cat placement / floatingAnchor / sidecarSeen, the
    ; renderer's product surface memory, and any localStorage-driven UI
    ; state live here, so we only remove it when the user explicitly opts in
    ; via the "Remove all user data" checkbox.
    ${If} $RemoveUserDataState == ${BST_CHECKED}
      !insertmacro removeDataRoot "$APPDATA\Cats"
      !insertmacro removeDataRoot "$PROFILE\.cats"
      !insertmacro removeDataRoot "$LOCALAPPDATA\cats-updater"
      StrCpy $RemoveUserDataLeft ""
      !insertmacro noteDataRootLeft "$APPDATA\Cats"
      !insertmacro noteDataRootLeft "$PROFILE\.cats"
      !insertmacro noteDataRootLeft "$LOCALAPPDATA\cats-updater"
      ${If} $RemoveUserDataLeft != ""
        MessageBox MB_OK|MB_ICONEXCLAMATION "Cats could not remove all of these folders:$RemoveUserDataLeft$\r$\n$\r$\nDelete them by hand, for example after closing programs that use them." /SD IDOK
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
