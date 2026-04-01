import { Navigate, Route, Routes } from 'react-router-dom';

import type { AppShellPayload } from '../api/contracts.js';
import {
  NEW_CHAT_PATH,
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
  NewCompareChatDraft,
  type NewCompareChatDraftProps,
} from './components/NewCompareChatDraft.js';
import {
  CompanionWorkspace,
} from './components/companion/CompanionWorkspace.js';
import { ChatSettingsGeneral } from './components/ChatSettingsGeneral.js';
import { SettingsCats } from './components/settings-cats/SettingsCats.js';

function noop(): void {}

type ChatSurfaceProps = Omit<
  ChatViewProps,
  'payload' | 'selectedChannel'
>;

type DraftSurfaceProps = Omit<
  NewChatDraftProps,
  'payload' | 'onOpenAddCat' | 'onDraftLeadCatChange' | 'allowAddCat'
>;

type CompareDraftSurfaceProps = Omit<
  NewCompareChatDraftProps,
  'payload'
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
  compareDraftSurfaceProps: CompareDraftSurfaceProps;
  showingCompareChatDraft: boolean;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  onFeedback: (message: string) => void;
  onBusy: (key: string) => void;
  onResetSetup: () => void;
  addCatOpen: boolean;
  onToggleAddCat: () => void;
  addCatPanelProps: Omit<AddCatPanelProps, 'busy' | 'feedback'>;
  folderBrowserProps: FolderBrowserContentProps;
  onOpenDraftAddCat: () => void;
  onChangeDraftLeadCat: (catId: string | null) => void;
  companionMode: boolean;
  companionCat: AppShellPayload['chat']['cats'][number] | null;
  onToggleCompanionMode: () => void;
  onCompanionWake: (catId: string) => void;
  onCompanionSleep: (catId: string) => void;
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
  compareDraftSurfaceProps,
  showingCompareChatDraft,
  onPayloadUpdate,
  onFeedback,
  onBusy,
  onResetSetup,
  addCatOpen,
  onToggleAddCat,
  addCatPanelProps,
  folderBrowserProps,
  onOpenDraftAddCat,
  onChangeDraftLeadCat,
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
        {/* Product-owned settings live at /chat/settings/*; suite settings stay at /settings/*. */}
        <Route path="settings" element={<Navigate to="/chat/settings/general" replace />} />
        <Route
          path="settings/general"
          element={(
            <ChatSettingsGeneral
              payload={payload}
              feedback={feedback}
              onPayloadUpdate={onPayloadUpdate}
              onFeedback={onFeedback}
            />
          )}
        />
        <Route
          path="settings/cats"
          element={(
            <SettingsCats
              payload={payload}
              feedback={feedback}
              busy={busy}
              onPayloadUpdate={onPayloadUpdate}
              onFeedback={onFeedback}
              onBusy={onBusy}
            />
          )}
        />
        <Route path="settings/data" element={<Navigate to="/settings/data" replace />} />
        <Route path="settings/*" element={<Navigate to="/chat/settings/general" replace />} />
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
          path="new"
          element={
            showingCompareChatDraft ? (
              <NewCompareChatDraft
                {...compareDraftSurfaceProps}
                payload={payload}
              />
            ) : (
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
            )
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
