import { useEffect, useMemo, useRef, useState } from 'react';
import {
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

import { getFixtureConversation } from '../api/fixtures/conversation';
import type { FixtureMessage } from '../api/fixtures/conversation';
import { MessageBody, type ResolveAttachmentUrl } from './MessageBody';
import { MessageBubble } from './MessageBubble';
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

const REFRESH_FIXTURE_DELAY_MS = 600;

/**
 * Default resolver returns null so attachments render as non-interactive
 * placeholders until the device has a paired desktop. Phase 7 replaces
 * this with a connection-mode-aware resolver (cloud relay base URL,
 * tunnel URL, or Tailscale IP) per ADR-092 / SPEC-095.
 */
const NO_CONNECTION_RESOLVER: ResolveAttachmentUrl = () => null;

/**
 * Shared mobile ChatView. Phase 4a built the visual shell; Phase 4d
 * replaces the original scrollToIndex polish with onContentSizeChange +
 * scrollToEnd, which is the canonical RN chat pattern for variable-
 * height bubbles. A "sticky bottom" rule keeps autoscroll intact while
 * the user is near the latest message and disengages once they scroll
 * up to read history.
 */
export function ChatView({ channelId, productMode }: ChatViewProps) {
  const conversation = useMemo(
    () => getFixtureConversation(channelId, productMode),
    [channelId, productMode],
  );

  const listRef = useRef<FlatList<FixtureMessage>>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [draft, setDraft] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const canSubmit = draft.trim().length > 0;

  // Re-arm sticky-bottom whenever the channel switches, so the new
  // conversation lands at the latest message even if the previous one
  // was scrolled mid-history.
  useEffect(() => {
    isNearBottomRef.current = true;
  }, [channelId]);

  // Clean up any in-flight refresh timer on unmount so we never call
  // setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

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

  const handleSend = () => {
    // Phase-4c will wire this to the real send path. Until then, just
    // clear the draft so the composer feels responsive in dev builds.
    setDraft('');
    // Re-engage sticky bottom regardless of where the user was — sending
    // a message should always pull the conversation to the latest.
    isNearBottomRef.current = true;
    listRef.current?.scrollToEnd({ animated: true });
  };

  const handleRefresh = () => {
    // Phase-4b will refresh the conversation against the live store.
    // For the fixture phase, simulate the refresh state for ~600 ms so
    // the gesture is visible during dev. The timer is held in a ref so
    // unmount cleanup can cancel it.
    setRefreshing(true);
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      setRefreshing(false);
      refreshTimerRef.current = null;
    }, REFRESH_FIXTURE_DELAY_MS);
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
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
        scrollEventThrottle={16}
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
