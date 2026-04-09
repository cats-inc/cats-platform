import { createWorkspaceProductApp } from "../../shared/renderer/WorkspaceProductApp.js";
import { AppRoutes } from "./AppRoutes";
import { Sidebar } from "./components/Sidebar";
import { BootShell } from "./chatUtils";
import "./styles.css";

export default createWorkspaceProductApp({
  productName: "Work",
  chatPrefix: "/work",
  shellSurface: "work",
  BootShell,
  AppRoutesComponent: AppRoutes,
  renderSidebar: (props) => (
    <Sidebar
      {...props}
      onStartWorkIntake={() => props.navigate("/work/intake")}
    />
  ),
});
