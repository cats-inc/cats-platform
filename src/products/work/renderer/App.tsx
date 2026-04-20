import { createWorkspaceProductApp } from "../../shared/renderer/WorkspaceProductApp.js";
import { AppRoutes } from "./AppRoutes";
import { Sidebar } from "./components/Sidebar";
import { BootShell } from "./chatUtils";
import "./styles.css";

export default createWorkspaceProductApp({
  productName: "Work",
  shellSurface: "work",
  supportsStructuredDraftModes: true,
  BootShell,
  AppRoutesComponent: AppRoutes,
  renderSidebar: (props) => (
    <Sidebar
      {...props}
      onStartWorkIntake={() => props.navigate("/work/intake")}
      onOpenWarRoom={() => props.navigate("/work/war-room")}
      onOpenProjects={() => props.navigate("/work/projects")}
      onOpenTasks={() => props.navigate("/work/tasks")}
      onOpenWorkItems={() => props.navigate("/work/work-items")}
    />
  ),
});
