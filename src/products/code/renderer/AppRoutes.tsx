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
import { ArtifactDetailView } from './components/ArtifactDetailView.js';
import { CodeBuilderView } from './components/CodeBuilderView.js';
import { CodeRelayView } from './components/CodeRelayView.js';
import {
  NewChatDraft,
  type NewChatDraftProps,
} from './components/NewChatDraft.js';
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
  'payload' | 'onOpenAddCat' | 'onDraftLeadCatChange' | 'allowAddCat'
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
  onChangeDraftLeadCat,
}: AppRoutesProps) {
  const folderBrowserSurfaceProps = folderBrowserProps;
  const selectedChannelContext = payload.chat.selectedChannel
    ? {
        title: payload.chat.selectedChannel.title,
        repoPath: payload.chat.selectedChannel.repoPath,
        chatCwd: payload.chat.selectedChannel.chatCwd,
      }
    : null;

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
      <Route
        key="relay"
        path="relay"
        element={<CodeRelayView selectedChannelContext={selectedChannelContext} />}
      />,
      <Route
        key="build"
        path="build"
        element={<CodeBuilderView selectedChannelContext={selectedChannelContext} />}
      />,
      <Route
        key="artifact-detail"
        path="artifacts/:artifactId"
        element={<ArtifactDetailView />}
      />,
    ],
    renderBootShell: () => <BootShell />,
    renderChatView: (channel, options) => (
      <ChatView
        {...chatSurfaceProps}
        payload={payload}
        selectedChannel={channel}
        onOpenAddCat={options.onOpenAddCat}
        showAddCatButton={options.showAddCatButton}
      />
    ),
    renderNewChatDraft: (options) => (
      <NewChatDraft
        {...draftSurfaceProps}
        payload={payload}
        onOpenAddCat={options.onOpenAddCat}
        onDraftLeadCatChange={options.onDraftLeadCatChange}
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
    onChangeDraftLeadCat,
  });
}
