import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { MobileApiError } from '../api/client';
import {
  type ChannelMessagesState,
  type ChannelSendState,
  useChannelMessages,
} from './hooks/useChannelMessages';
import { MessageBody, type ResolveAttachmentUrl } from './MessageBody';
import { MessageBubble } from './MessageBubble';
import type { MobileRenderedMessage } from '../../../src/mobile/index.js';
import { colors, radii, spacing, typography } from './theme';

export type ChatViewProductMode = 'chat' | 'code' | 'work';

export interface ChatViewProps {
  channelId: string;
  productMode: ChatViewProductMode;
}

const COMPOSER_PLACEHOLDER: Record<ChatViewProductMode, string> = {
  chat: 'Message your cats…',
  code: 'Describe the code task…',
  work: 'Describe the work item…',
};

const KEYBOARD_VERTICAL_OFFSET_IOS = 88;

/** Distance from the bottom (px) below which we still consider the user
 *  "stuck" to the latest message and auto-scroll on new content. */
const STICKY_BOTTOM_THRESHOLD_PX = 80;

/**
 * Shared mobile ChatView. PLAN-084 Phase 4b wires the FlatList of
 * messages to the live `/api/channels/{id}/messages` endpoint via
 * `useChannelMessages`. Phase 4c will replace the no-op composer with
 * the real send path. Phase 5 adds product-mode side panels (bottom
 * sheet / fullscreen modal).
 */
export function ChatView({ channelId, productMode }: ChatViewProps) {
  const { state, refetch, send, sendState } = useChannelMessages(channelId);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={
        Platform.OS === 'ios' ? KEYBOARD_VERTICAL_OFFSET_IOS : 0
      }
    >
      {renderBody({ state, productMode, channelId, refetch, send, sendState })}
    </KeyboardAvoidingView>
  );
}

interface RenderBodyArgs {
  state: ChannelMessagesState;
  productMode: ChatViewProductMode;
  channelId: string;
  refetch: () => void;
  send: (body: string) => Promise<void>;
  sendState: ChannelSendState;
}

function renderBody({
  state,
  productMode,
  channelId,
  refetch,
  send,
  sendState,
}: RenderBodyArgs) {
  switch (state.kind) {
    case 'loading':
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent.primary} />
        </View>
      );
    case 'unconfigured':
      return (
        <PanelView
          title="Connect to your desktop"
          body="Set the desktop base URL in Settings so this device can fetch messages."
        />
      );
    case 'channelNotFound':
      return (
        <PanelView
          title="Conversation not found"
          body="This channel does not exist on your desktop. It may have been deleted from the desktop, or the link is stale."
        />
      );
    case 'error':
      return <ErrorView error={state.error} onRetry={refetch} />;
    case 'data':
      return (
        <LiveConversation
          state={state}
          productMode={productMode}
          channelId={channelId}
          refetch={refetch}
          send={send}
          sendState={sendState}
        />
      );
  }
}

interface LiveConversationProps {
  state: Extract<ChannelMessagesState, { kind: 'data' }>;
  productMode: ChatViewProductMode;
  channelId: string;
  refetch: () => void;
  send: (body: string) => Promise<void>;
  sendState: ChannelSendState;
}

