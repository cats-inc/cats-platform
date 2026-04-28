import { createWorkspaceProductApp } from "../../shared/renderer/WorkspaceProductApp.js";
import { AppRoutes } from "./AppRoutes";
import { Sidebar } from "./components/Sidebar";
import { BootShell } from "./chatUtils";
import {
  WORK_BROKEN_LINKS_PATH,
  WORK_COCKPIT_PATH,
  WORK_MISSIONS_PATH,
  WORK_PROJECTS_PATH,
  WORK_RUNS_PATH,
  WORK_SYSTEM_MAP_PATH,
  WORK_TASKS_PATH,
  WORK_WAR_ROOM_PATH,
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
      onStartNewGroupChat={props.onStartNewGroupChat}
      onStartNewParallelChat={props.onStartNewParallelChat}
      onOpenWarRoom={() => props.navigate(WORK_WAR_ROOM_PATH)}
      onOpenProjects={() => props.navigate(WORK_PROJECTS_PATH)}
      onOpenProject={(projectId) => props.navigate(`${WORK_PROJECTS_PATH}/${projectId}`)}
      onOpenTasks={() => props.navigate(WORK_TASKS_PATH)}
      onOpenRuns={() => props.navigate(WORK_RUNS_PATH)}
      onOpenMissions={() => props.navigate(WORK_MISSIONS_PATH)}
      onOpenWorkItems={() => props.navigate(WORK_WORK_ITEMS_PATH)}
      onOpenSystemMap={() => props.navigate(WORK_SYSTEM_MAP_PATH)}
      onOpenCockpit={() => props.navigate(WORK_COCKPIT_PATH)}
      onOpenBrokenLinks={() => props.navigate(WORK_BROKEN_LINKS_PATH)}
    />
  ),
});
