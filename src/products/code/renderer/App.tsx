import { createWorkspaceProductApp } from "../../shared/renderer/WorkspaceProductApp.js";
import { AppRoutes } from "./AppRoutes";
import { Sidebar } from "./components/Sidebar";
import { BootShell } from "./chatUtils";
import {
  CODE_ARTIFACTS_PATH,
  CODE_BUILD_PATH,
  CODE_RELAY_PATH,
  CODE_WORKSPACES_PATH,
  buildCodeWorkspacePath,
} from "./codePaths.js";
import "./styles.css";

export default createWorkspaceProductApp({
  productName: "Code",
  shellSurface: "code",
  supportsStructuredDraftModes: true,
  BootShell,
  AppRoutesComponent: AppRoutes,
  renderSidebar: (props) => (
    <Sidebar
      {...props}
      onStartNewGroupChat={props.onStartNewGroupChat}
      onStartNewParallelChat={props.onStartNewParallelChat}
      onOpenWorkspaces={() => props.navigate(CODE_WORKSPACES_PATH)}
      onOpenWorkspace={(workspaceId) =>
        props.navigate(buildCodeWorkspacePath(workspaceId))
      }
      onOpenArtifacts={() => props.navigate(CODE_ARTIFACTS_PATH)}
      onOpenRelay={() => props.navigate(CODE_RELAY_PATH)}
      onOpenBuild={() => props.navigate(CODE_BUILD_PATH)}
    />
  ),
});