function LiveConversation({
  state,
  productMode,
  channelId,
  refetch,
  send,
  sendState,
}: LiveConversationProps) {
  const listRef = useRef<FlatList<MobileRenderedMessage>>(null);
  const isNearBottomRef = useRef<boolean>(true);

  const [draft, setDraft] = useState('');
  const sending = sendState.kind === 'sending';
  const canSubmit = draft.trim().length > 0 && !sending;

  // Re-arm sticky-bottom whenever the channel switches.
  useEffect(() => {
    isNearBottomRef.current = true;
  }, [channelId]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - contentOffset.y - layoutMeasurement.height;
    isNearBottomRef.current = distanceFromBottom <= STICKY_BOTTOM_THRESHOLD_PX;
  };

  const handleContentSizeChange = () => {
    if (isNearBottomRef.current) {
      listRef.current?.scrollToEnd({ animated: false });
    }
  };

  const handleSend = async () => {
    const body = draft.trim();
    if (body.length === 0 || sending) {
      return;
    }
    // Clear the draft optimistically so the input is responsive even
    // before the network round-trip completes; if the send fails the
    // user can re-type. Phase 4c streaming will keep the optimistic
    // user message visible during the round-trip itself.
    setDraft('');
    isNearBottomRef.current = true;
    listRef.current?.scrollToEnd({ animated: true });
    await send(body);
  };

  return (
    <>
      <FlatList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={state.messages}
        keyExtractor={messageKey}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={refetch}
            tintColor={colors.accent.primary}
          />
        }
        renderItem={({ item }) => (
          <MessageBubbleItem
            channelId={channelId}
            message={item}
            resolveAttachmentUrl={state.resolveAttachmentUrl}
          />
        )}
        ListHeaderComponent={
          <ChatViewHeader
            title={state.channelTitle}
            productMode={productMode}
          />
        }
        ListEmptyComponent={
          <Text style={styles.emptyState}>
            No messages yet. Send the first one below.
          </Text>
        }
      />
      {sendState.kind === 'error' ? (
        <View style={styles.sendErrorBanner}>
          <Text style={styles.sendErrorText} numberOfLines={2}>
            {sendState.error.message}
          </Text>
        </View>
      ) : null}
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={COMPOSER_PLACEHOLDER[productMode]}
          placeholderTextColor={colors.fg.muted}
          multiline
          editable={!sending}
          style={styles.composerInput}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void handleSend();
          }}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.sendButton,
            !canSubmit ? styles.sendButtonDisabled : null,
            pressed && canSubmit ? styles.sendButtonPressed : null,
          ]}
        >
          {sending ? (
            <ActivityIndicator color={colors.fg.inverse} size="small" />
          ) : (
            <Text style={styles.sendButtonLabel}>Send</Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

interface MessageBubbleItemProps {
  channelId: string;
  message: MobileRenderedMessage;
  resolveAttachmentUrl: ResolveAttachmentUrl;
}

function messageKey(message: MobileRenderedMessage): string {
  return message.id;
}

function MessageBubbleItem({
  channelId,
  message,
  resolveAttachmentUrl,
}: MessageBubbleItemProps) {
  return (
    <View>
      <View
        style={[
          styles.messageMeta,
          message.role === 'user' ? styles.messageMetaUser : null,
        ]}
      >
        <Text style={styles.messageAuthor}>{message.authorName}</Text>
      </View>
      <MessageBubble role={message.role}>
        <MessageBody
          segments={message.segments}
          attachments={message.attachments}
          channelId={channelId}
          resolveAttachmentUrl={resolveAttachmentUrl}
        />
      </MessageBubble>
    </View>
  );
}

interface ChatViewHeaderProps {
  title: string;
  productMode: ChatViewProductMode;
}

function ChatViewHeader({ title, productMode }: ChatViewHeaderProps) {
  // Phase 5 TODO: this header is where product-mode side-panel
  // triggers will live (CodeBuilderView / ApprovalQueuePanel /
  // ProjectDetailView / DeliveryPanel as bottom sheets per
  // SPEC-095 #21). The mobile shell currently renders just the
  // eyebrow + title — product-specific surfaces show up only via
  // recents / lens screens, not as inline panels here.
  return (
    <View style={styles.header}>
      <Text style={styles.headerEyebrow}>{productLabel(productMode)}</Text>
      <Text style={styles.headerTitle}>{title}</Text>
    </View>
  );
}

function productLabel(productMode: ChatViewProductMode): string {
  switch (productMode) {
    case 'chat':
      return 'CHAT';
    case 'code':
      return 'CODE';
    case 'work':
      return 'WORK';
  }
}

interface PanelViewProps {
  title: string;
  body: string;
}

function PanelView({ title, body }: PanelViewProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelBody}>{body}</Text>
    </View>
  );
}

interface ErrorViewProps {
  error: MobileApiError;
  onRetry: () => void;
}

function ErrorView({ error, onRetry }: ErrorViewProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Could not load messages</Text>
      <Text style={styles.panelBody}>{error.message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [
          styles.retryButton,
          pressed ? styles.retryButtonPressed : null,
        ]}
      >
        <Text style={styles.retryButtonLabel}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  panelTitle: {
    color: colors.fg.primary,
    ...typography.title,
  },
  panelBody: {
    color: colors.fg.secondary,
    ...typography.body,
  },
  retryButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.accent.primary,
    marginTop: spacing.sm,
  },
  retryButtonPressed: {
    opacity: 0.85,
  },
  retryButtonLabel: {
    color: colors.fg.inverse,
    ...typography.bodyStrong,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  emptyState: {
    color: colors.fg.muted,
    ...typography.body,
    textAlign: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    marginBottom: spacing.sm,
  },
  headerEyebrow: {
    color: colors.fg.muted,
    ...typography.label,
    letterSpacing: 0.6,
  },
  headerTitle: {
    color: colors.fg.primary,
    ...typography.title,
  },
  messageMeta: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  messageMetaUser: {
    alignItems: 'flex-end',
  },
  messageAuthor: {
    color: colors.fg.muted,
    ...typography.label,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.bg.panel,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 140,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.fg.primary,
    ...typography.body,
    backgroundColor: colors.bg.panelSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  sendButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.accent.primary,
  },
  sendButtonDisabled: {
    backgroundColor: colors.bg.panelHover,
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
  sendButtonLabel: {
    color: colors.fg.inverse,
    ...typography.body,
    fontWeight: '600',
  },
  sendErrorBanner: {
    backgroundColor: colors.accent.soft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  sendErrorText: {
    color: colors.accent.danger,
    ...typography.caption,
  },
});
