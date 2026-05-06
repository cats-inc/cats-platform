import { Stack } from 'expo-router';
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
import { useDraftChannel } from './hooks/useDraftChannel';
import { MessageBody, type ResolveAttachmentUrl } from './MessageBody';
import { MessageBubble } from './MessageBubble';
import {
  getMobileChannelTitle,
  getMobileChatCopy,
  getMobileTabsCopy,
  resolveDefaultMobileLocale,
  type MobileChatCopy,
  type MobileRenderedMessage,
} from '../../../src/mobile/index.js';
import { colors, radii, spacing, typography } from './theme';

export type ChatViewProductMode = 'chat' | 'code' | 'work';

/**
 * What conversation surface this `ChatView` instance is showing:
 *
 *   - `channel`: a real channel that already exists on the desktop;
 *     the view fetches messages and subscribes to SSE updates.
 *   - `draft`: a not-yet-created channel that mirrors the web
 *     `<NewChatDraft>` lifecycle. No fetching, empty messages list,
 *     composer enabled. The first send creates the channel +
 *     persists the message and navigates the user to the real route.
 *
 * Splitting the two through a discriminated union keeps the channel
 * fetch path entirely off the draft surface — there is no
 * `channelId === 'new'` magic string and no chance of a draft hook
 * leaking into a real conversation.
 */
export type ChatViewTarget =
  | { kind: 'channel'; channelId: string }
  | { kind: 'draft'; entryActionId: string };

export interface ChatViewProps {
  target: ChatViewTarget;
  productMode: ChatViewProductMode;
}

const KEYBOARD_VERTICAL_OFFSET_IOS = 88;

/** Distance from the bottom (px) below which we still consider the user
 *  "stuck" to the latest message and auto-scroll on new content. */
const STICKY_BOTTOM_THRESHOLD_PX = 80;

/**
 * Shared mobile ChatView. PLAN-084 Phase 4b wires the FlatList of
 * messages to the live `/api/channels/{id}/messages` endpoint via
 * `useChannelMessages`. Phase 4c replaced the no-op composer with the
 * real send path. Draft mode (mirroring web `<NewChatDraft>`) lands
 * via the `target.kind === 'draft'` branch — see `useDraftChannel`.
 * Phase 5 adds product-mode side panels (bottom sheet / fullscreen
 * modal).
 */
export function ChatView({ target, productMode }: ChatViewProps) {
  // Pick the inner host component based on `target.kind` so each only
  // mounts the hook it needs — `useChannelMessages` fetches against
  // `/api/channels/{id}/messages` on mount, so we cannot call it with
  // an empty channelId on the draft surface. The two hosts share
  // rendering through `ChatViewBody` below.
  if (target.kind === 'draft') {
    return (
      <DraftChatViewHost
        productMode={productMode}
        entryActionId={target.entryActionId}
      />
    );
  }
  return (
    <ChannelChatViewHost
      productMode={productMode}
      channelId={target.channelId}
    />
  );
}

interface ChannelChatViewHostProps {
  productMode: ChatViewProductMode;
  channelId: string;
}

function ChannelChatViewHost({ productMode, channelId }: ChannelChatViewHostProps) {
  const { state, refetch, send, sendState } = useChannelMessages(channelId);
  // Drive the Stack header from the live channel title once the
  // app-shell payload resolves. Before resolution we use the tab
  // name as a placeholder so the header isn't blank during the
  // first fetch.
  const tabsCopy = getMobileTabsCopy(resolveDefaultMobileLocale());
  const headerTitle =
    state.kind === 'data' ? state.channelTitle : tabsCopy.tabTitle[productMode];
  return (
    <>
      <Stack.Screen options={{ title: headerTitle, headerShown: true }} />
      <ChatViewBody
        state={state}
        productMode={productMode}
        conversationKey={channelId}
        refetch={refetch}
        send={send}
        sendState={sendState}
      />
    </>
  );
}

interface DraftChatViewHostProps {
  productMode: ChatViewProductMode;
  entryActionId: string;
}

