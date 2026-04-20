import { createWorkspaceProductApp } from "../../shared/renderer/WorkspaceProductApp.js";
import { AppRoutes } from "./AppRoutes";
import { Sidebar } from "./components/Sidebar";
import { BootShell } from "./chatUtils";
import {
  WORK_INTAKE_PATH,
  WORK_WAR_ROOM_PATH,
  WORK_PROJECTS_PATH,
  WORK_TASKS_PATH,
  WORK_WORK_ITEMS_PATH,
} from "./workPaths.js";
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
      onStartWorkIntake={() => props.navigate(WORK_INTAKE_PATH)}
      onOpenWarRoom={() => props.navigate(WORK_WAR_ROOM_PATH)}
      onOpenProjects={() => props.navigate(WORK_PROJECTS_PATH)}
      onOpenTasks={() => props.navigate(WORK_TASKS_PATH)}
      onOpenWorkItems={() => props.navigate(WORK_WORK_ITEMS_PATH)}
    />
  ),
});
