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
