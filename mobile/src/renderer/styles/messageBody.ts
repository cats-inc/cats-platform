import { StyleSheet } from 'react-native';

import { colors, radii, spacing, typography } from '../theme';

/**
 * StyleSheet mapping for the RN bubble renderer. Each entry corresponds
 * to a CSS rule under `cats-platform/src/products/shared/renderer/styles/chat-thread-base.css`.
 * SPEC-095 NFR-002 (visual gate) requires these styles to render to within
 * ±2 px of the web renderer at 320 / 390 / 768 logical px viewports.
 */
export const messageBodyStyles = StyleSheet.create({
  // .messageBodyWrapper — `display: contents` on web; on RN we use a
  // gap-stacked column so attachment blocks sit above the text body in
  // source order.
  wrapper: {
    flexDirection: 'column',
    gap: spacing.xs,
  },
  // .messageBody — `<p>` reset; `white-space: pre-wrap` is the default
  // RN Text behaviour (no collapsing of inner newlines / spaces).
  text: {
    color: colors.fg.primary,
    ...typography.bubble,
  },
  // .messageBodyLink — `color: var(--accent); text-decoration: underline;`
  link: {
    color: colors.accent.primary,
    textDecorationLine: 'underline',
  },
  // .messageBodyMention — pill chip with avatar-derived background.
  mention: {
    color: colors.bubble.mentionText,
    fontWeight: '600',
    backgroundColor: colors.bubble.mentionDefault,
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
  // .messageBodyImages — flex-wrap row of image previews.
  images: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  // .messageBodyImageLink — wraps each image; on web this is `<a>`, on
  // RN it's a Pressable.
  imageLink: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  // .messageBodyImage — actual image; max 240×180, cover.
  image: {
    width: 240,
    height: 180,
    borderRadius: 10,
  },
  // Image-attachment placeholder when no resolveAttachmentUrl is wired
  // (Phase-pre-7 — connection mode not yet configured).
  imagePlaceholder: {
    width: 240,
    height: 180,
    backgroundColor: colors.bg.panelHover,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  imagePlaceholderText: {
    color: colors.fg.muted,
    ...typography.caption,
  },
  // .messageBodyFiles — flex-wrap row of file chips.
  files: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  // .messageBodyFileChip — pill with icon + filename.
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.bg.panelHover,
  },
  fileChipText: {
    color: colors.fg.primary,
    ...typography.fileChip,
  },
  // File-chip disabled state when resolveAttachmentUrl returns null
  // (Phase-pre-7 — connection mode not yet configured).
  fileChipDisabled: {
    opacity: 0.55,
  },
  fileChipTextDisabled: {
    color: colors.fg.muted,
  },
});

/**
 * Bubble-container styles, mirroring `.transcriptMessage` family.
 * Phase 4 ChatView lifts these out into a `<MessageBubble>` component.
 */
export const messageBubbleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowAssistant: {
    justifyContent: 'flex-start',
  },
  bubbleBase: {
    maxWidth: '85%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.bubble,
  },
  bubbleUser: {
    backgroundColor: colors.bubble.user,
  },
  bubbleAssistant: {
    backgroundColor: colors.bubble.assistant,
    borderWidth: 1,
    borderColor: colors.bubble.assistantBorder,
  },
});
