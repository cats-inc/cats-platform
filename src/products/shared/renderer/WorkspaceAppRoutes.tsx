import type { ComponentType, ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import type { WorkspaceBusyState } from '../../../shared/workspaceBusy.js';
import type { AppShellPayload } from '../api/workspaceContracts.js';
import type { SelectedChannelView } from './workspaceChatUtils.js';
import type { CanvasSurfaceKind } from '../artifactCanvas/contracts.js';
import { withSharedViewerRoutes, type ArtifactCanvasControlsProps } from './withSharedViewerRoutes.js';

export interface WorkspaceAppRoutesProps {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView | null;
  feedback: string;
  busy: WorkspaceBusyState;
  addCatOpen: boolean;
  entryPath: string;
  chatsPath: string;
  extraRoutes?: ReactNode;
  /** Mounts the Artifact Canvas beside the conversation when set (Code only). */
  chatCanvasSurfaceKind?: CanvasSurfaceKind;
  /** Product controls under that canvas's top bar. */
  chatCanvasControls?: ComponentType<ArtifactCanvasControlsProps>;
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
  feedback,
  busy,
  addCatOpen,
  entryPath,
  chatsPath,
  extraRoutes = null,
  chatCanvasSurfaceKind,
  chatCanvasControls,
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
            canvasControls: chatCanvasControls,
          })
          : <Route path="chats/:channelId" element={chatElement} />}
        <Route
          path="chats"
          element={<Navigate to={chatsPath} replace />}
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
