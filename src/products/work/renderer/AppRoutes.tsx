import { Navigate, Route, useLocation } from 'react-router-dom';

import {
  resolveAppEntryPath,
  resolveVisibleChatPath,
} from '../shared/channelPaths.js';
import { BootShell } from './chatUtils.js';
import {
  AddCatPanel,
  type AddCatPanelProps,
} from './components/AddCatPanel.js';
import type { FolderBrowserContentProps } from './components/FolderBrowser.js';
import type { ConversationViewProps } from '../../shared/renderer/components/conversation-view/ConversationView.js';
import { ActiveSessionPermissionChip } from '../../shared/renderer/components/ActiveSessionPermissionChip.js';
import type { CanvasRouteOptions } from '../../shared/artifactCanvas/contracts.js';
// Work includes Code (ADR-149 D5, SPEC-141 FR-10): a Work conversation is shown with Code's
// conversation parts. These are the exact edges tests/dependency-graph.test.js allows.
import { CodeConversationView } from '../../code/renderer/components/CodeConversationView.js';
import { CodePreviewCanvasControls } from '../../code/renderer/components/CodePreviewCanvasControls.js';
import { CodeCanvasPreviewButton } from '../../code/renderer/components/CodeCanvasPreviewButton.js';
import { ActiveCodeComposerChips } from '../../code/renderer/components/ActiveCodeComposerChips.js';
import {
  NewChatDraft,
  type NewChatDraftProps,
} from './components/NewChatDraft.js';
import { ProjectDetailPage } from './components/projects/ProjectDetailPage.js';
import { ProjectsListPage } from './components/projects/ProjectsListPage.js';
import { TaskDetailPage } from './components/tasks/TaskDetailPage.js';
import { TasksListPage } from './components/tasks/TasksListPage.js';
import { RunsListPage } from './components/runs/RunsListPage.js';
import { RunDetailPage } from './components/runs/RunDetailPage.js';
import { MissionsListPage } from './components/missions/MissionsListPage.js';
import { MissionDetailPage } from './components/missions/MissionDetailPage.js';
import { SchedulesListPage } from './components/schedules/SchedulesListPage.js';
import { SchedulesDetailPage } from './components/schedules/SchedulesDetailPage.js';
import { WorkItemDetailPage } from './components/work-items/WorkItemDetailPage.js';
import { WorkItemsListPage } from './components/work-items/WorkItemsListPage.js';
import { BrokenLinksPage } from './components/topdown/BrokenLinksPage.js';
import { WorkOverviewPage } from './components/topdown/WorkOverviewPage.js';
import { SystemMapPage } from './components/topdown/SystemMapPage.js';
import {
  WorkspaceAppRoutes,
  type WorkspaceAppRoutesProps,
} from '../../shared/renderer/WorkspaceAppRoutes.js';
import { withSharedViewerRoutes } from '../../shared/renderer/withSharedViewerRoutes.js';

type ChatSurfaceProps = Omit<
  ConversationViewProps,
  'payload' | 'selectedChannel'
>;

type DraftSurfaceProps = Omit<
  NewChatDraftProps,
  'payload' | 'onOpenAddCat' | 'allowAddCat'
>;

const WORK_CONVERSATION_CANVAS_ROUTE: CanvasRouteOptions = { conversationProduct: 'work' };

export interface AppRoutesProps extends Omit<
  WorkspaceAppRoutesProps,
  | 'entryPath'
  | 'chatsPath'
  | 'extraRoutes'
  | 'renderBootShell'
  | 'renderConversationView'
  | 'renderNewChatDraft'
  | 'renderAddCatPanel'
> {
  chatSurfaceProps: ChatSurfaceProps;
  draftSurfaceProps: DraftSurfaceProps;
  addCatPanelProps: Omit<AddCatPanelProps, 'busy' | 'feedback'>;
  folderBrowserProps: FolderBrowserContentProps;
}