function DraftChatViewHost({ productMode, entryActionId }: DraftChatViewHostProps) {
  const { state, refetch, send, sendState } = useDraftChannel(productMode, entryActionId);
  // For drafts the Stack header shows the resolved channel title
  // (e.g. "New chat" / "新聊天" / "New team work" / etc.) coming
  // from `MobileTabsCopy.channelTitle[productMode][entryActionId]`.
  // No async wait — the resolution is pure copy lookup.
  const tabsCopy = getMobileTabsCopy(resolveDefaultMobileLocale());
  const headerTitle = getMobileChannelTitle(tabsCopy, productMode, entryActionId);
  return (
    <>
      <Stack.Screen options={{ title: headerTitle, headerShown: true }} />
      <ChatViewBody
        state={state}
        productMode={productMode}
        conversationKey={`draft:${entryActionId}`}
        refetch={refetch}
        send={send}
        sendState={sendState}
      />
    </>
  );
}

interface ChatViewBodyProps {
  state: ChannelMessagesState;
  productMode: ChatViewProductMode;
  conversationKey: string;
  refetch: () => void;
  send: (body: string) => Promise<void>;
  sendState: ChannelSendState;
}

function ChatViewBody({
  state,
  productMode,
  conversationKey,
  refetch,
  send,
  sendState,
}: ChatViewBodyProps) {
  const copy = getMobileChatCopy(resolveDefaultMobileLocale());
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={
        Platform.OS === 'ios' ? KEYBOARD_VERTICAL_OFFSET_IOS : 0
      }
    >
      {renderBody({
        state,
        productMode,
        conversationKey,
        refetch,
        send,
        sendState,
        copy,
      })}
    </KeyboardAvoidingView>
  );
}

interface RenderBodyArgs {
  state: ChannelMessagesState;
  productMode: ChatViewProductMode;
  conversationKey: string;
  refetch: () => void;
  send: (body: string) => Promise<void>;
  sendState: ChannelSendState;
  copy: MobileChatCopy;
}

function renderBody({
  state,
  productMode,
  conversationKey,
  refetch,
  send,
  sendState,
  copy,
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
          title={copy.connectDesktopTitle}
          body={copy.connectDesktopBody}
        />
      );
    case 'channelNotFound':
      return (
        <PanelView
          title={copy.channelNotFoundTitle}
          body={copy.channelNotFoundBody}
        />
      );
    case 'error':
      return <ErrorView error={state.error} onRetry={refetch} copy={copy} />;
    case 'data':
      return (
        <LiveConversation
          state={state}
          productMode={productMode}
          conversationKey={conversationKey}
          refetch={refetch}
          send={send}
          sendState={sendState}
          copy={copy}
        />
      );
  }
}

interface LiveConversationProps {
  state: Extract<ChannelMessagesState, { kind: 'data' }>;
  productMode: ChatViewProductMode;
  conversationKey: string;
  refetch: () => void;
  send: (body: string) => Promise<void>;
  sendState: ChannelSendState;
  copy: MobileChatCopy;
}

function LiveConversation({
  state,
  productMode,
  conversationKey,
  refetch,
  send,
  sendState,
  copy,
}: LiveConversationProps) {
  const listRef = useRef<FlatList<MobileRenderedMessage>>(null);
  const isNearBottomRef = useRef<boolean>(true);

  const [draft, setDraft] = useState('');
  const sending = sendState.kind === 'sending';
  const canSubmit = draft.trim().length > 0 && !sending;

  // Re-arm sticky-bottom whenever the channel (or draft) switches.
  useEffect(() => {
    isNearBottomRef.current = true;
  }, [conversationKey]);

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
            conversationKey={conversationKey}
            message={item}
            resolveAttachmentUrl={state.resolveAttachmentUrl}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.emptyState}>
            {copy.emptyMessages}
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
          placeholder={copy.composerPlaceholder[productMode]}
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
            <Text style={styles.sendButtonLabel}>{copy.sendAction}</Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

interface MessageBubbleItemProps {
  conversationKey: string;
  message: MobileRenderedMessage;
  resolveAttachmentUrl: ResolveAttachmentUrl;
}

function messageKey(message: MobileRenderedMessage): string {
  return message.id;
}

function MessageBubbleItem({
  conversationKey,
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
          channelId={conversationKey}
          resolveAttachmentUrl={resolveAttachmentUrl}
        />
      </MessageBubble>
    </View>
  );
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
  copy: MobileChatCopy;
}

function ErrorView({ error, onRetry, copy }: ErrorViewProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{copy.couldNotLoadMessagesTitle}</Text>
      <Text style={styles.panelBody}>{error.message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [
          styles.retryButton,
          pressed ? styles.retryButtonPressed : null,
        ]}
      >
        <Text style={styles.retryButtonLabel}>{copy.retryAction}</Text>
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
