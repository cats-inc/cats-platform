import { Navigate, Route, Routes } from 'react-router-dom';

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
import { IntakeForm } from './components/IntakeForm.js';
import {
  NewChatDraft,
  type NewChatDraftProps,
} from './components/NewChatDraft.js';
import { PlanReviewPanel } from './components/PlanReviewPanel.js';

function noop(): void {}

type ChatSurfaceProps = Omit<
  ChatViewProps,
  'payload' | 'selectedChannel'
>;

type DraftSurfaceProps = Omit<
  NewChatDraftProps,
  'payload' | 'onOpenAddCat' | 'onDraftLeadCatChange' | 'allowAddCat'
>;

export interface AppRoutesProps {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView | null;
  directLaneChannel: SelectedChannelView | null;
  showDirectLaneBoot: boolean;
  feedback: string;
  busy: string;
  chatSurfaceProps: ChatSurfaceProps;
  draftSurfaceProps: DraftSurfaceProps;
  addCatOpen: boolean;
  onToggleAddCat: () => void;
  addCatPanelProps: Omit<AddCatPanelProps, 'busy' | 'feedback'>;
  folderBrowserProps: FolderBrowserContentProps;
  onOpenDraftAddCat: () => void;
  onChangeDraftLeadCat: (catId: string | null) => void;
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
            showDirectLaneBoot ? (
              <BootShell />
            ) : directLaneChannel ? (
              <ChatView
                {...chatSurfaceProps}
                payload={payload}
                selectedChannel={directLaneChannel}
                onOpenAddCat={noop}
                showAddCatButton={false}
              />
            ) : (
              <NewChatDraft
                {...draftSurfaceProps}
                payload={payload}
                onOpenAddCat={noop}
                onDraftLeadCatChange={noop}
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
          path="intake"
          element={<IntakeForm />}
        />
        <Route
          path="intake/:projectId"
          element={<PlanReviewPanel />}
        />
        <Route
          path="new"
          element={
            <NewChatDraft
              {...draftSurfaceProps}
              payload={payload}
              onOpenAddCat={onOpenDraftAddCat}
              onDraftLeadCatChange={onChangeDraftLeadCat}
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
