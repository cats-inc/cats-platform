import { Route } from 'react-router-dom';

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
import {
  ChatView,
  type ChatViewProps,
} from './components/ChatView.js';
import { ActiveSessionPermissionChip } from '../../shared/renderer/components/ActiveSessionPermissionChip.js';
import { ComposerSurfaceChip } from '../../shared/renderer/components/ComposerSurfaceChip.js';
import { IntakeForm } from './components/IntakeForm.js';
import {
  NewChatDraft,
  type NewChatDraftProps,
} from './components/NewChatDraft.js';
import { PlanReviewPanel } from './components/PlanReviewPanel.js';
import { ProjectListView } from './components/ProjectListView.js';
import { ProjectDetailView } from './components/ProjectDetailView.js';
import { WorkTaskListView } from './components/WorkTaskListView.js';
import { TaskDetailView } from './components/TaskDetailView.js';
import { WarRoomView } from './components/WarRoomView.js';
import { WorkItemListView } from './components/WorkItemListView.js';
import { WorkItemDetailView } from './components/WorkItemDetailView.js';
import {
  WorkspaceAppRoutes,
  type WorkspaceAppRoutesProps,
} from '../../shared/renderer/WorkspaceAppRoutes.js';

type ChatSurfaceProps = Omit<
  ChatViewProps,
  'payload' | 'selectedChannel'
>;

type DraftSurfaceProps = Omit<
  NewChatDraftProps,
  'payload' | 'onOpenAddCat' | 'onDraftDefaultRecipientChange' | 'allowAddCat'
>;

export interface AppRoutesProps extends Omit<
  WorkspaceAppRoutesProps,
  | 'entryPath'
  | 'chatsPath'
  | 'extraRoutes'
  | 'renderBootShell'
  | 'renderChatView'
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
  directLaneChannel,
  showDirectLaneBoot,
  feedback,
  busy,
  chatSurfaceProps,
  draftSurfaceProps,
  addCatOpen,
  onToggleAddCat,
  addCatPanelProps,
  folderBrowserProps,
  onOpenDraftAddCat,
  onChangeDraftDefaultRecipient,
}: AppRoutesProps) {
  const folderBrowserSurfaceProps = folderBrowserProps;

  return WorkspaceAppRoutes({
    payload,
    selectedChannel,
    directLaneChannel,
    showDirectLaneBoot,
    feedback,
    busy,
    addCatOpen,
    entryPath: resolveAppEntryPath(payload.setupCompleteAt),
    chatsPath: resolveVisibleChatPath(payload.chat.channels, payload.chat.selectedChannelId),
    extraRoutes: [
      <Route key="war-room" path="war-room" element={<WarRoomView />} />,
      <Route key="intake" path="intake" element={<IntakeForm />} />,
      <Route key="intake-project" path="intake/:projectId" element={<PlanReviewPanel />} />,
      <Route key="project-list" path="projects" element={<ProjectListView />} />,
      <Route key="project-detail" path="projects/:projectId" element={<ProjectDetailView />} />,
      <Route key="task-list" path="tasks" element={<WorkTaskListView />} />,
      <Route key="task-detail" path="tasks/:taskId" element={<TaskDetailView />} />,
      <Route key="work-item-list" path="work-items" element={<WorkItemListView />} />,
      <Route key="work-item-detail" path="work-items/:workItemId" element={<WorkItemDetailView />} />,
    ],
    renderBootShell: () => <BootShell />,
    renderChatView: (channel, options) => (
      <ChatView
        {...chatSurfaceProps}
        payload={payload}
        selectedChannel={channel}
        onOpenAddCat={options.onOpenAddCat}
        showAddCatButton={options.showAddCatButton}
        renderComposerHeaderAccessory={(ctx) => (
          <ActiveSessionPermissionChip channel={ctx.selectedChannel} />
        )}
        renderComposerSurfaceTag={() => <ComposerSurfaceChip surface="work" />}
      />
    ),
    renderNewChatDraft: (options) => (
      <NewChatDraft
        {...draftSurfaceProps}
        payload={payload}
        onOpenAddCat={options.onOpenAddCat}
        onDraftDefaultRecipientChange={options.onDraftDefaultRecipientChange}
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
    onChangeDraftDefaultRecipient,
  });
}
