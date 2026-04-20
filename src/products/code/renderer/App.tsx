import { createWorkspaceProductApp } from "../../shared/renderer/WorkspaceProductApp.js";
import { AppRoutes } from "./AppRoutes";
import { Sidebar } from "./components/Sidebar";
import { BootShell } from "./chatUtils";
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
      onOpenRelay={() => props.navigate("/code/relay")}
      onOpenBuild={() => props.navigate("/code/build")}
    />
  ),
});
