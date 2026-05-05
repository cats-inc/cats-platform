import { Navigate, Route, Routes } from 'react-router-dom';

import type { WorkspaceBusyState } from '../../../shared/workspaceBusy.js';
import type { AppShellPayload } from '../api/contracts.js';
import {
  resolveAppEntryPath,
  resolveVisibleChatPath,
} from '../shared/channelPaths.js';
import { resolveCatStatusIndicator } from '../shared/catStatusResolution.js';
import { BootShell, hasCompanionSkill, type SelectedChannelView } from './chatUtils.js';
import {
  AddCatPanel,
  type AddCatPanelProps,
} from './components/AddCatPanel.js';
import { CatStatusRow } from './components/CatStatusRow.js';
import type { FolderBrowserContentProps } from './components/FolderBrowser.js';
import {
  ChatView,
  type ChatViewProps,
} from '../../shared/renderer/components/chat-view/ChatView.js';
import { ActiveSessionPermissionChip } from '../../shared/renderer/components/ActiveSessionPermissionChip.js';
import {
  NewChatDraft,
  type NewChatDraftProps,
} from './components/NewChatDraft.js';
import { ChatComposerTargetSlot } from '../../shared/renderer/components/chat-view/ChatComposerTargetSlot.js';
import { CompanionModeToggleChip } from './components/companion/CompanionModeToggleChip.js';
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
  onCatAvatarSave?: (catId: string, dataUrl: string) => void;
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
  onCatAvatarSave,
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
                renderComposerHeaderAccessory={(ctx) => (
                  <ActiveSessionPermissionChip channel={ctx.selectedChannel} />
                )}
                renderComposerTargetSlot={(context) => (
                  <ChatComposerTargetSlot
                    payload={context.payload}
                    composerBusy={context.composerBusy}
                    composerRecipients={context.composerRecipients}
                    defaultRecipientParticipantId={context.defaultRecipientParticipantId}
                    composerStackParticipants={context.composerStackParticipants}
                    directLaneCat={context.directLaneCat}
                    isDirectLane={context.isDirectLane}
                    isSoloComposer={context.isSoloComposer}
                    activeWorkflowShape={context.activeWorkflowShape}
                    onToggleActiveWorkflowShape={context.onToggleActiveWorkflowShape}
                    activeAudienceKeys={context.activeAudienceKeys}
                    onSetActiveAudienceKeys={context.onSetActiveAudienceKeys}
                    onOpenSection={context.onOpenSection}
                  />
                )}
                renderStatusRow={(context) => {
                  const indicators = context.activeAssignedCats
                    .map((assignment) => {
                      const cat = context.payload.chat.cats.find((candidate) => candidate.id === assignment.catId);
                      if (!cat) {
                        return null;
                      }
                      return resolveCatStatusIndicator(
                        cat,
                        context.selectedChannel,
                        context.operatorView,
                      );
                    })
                    .filter((indicator): indicator is NonNullable<typeof indicator> => indicator != null);
                  return indicators.length > 0 ? (
                    <CatStatusRow
                      indicators={indicators}
                      onInspect={(catId) => context.openSidePanelTo(`cat:${catId}`)}
                    />
                  ) : null;
                }}
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
          path="dm/:catId"
          element={
            /* DIRECT MESSAGES is now strictly the dm channel surface —
             * the per-cat companion workspace toggle was removed so a
             * cat with the companion skill still presents its dm row
             * in the sidebar with no inline mode switch. CompanionWorkspace
             * still exists in the codebase for the eventual companion
             * surface; it just isn't reachable from the dm route. */
            showDirectLaneBoot ? (
              <BootShell />
            ) : directLaneChannel ? (
              <ChatView
                {...chatSurfaceProps}
                payload={payload}
                selectedChannel={directLaneChannel}
                onOpenAddCat={noop}
                showAddCatButton={false}
                renderComposerHeaderAccessory={(ctx) => (
                  <ActiveSessionPermissionChip channel={ctx.selectedChannel} />
                )}
                renderComposerTargetSlot={(context) => (
                  <ChatComposerTargetSlot
                    payload={context.payload}
                    composerBusy={context.composerBusy}
                    composerRecipients={context.composerRecipients}
                    defaultRecipientParticipantId={context.defaultRecipientParticipantId}
                    composerStackParticipants={context.composerStackParticipants}
                    directLaneCat={context.directLaneCat}
                    isDirectLane={context.isDirectLane}
                    isSoloComposer={context.isSoloComposer}
                    activeWorkflowShape={context.activeWorkflowShape}
                    onToggleActiveWorkflowShape={context.onToggleActiveWorkflowShape}
                    activeAudienceKeys={context.activeAudienceKeys}
                    onSetActiveAudienceKeys={context.onSetActiveAudienceKeys}
                    onOpenSection={context.onOpenSection}
                  />
                )}
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
