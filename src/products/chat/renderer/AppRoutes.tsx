import { Navigate, Route, Routes } from 'react-router-dom';

import type { WorkspaceBusyState } from '../../../shared/workspaceBusy.js';
import type { AppShellPayload } from '../api/contracts.js';
import {
  resolveAppEntryPath,
  resolveVisibleChatPath,
} from '../shared/channelPaths.js';
import { BootShell, type SelectedChannelView } from './chatUtils.js';
import {
  AddCatPanel,
  type AddCatPanelProps,
} from './components/AddCatPanel.js';
import type { FolderBrowserContentProps } from './components/FolderBrowser.js';
import {
  ChatView,
  type ChatViewProps,
} from './components/ChatView.js';
import {
  NewChatDraft,
  type NewChatDraftProps,
} from './components/NewChatDraft.js';
import {
  CompanionWorkspace,
} from './components/companion/CompanionWorkspace.js';
function noop(): void {}

type ChatSurfaceProps = Omit<
  ChatViewProps,
  'payload' | 'selectedChannel'
>;

type DraftSurfaceProps = Omit<
  NewChatDraftProps,
  'payload' | 'onOpenAddCat' | 'onDraftDefaultRecipientChange' | 'allowAddCat'
>;

export interface AppRoutesProps {
  payload: AppShellPayload;
  routeChannelId: string | null;
  selectedChannel: SelectedChannelView | null;
  directLaneChannel: SelectedChannelView | null;
  showDirectLaneBoot: boolean;
  feedback: string;
  busy: WorkspaceBusyState;
  chatSurfaceProps: ChatSurfaceProps;
  draftSurfaceProps: DraftSurfaceProps;
  addCatOpen: boolean;
  onToggleAddCat: () => void;
  addCatPanelProps: Omit<AddCatPanelProps, 'busy' | 'feedback'>;
  folderBrowserProps: FolderBrowserContentProps;
  onOpenDraftAddCat: () => void;
  onChangeDraftDefaultRecipient: (catId: string | null) => void;
  companionMode: boolean;
  companionCat: AppShellPayload['chat']['cats'][number] | null;
  onToggleCompanionMode: () => void;
  onCompanionWake: (catId: string) => void;
  onCompanionSleep: (catId: string) => void;
}

export function AppRoutes({
  payload,
  routeChannelId,
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
  companionMode,
  companionCat,
  onToggleCompanionMode,
  onCompanionWake,
  onCompanionSleep,
}: AppRoutesProps) {
  const folderBrowserSurfaceProps = folderBrowserProps;

  return (
    <>
      <Routes>
        <Route
          index
          element={<Navigate to={resolveAppEntryPath(payload.setupCompleteAt)} replace />}
        />
        <Route
          path="chats/:channelId"
          element={
            selectedChannel ? (
              <ChatView
                {...chatSurfaceProps}
                payload={payload}
                selectedChannel={selectedChannel}
                routeChannelId={routeChannelId}
                onOpenAddCat={onToggleAddCat}
              />
            ) : (
              <BootShell />
            )
          }
        />
        <Route
          path="chats"
          element={
            <Navigate
              to={resolveVisibleChatPath(payload.chat.channels, payload.chat.selectedChannelId)}
              replace
            />
          }
        />
        <Route
          path="my-cats/:catId"
          element={
            companionMode && companionCat ? (
              <CompanionWorkspace
                payload={payload}
                cat={companionCat}
                onBackToChat={onToggleCompanionMode}
                onWake={onCompanionWake}
                onSleep={onCompanionSleep}
              />
            ) : showDirectLaneBoot ? (
              <BootShell />
            ) : directLaneChannel ? (
              <ChatView
                {...chatSurfaceProps}
                payload={payload}
                selectedChannel={directLaneChannel}
                onOpenAddCat={noop}
                showAddCatButton={false}
                onToggleCompanionMode={onToggleCompanionMode}
              />
            ) : (
              <NewChatDraft
                {...draftSurfaceProps}
                payload={payload}
                onOpenAddCat={noop}
                onDraftDefaultRecipientChange={noop}
                allowAddCat={false}
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
            )
          }
        />
        <Route
          path="new"
          element={
            <NewChatDraft
              {...draftSurfaceProps}
              payload={payload}
              onOpenAddCat={onOpenDraftAddCat}
              onDraftDefaultRecipientChange={onChangeDraftDefaultRecipient}
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
          }
        />
        <Route
          path="*"
          element={<Navigate to={resolveAppEntryPath(payload.setupCompleteAt)} replace />}
        />
      </Routes>

      {addCatOpen ? (
        <AddCatPanel
          {...addCatPanelProps}
          busy={busy}
          feedback={feedback}
        />
      ) : null}
    </>
  );
}
