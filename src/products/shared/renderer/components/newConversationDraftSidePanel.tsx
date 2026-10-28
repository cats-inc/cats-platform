import type { BrowseDirectoryEntry } from '../api/index.js';
import { FolderBrowserContent } from './FolderBrowser.js';
import { type SidePanelSection } from '../../../../design/components/SidePanel.js';
import type { RuntimeSessionPolicy } from '../../../../shared/runtimeSessionPolicy.js';
import { createDefaultRuntimeSessionPolicy } from '../../../../shared/runtimeSessionPolicy.js';
import { ProviderPolicyEditor } from './provider-interactions/ProviderPolicyEditor.js';
import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';

type NewConversationDraftTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

export interface NewConversationDraftSidePanelCopy {
  title?: string;
  folder?: {
    sectionTitle?: string;
    emptyState?: string;
  };
}

type ResolvedNewConversationDraftSidePanelCopy = Required<{
  title: string;
  folder: Required<NonNullable<NewConversationDraftSidePanelCopy['folder']>>;
}>;

const defaultNewConversationDraftSidePanelCopy = (
  t: NewConversationDraftTranslator,
): ResolvedNewConversationDraftSidePanelCopy => ({
  title: t(messageKeys.chatNewChatDraftSidePanelTitle),
  folder: {
    sectionTitle: t(messageKeys.chatNewChatDraftSidePanelFolderTitle),
    emptyState: t(messageKeys.chatNewChatDraftSidePanelFolderEmptyState),
  },
});

export function resolveNewConversationDraftSidePanelCopy(
  copy: NewConversationDraftSidePanelCopy | undefined,
  t: NewConversationDraftTranslator,
): ResolvedNewConversationDraftSidePanelCopy {
  const defaultCopy = defaultNewConversationDraftSidePanelCopy(t);
  return {
    title: copy?.title ?? defaultCopy.title,
    folder: {
      ...defaultCopy.folder,
      ...copy?.folder,
    },
  };
}

/**
 * The draft's side panel holds its folder (and, in Code, its session
 * profile). Participants are added, edited and removed on the composer.
 */
export interface BuildNewConversationDraftSidePanelSectionsInput {
  isSubmittingFirstTurn: boolean;
  folderBrowsePath?: string;
  folderBrowseCurrentPath?: string;
  folderBrowseParentPath?: string;
  folderBrowseEntries?: BrowseDirectoryEntry[];
  folderBrowseLoading?: boolean;
  folderBrowseError?: string;
  draftCwd: string | null;
  onFolderBrowsePathChange?: (path: string) => void;
  onFolderBrowse?: (path: string) => void;
  onFolderBrowseSelect?: () => void;
  draftRuntimeSessionPolicy: RuntimeSessionPolicy | null;
  onDraftRuntimeSessionPolicyChange?: (policy: RuntimeSessionPolicy) => void;
  onCloseSidePanel: () => void;
  sidePanelCopy?: NewConversationDraftSidePanelCopy;
  // Translator must be passed in by the caller (a real component) — calling
  // `useI18n()` here would violate Rules of Hooks because this builder is
  // invoked conditionally (only when the side panel is open), inserting an
  // extra hook into the parent's call order on toggle.
  t: NewConversationDraftTranslator;
}

export function buildNewConversationDraftSidePanelSections(
  input: BuildNewConversationDraftSidePanelSectionsInput,
): SidePanelSection[] {
  const copy = resolveNewConversationDraftSidePanelCopy(input.sidePanelCopy, input.t);

  return [{
    id: 'cwd',
    title: copy.folder.sectionTitle,
    children: input.onFolderBrowsePathChange && input.onFolderBrowse && input.onFolderBrowseSelect ? (
      <FolderBrowserContent
        folderBrowsePath={input.folderBrowsePath ?? ''}
        folderBrowseCurrentPath={input.folderBrowseCurrentPath ?? ''}
        folderBrowseParentPath={input.folderBrowseParentPath ?? ''}
        folderBrowseEntries={input.folderBrowseEntries ?? []}
        folderBrowseLoading={input.folderBrowseLoading ?? false}
        folderBrowseError={input.folderBrowseError ?? ''}
        onPathChange={input.onFolderBrowsePathChange}
        onBrowse={input.onFolderBrowse}
        onSelect={() => {
          input.onFolderBrowseSelect?.();
          input.onCloseSidePanel();
        }}
      />
    ) : (
      input.draftCwd ? (
        <p style={{ margin: 0, fontSize: '0.85rem', wordBreak: 'break-all' }}>
          {input.draftCwd}
        </p>
      ) : (
        <p className="operatorEmptyState">{copy.folder.emptyState}</p>
      )
    ),
  }, ...(input.onDraftRuntimeSessionPolicyChange ? [{ id: 'provider-access', title: input.t(messageKeys.providerControlsAccessApproval),
    children: <ProviderPolicyEditor value={input.draftRuntimeSessionPolicy ?? createDefaultRuntimeSessionPolicy()}
      onChange={input.onDraftRuntimeSessionPolicyChange} disabled={input.isSubmittingFirstTurn} /> }] : [])];
}
