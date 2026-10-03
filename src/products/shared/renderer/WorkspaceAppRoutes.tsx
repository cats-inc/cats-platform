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
  renderConversationView: (
    channel: SelectedChannelView,
    options: {
      onOpenAddCat: () => void;
      showAddCatButton?: boolean;
    },
  ) => ReactNode;
  renderNewChatDraft: (options: {
    onOpenAddCat: () => void;
    allowAddCat: boolean;
  }) => ReactNode;
  renderAddCatPanel: (options: {
    busy: WorkspaceBusyState;
    feedback: string;
  }) => ReactNode;
  onToggleAddCat: () => void;
  onOpenDraftAddCat: () => void;
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
  renderConversationView,
  renderNewChatDraft,
  renderAddCatPanel,
  onToggleAddCat,
  onOpenDraftAddCat,
}: WorkspaceAppRoutesProps) {
  const chatElement = selectedChannel
    ? renderConversationView(selectedChannel, { onOpenAddCat: onToggleAddCat })
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
