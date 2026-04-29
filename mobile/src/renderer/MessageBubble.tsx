import { type ReactNode } from 'react';
import { View } from 'react-native';

import { messageBubbleStyles as styles } from './styles/messageBody';

export type MessageBubbleRole = 'user' | 'assistant';

export interface MessageBubbleProps {
  role: MessageBubbleRole;
  children: ReactNode;
}

/**
 * Bubble container shared between the visual harness and the live
 * ChatView. Mirrors `.transcriptMessage` + `.transcriptMessageUser` /
 * `.transcriptMessageAgent` from chat-thread-base.css.
 */
export function MessageBubble({ role, children }: MessageBubbleProps) {
  return (
    <View
      style={[
        styles.row,
        role === 'user' ? styles.rowUser : styles.rowAssistant,
      ]}
    >
      <View
        style={[
          styles.bubbleBase,
          role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        {children}
      </View>
    </View>
  );
}
