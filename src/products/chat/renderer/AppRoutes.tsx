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
import {
  FolderBrowser,
  type FolderBrowserProps,
} from './components/FolderBrowser.js';
import {
  ChatView,
  type ChatViewProps,
} from './components/ChatView.js';
import {
  NewChatDraft,
  type NewChatDraftProps,
} from './components/NewChatDraft.js';
import { SettingsCats } from './components/SettingsCats.js';
import { SettingsData } from './components/SettingsData.js';
import { SettingsGeneral } from './components/SettingsGeneral.js';
import { SetupWizard } from './components/SetupWizard.js';

function noop(): void {}

type ChatSurfaceProps = Omit<
  ChatViewProps,
  'payload' | 'selectedChannel' | 'addCatOpen' | 'onToggleAddCat' | 'showAddCatButton'
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
  onToggleAddCat: () => void;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  onFeedback: (message: string) => void;
  onBusy: (key: string) => void;
  onResetSetup: () => void;
  addCatOpen: boolean;
  addCatPanelProps: Omit<AddCatPanelProps, 'busy' | 'feedback'>;
  folderBrowserProps: FolderBrowserProps & {
    folderBrowserOpen: boolean;
  };
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
  onToggleAddCat,
  onPayloadUpdate,
  onFeedback,
  onBusy,
  onResetSetup,
  addCatOpen,
  addCatPanelProps,
  folderBrowserProps,
  onOpenDraftAddCat,
  onChangeDraftLeadCat,
}: AppRoutesProps) {
  const { folderBrowserOpen, ...folderBrowserSurfaceProps } = folderBrowserProps;

  if (!payload.setupCompleteAt) {
    return (
      <Routes>
        <Route
          path="/setup"
          element={
            <SetupWizard
              payload={payload}
              onComplete={onPayloadUpdate}
            />
          }
        />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={resolveAppEntryPath(payload.setupCompleteAt)} replace />}
        />
        <Route
          path="/setup"
          element={<Navigate to={resolveAppEntryPath(payload.setupCompleteAt)} replace />}
        />
        <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
        <Route
          path="/settings/general"
          element={
            <SettingsGeneral
              payload={payload}
              feedback={feedback}
              onPayloadUpdate={onPayloadUpdate}
              onFeedback={onFeedback}
            />
          }
        />
        <Route
          path="/settings/cats"
          element={
            <SettingsCats
              payload={payload}
              feedback={feedback}
              busy={busy}
              onPayloadUpdate={onPayloadUpdate}
              onFeedback={onFeedback}
              onBusy={onBusy}
            />
          }
        />
        <Route
          path="/settings/data"
          element={
            <SettingsData
              feedback={feedback}
              busy={busy}
              onResetSetup={onResetSetup}
            />
          }
        />
        <Route
          path="/chats/:channelId"
          element={
            selectedChannel ? (
              <ChatView
                {...chatSurfaceProps}
                payload={payload}
                selectedChannel={selectedChannel}
                addCatOpen={addCatOpen}
                onToggleAddCat={onToggleAddCat}
              />
            ) : (
              <BootShell />
            )
          }
        />
        <Route
          path="/chats"
          element={
            <Navigate
              to={resolveVisibleChatPath(payload.chat.channels, payload.chat.selectedChannelId)}
              replace
            />
          }
        />
        <Route
          path="/my-cats/:catId"
          element={
            showDirectLaneBoot ? (
              <BootShell />
            ) : directLaneChannel ? (
              <ChatView
                {...chatSurfaceProps}
                payload={payload}
                selectedChannel={directLaneChannel}
                addCatOpen={false}
                onToggleAddCat={noop}
                showAddCatButton={false}
              />
            ) : (
              <NewChatDraft
                {...draftSurfaceProps}
                payload={payload}
                onOpenAddCat={noop}
                onDraftLeadCatChange={noop}
                allowAddCat={false}
              />
            )
          }
        />
        <Route
          path={NEW_CHAT_PATH}
          element={
            <NewChatDraft
              {...draftSurfaceProps}
              payload={payload}
              onOpenAddCat={onOpenDraftAddCat}
              onDraftLeadCatChange={onChangeDraftLeadCat}
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

      {folderBrowserOpen ? (
        <FolderBrowser {...folderBrowserSurfaceProps} />
      ) : null}
    </>
  );
}