export function AppRoutes({
  payload,
  selectedChannel,
  feedback,
  busy,
  chatSurfaceProps,
  draftSurfaceProps,
  addCatOpen,
  onToggleAddCat,
  addCatPanelProps,
  folderBrowserProps,
  onOpenDraftAddCat,
}: AppRoutesProps) {
  const folderBrowserSurfaceProps = folderBrowserProps;

  return WorkspaceAppRoutes({
    payload,
    selectedChannel,
    feedback,
    busy,
    addCatOpen,
    entryPath: resolveAppEntryPath(payload.setupCompleteAt),
    chatsPath: resolveVisibleChatPath(payload.chat.channels, payload.chat.selectedChannelId),
    // The conversation's canvas opens beside it on Work (SPEC-141 FR-9). The surface kind is
    // Code's, so previews and artifacts recorded under it keep working.
    chatCanvasSurfaceKind: 'code_conversation',
    chatCanvasControls: CodePreviewCanvasControls,
    chatCanvasRoute: WORK_CONVERSATION_CANVAS_ROUTE,
    extraRoutes: [
      <Route key="overview" path="overview" element={<WorkOverviewPage />} />,
      <Route key="war-room" path="war-room" element={<RetainedOverviewEntry />} />,
      <Route key="project-list" path="projects" element={<ProjectsListPage />} />,
      withSharedViewerRoutes({
        key: 'project-detail',
        path: 'projects/:projectId',
        surfaceKind: 'work_project',
        surfaceIdParam: 'projectId',
        element: <ProjectDetailPage />,
      }),
      <Route key="task-list" path="tasks" element={<TasksListPage />} />,
      withSharedViewerRoutes({
        key: 'task-detail',
        path: 'tasks/:taskId',
        surfaceKind: 'work_task',
        surfaceIdParam: 'taskId',
        element: <TaskDetailPage />,
      }),
      <Route key="run-detail" path="tasks/:taskId/runs/:runId" element={<RunDetailPage />} />,
      <Route key="run-list" path="runs" element={<RunsListPage />} />,
      <Route key="mission-list" path="missions" element={<MissionsListPage />} />,
      <Route key="mission-detail" path="missions/:missionId" element={<MissionDetailPage />} />,
      <Route key="schedule-list" path="schedules" element={<SchedulesListPage />} />,
      <Route key="schedule-detail" path="schedules/:scheduleId" element={<SchedulesDetailPage />} />,
      <Route key="work-item-list" path="work-items" element={<WorkItemsListPage />} />,
      withSharedViewerRoutes({
        key: 'work-item-detail',
        path: 'work-items/:workItemId',
        surfaceKind: 'work_item',
        surfaceIdParam: 'workItemId',
        element: <WorkItemDetailPage />,
      }),
      <Route key="system-map" path="system-map" element={<SystemMapPage />} />,
      <Route key="cockpit" path="cockpit" element={<RetainedOverviewEntry />} />,
      <Route key="broken-links" path="broken-links" element={<BrokenLinksPage />} />,
    ],
    renderBootShell: () => <BootShell />,
    renderConversationView: (channel, options) => (
      // Work's conversation view and preferences (FR-11), with Code's parts (FR-10): the work
      // areas panel, the preview button, and the branch and workspace chip beside the folder.
      <CodeConversationView
        key={`${payload.scopeId}:${channel.id}`}
        {...chatSurfaceProps}
        payload={payload}
        selectedChannel={channel}
        behaviorSurface="work"
        onOpenAddCat={options.onOpenAddCat}
        showAddCatButton={options.showAddCatButton}
        renderComposerHeaderAccessory={(ctx) => (
          <ActiveSessionPermissionChip channel={ctx.selectedChannel} />
        )}
        renderComposerHeaderWhereExtras={(ctx) => (
          <ActiveCodeComposerChips channel={ctx.selectedChannel} placement="where" />
        )}
        renderTopBarExtraActions={(ctx) => (
          <CodeCanvasPreviewButton
            channelId={ctx.selectedChannel.id}
            artifactId={ctx.operatorView?.latestCanvasArtifactId ?? null}
            canvasRoute={WORK_CONVERSATION_CANVAS_ROUTE}
          />
        )}
      />
    ),
    renderNewChatDraft: (options) => (
      <NewChatDraft
        {...draftSurfaceProps}
        payload={payload}
        onOpenAddCat={options.onOpenAddCat}
        allowAddCat={options.allowAddCat}
        folderBrowsePath={folderBrowserSurfaceProps.folderBrowsePath}
        folderBrowseCurrentPath={folderBrowserSurfaceProps.folderBrowseCurrentPath}
        folderBrowseParentPath={folderBrowserSurfaceProps.folderBrowseParentPath}
        folderBrowseEntries={folderBrowserSurfaceProps.folderBrowseEntries}
        folderBrowseLoading={folderBrowserSurfaceProps.folderBrowseLoading}
        folderBrowseError={folderBrowserSurfaceProps.folderBrowseError}
        onFolderBrowsePathChange={folderBrowserSurfaceProps.onPathChange}
        onFolderBrowse={folderBrowserSurfaceProps.onBrowse}
        onFolderBrowseSelect={folderBrowserSurfaceProps.onSelect}
      />
    ),
    renderAddCatPanel: (options) => (
      <AddCatPanel
        {...addCatPanelProps}
        busy={options.busy}
        feedback={options.feedback}
      />
    ),
    onToggleAddCat,
    onOpenDraftAddCat,
  });
}

function RetainedOverviewEntry() { const location = useLocation(); return <Navigate replace to={{ pathname: "/work/overview", search: location.search }} />; }
