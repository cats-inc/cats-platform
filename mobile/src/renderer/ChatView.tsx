import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getFixtureConversation } from '../api/fixtures/conversation';
import type { FixtureMessage } from '../api/fixtures/conversation';
import { MessageBody, type ResolveAttachmentUrl } from './MessageBody';
import { MessageBubble } from './MessageBubble';
import { colors, radii, spacing, typography } from './theme';

/**
 * Default resolver returns null so attachments render as non-interactive
 * placeholders until the device has a paired desktop. Phase 7 replaces
 * this with a connection-mode-aware resolver (cloud relay base URL,
 * tunnel URL, or Tailscale IP) per ADR-092 / SPEC-095.
 */
const NO_CONNECTION_RESOLVER: ResolveAttachmentUrl = () => null;

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

/**
 * Shared mobile ChatView. PLAN-084 Phase 4a builds the visual shell
 * against fixture data; Phase 4b will swap in live data; Phase 4c will
 * wire the composer's send path. Phase 4d adds scroll-to-bottom and
 * pull-to-refresh polish on top of the shell. The same component is
 * consumed by the Phase-5 Code / Work tabs through `productMode`.
 */
export function ChatView({ channelId, productMode }: ChatViewProps) {
  const conversation = useMemo(
    () => getFixtureConversation(channelId, productMode),
    [channelId, productMode],
  );
  const messageCount = conversation.messages.length;

  const listRef = useRef<FlatList<FixtureMessage>>(null);
  const [draft, setDraft] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const canSubmit = draft.trim().length > 0;

  const scrollToBottom = (animated: boolean) => {
    if (messageCount === 0) {
      return;
    }
    listRef.current?.scrollToIndex({ index: messageCount - 1, animated });
  };

  useEffect(() => {
    if (messageCount === 0) {
      return;
    }
    // Defer one frame so the list has measured its content before we ask
    // it to scroll. Without this, the initial scroll-to-bottom on a fresh
    // mount no-ops because the list reports zero offset.
    const timer = setTimeout(() => scrollToBottom(false), 0);
    return () => clearTimeout(timer);
  }, [channelId, messageCount]);

  const handleSend = () => {
    // Phase-4c will wire this to the real send path. Until then, just
    // clear the draft so the composer feels responsive in dev builds.
    setDraft('');
    scrollToBottom(true);
  };

  const handleRefresh = () => {
    // Phase-4b will refresh the conversation against the live store.
    // For the fixture phase, simulate the refresh state for ~600 ms so
    // the gesture is visible during dev.
    setRefreshing(true);
    const timer = setTimeout(() => setRefreshing(false), 600);
    return () => clearTimeout(timer);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={
        Platform.OS === 'ios' ? KEYBOARD_VERTICAL_OFFSET_IOS : 0
      }
    >
      <FlatList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={conversation.messages}
        keyExtractor={messageKey}
        onScrollToIndexFailed={({ index }) => {
          // Falls back when the list cannot scroll precisely yet. Retry
          // on the next frame after a soft offset settle.
          const timer = setTimeout(() => {
            listRef.current?.scrollToOffset({
              offset: index * 80,
              animated: false,
            });
          }, 50);
          return () => clearTimeout(timer);
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent.primary}
          />
        }
        renderItem={({ item }) => (
          <MessageBubbleItem channelId={channelId} message={item} />
        )}
        ListHeaderComponent={
          <ChatViewHeader
            title={conversation.title}
            productMode={conversation.productMode}
          />
        }
      />
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={COMPOSER_PLACEHOLDER[productMode]}
          placeholderTextColor={colors.fg.muted}
          multiline
          style={styles.composerInput}
        />
        <Pressable
          accessibilityRole="button"
          onPress={handleSend}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.sendButton,
            !canSubmit ? styles.sendButtonDisabled : null,
            pressed ? styles.sendButtonPressed : null,
          ]}
        >
          <Text style={styles.sendButtonLabel}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function messageKey(message: FixtureMessage): string {
  return message.id;
}

interface MessageBubbleItemProps {
  channelId: string;
  message: FixtureMessage;
}

function MessageBubbleItem({ channelId, message }: MessageBubbleItemProps) {
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
          resolveAttachmentUrl={NO_CONNECTION_RESOLVER}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
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
});
