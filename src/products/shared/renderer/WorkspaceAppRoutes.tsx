import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import type { WorkspaceBusyState } from '../../../shared/workspaceBusy.js';
import type { AppShellPayload } from '../api/workspaceContracts.js';
import type { SelectedChannelView } from './workspaceChatUtils.js';
import type { CanvasSurfaceKind } from '../artifactCanvas/contracts.js';
import { withSharedViewerRoutes } from './withSharedViewerRoutes.js';

function noop(): void {}

export interface WorkspaceAppRoutesProps {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView | null;
  directLaneChannel: SelectedChannelView | null;
  showDirectLaneBoot: boolean;
  feedback: string;
  busy: WorkspaceBusyState;
  addCatOpen: boolean;
  entryPath: string;
  chatsPath: string;
  extraRoutes?: ReactNode;
  /** Mounts the Artifact Canvas beside the conversation when set (Code only). */
  chatCanvasSurfaceKind?: CanvasSurfaceKind;
  renderBootShell: () => ReactNode;
  renderChatView: (
    channel: SelectedChannelView,
    options: {
      onOpenAddCat: () => void;
      showAddCatButton?: boolean;
    },
  ) => ReactNode;
  renderNewChatDraft: (options: {
    onOpenAddCat: () => void;
    onDraftDefaultRecipientChange: (catId: string | null) => void;
    allowAddCat: boolean;
  }) => ReactNode;
  renderAddCatPanel: (options: {
    busy: WorkspaceBusyState;
    feedback: string;
  }) => ReactNode;
  onToggleAddCat: () => void;
  onOpenDraftAddCat: () => void;
  onChangeDraftDefaultRecipient: (catId: string | null) => void;
}

export function WorkspaceAppRoutes({
  payload,
  selectedChannel,
  directLaneChannel,
  showDirectLaneBoot,
  feedback,
  busy,
  addCatOpen,
  entryPath,
  chatsPath,
  extraRoutes = null,
  chatCanvasSurfaceKind,
  renderBootShell,
  renderChatView,
  renderNewChatDraft,
  renderAddCatPanel,
  onToggleAddCat,
  onOpenDraftAddCat,
  onChangeDraftDefaultRecipient,
}: WorkspaceAppRoutesProps) {
  const chatElement = selectedChannel
    ? renderChatView(selectedChannel, { onOpenAddCat: onToggleAddCat })
    : renderBootShell();
  return (
    <>
      <Routes>
        <Route
          index
          element={<Navigate to={entryPath} replace />}
        />
        {extraRoutes}
        {chatCanvasSurfaceKind
          ? withSharedViewerRoutes({
            key: 'chat-conversation',
            path: 'chats/:channelId',
            surfaceKind: chatCanvasSurfaceKind,
            surfaceIdParam: 'channelId',
            element: chatElement,
          })
          : <Route path="chats/:channelId" element={chatElement} />}
        <Route
          path="chats"
          element={<Navigate to={chatsPath} replace />}
        />
        <Route
          path="dm/:catId"
          element={
            showDirectLaneBoot
              ? renderBootShell()
              : directLaneChannel
                ? renderChatView(directLaneChannel, {
                    onOpenAddCat: noop,
                    showAddCatButton: false,
                  })
                : renderNewChatDraft({
                    onOpenAddCat: noop,
                    onDraftDefaultRecipientChange: noop,
                    allowAddCat: false,
                  })
          }
        />
        <Route
          path="new"
          element={renderNewChatDraft({
            onOpenAddCat: onOpenDraftAddCat,
            onDraftDefaultRecipientChange: onChangeDraftDefaultRecipient,
            allowAddCat: true,
          })}
        />
        <Route
          path="*"
          element={<Navigate to={entryPath} replace />}
        />
      </Routes>

      {addCatOpen ? renderAddCatPanel({ busy, feedback }) : null}
    </>
  );
}
