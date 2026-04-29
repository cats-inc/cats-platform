import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getFixtureConversation } from '../api/fixtures/conversation';
import type { FixtureMessage } from '../api/fixtures/conversation';
import { MessageBody } from './MessageBody';
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

/**
 * Shared mobile ChatView. PLAN-084 Phase 4a builds the visual shell
 * (bubble list + composer) against fixture data. Phase 4b wires the
 * conversation list to the live chat store and Phase 4c wires the
 * composer to the real send path. The same component is consumed by
 * Phase-5 Code / Work tabs through `productMode`.
 */
export function ChatView({ channelId, productMode }: ChatViewProps) {
  const conversation = useMemo(
    () => getFixtureConversation(channelId, productMode),
    [channelId, productMode],
  );

  const [draft, setDraft] = useState('');
  const canSubmit = draft.trim().length > 0;

  const handleSend = () => {
    // Phase-4c will wire this to the real send path. Until then, just
    // clear the draft so the composer feels responsive in dev builds.
    setDraft('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={conversation.messages}
        keyExtractor={messageKey}
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
