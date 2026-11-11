import type { ComponentType, ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import type { WorkspaceBusyState } from '../../../shared/workspaceBusy.js';
import type { AppShellPayload } from '../api/workspaceContracts.js';
import type { SelectedChannelView } from './workspaceChatUtils.js';
import type { CanvasRouteOptions, CanvasSurfaceKind } from '../artifactCanvas/contracts.js';
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
  /**
   * Mounts the Artifact Canvas beside the conversation when set: on Code, and on Work, which
   * includes Code (ADR-149 D5).
   */
  chatCanvasSurfaceKind?: CanvasSurfaceKind;
  /** Product controls under that canvas's top bar. */
  chatCanvasControls?: ComponentType<ArtifactCanvasControlsProps>;
  /** The product route that canvas opens under (SPEC-141 FR-9). */
  chatCanvasRoute?: CanvasRouteOptions;
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
  chatCanvasRoute,
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
            canvasRoute: chatCanvasRoute,
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
