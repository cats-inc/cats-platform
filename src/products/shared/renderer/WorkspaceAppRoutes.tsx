import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import type { AppShellPayload } from '../api/workspaceContracts.js';
import type { SelectedChannelView } from './workspaceChatUtils.js';

function noop(): void {}

export interface WorkspaceAppRoutesProps {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView | null;
  directLaneChannel: SelectedChannelView | null;
  showDirectLaneBoot: boolean;
  feedback: string;
  busy: string;
  addCatOpen: boolean;
  entryPath: string;
  chatsPath: string;
  extraRoutes?: ReactNode;
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
    onDraftLeadCatChange: (catId: string | null) => void;
    allowAddCat: boolean;
  }) => ReactNode;
  renderAddCatPanel: (options: {
    busy: string;
    feedback: string;
  }) => ReactNode;
  onToggleAddCat: () => void;
  onOpenDraftAddCat: () => void;
  onChangeDraftLeadCat: (catId: string | null) => void;
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
  renderBootShell,
  renderChatView,
  renderNewChatDraft,
  renderAddCatPanel,
  onToggleAddCat,
  onOpenDraftAddCat,
  onChangeDraftLeadCat,
}: WorkspaceAppRoutesProps) {
  return (
    <>
      <Routes>
        <Route
          index
          element={<Navigate to={entryPath} replace />}
        />
        {extraRoutes}
        <Route
          path="chats/:channelId"
          element={
            selectedChannel
              ? renderChatView(selectedChannel, { onOpenAddCat: onToggleAddCat })
              : renderBootShell()
          }
        />
        <Route
          path="chats"
          element={<Navigate to={chatsPath} replace />}
        />
        <Route
          path="my-cats/:catId"
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
                    onDraftLeadCatChange: noop,
                    allowAddCat: false,
                  })
          }
        />
        <Route
          path="new"
          element={renderNewChatDraft({
            onOpenAddCat: onOpenDraftAddCat,
            onDraftLeadCatChange: onChangeDraftLeadCat,
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
