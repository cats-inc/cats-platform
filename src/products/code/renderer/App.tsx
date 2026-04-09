import { createWorkspaceProductApp } from "../../shared/renderer/WorkspaceProductApp.js";
import { AppRoutes } from "./AppRoutes";
import { Sidebar } from "./components/Sidebar";
import { BootShell } from "./chatUtils";
import "./styles.css";

export default createWorkspaceProductApp({
  productName: "Code",
  chatPrefix: "/code",
  shellSurface: "code",
  BootShell,
  AppRoutesComponent: AppRoutes,
  renderSidebar: (props) => (
    <Sidebar
      {...props}
      onOpenRelay={() => props.navigate("/code/relay")}
      onOpenBuild={() => props.navigate("/code/build")}
    />
  ),
});
