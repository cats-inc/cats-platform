import { Platform, StyleSheet } from 'react-native';

import { colors, radii, spacing, typography } from '../theme';

// `code` in foundation.css uses Cascadia Code / SFMono / Consolas.
const MONOSPACE_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' });
// Web markdown sizes are `em` of the bubble font size.
const BUBBLE_EM = typography.bubble.fontSize;

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
 * Agent markdown styles, mirroring the `.messageBodyMarkdown` rules in
 * chat-thread-base.css. Block margins become column gaps.
 */
export const messageBodyMarkdownStyles = StyleSheet.create({
  // `:where(p, ul, …) { margin: 0 0 0.65em }` between blocks.
  blocks: {
    flexDirection: 'column',
    gap: Math.round(BUBBLE_EM * 0.65),
  },
  // `:where(h1…h6)` — bold, tighter line height; h1 1.2em, h2 1.1em.
  heading: {
    fontWeight: '700',
    lineHeight: 22,
  },
  heading1: {
    fontSize: Math.round(BUBBLE_EM * 1.2 * 10) / 10,
    lineHeight: 24,
  },
  heading2: {
    fontSize: Math.round(BUBBLE_EM * 1.1 * 10) / 10,
    lineHeight: 23,
  },
  // `ul, ol { padding-left: 1.4em }` and `li + li { margin-top: 0.2em }`.
  list: {
    flexDirection: 'column',
    gap: Math.round(BUBBLE_EM * 0.2),
  },
  listItem: {
    flexDirection: 'row',
  },
  listMarker: {
    minWidth: Math.round(BUBBLE_EM * 1.4),
    paddingRight: 4,
    textAlign: 'right',
  },
  // `li > :where(p, ul, ol) { margin: 0.2em 0 0 }`.
  listItemBody: {
    flex: 1,
    flexDirection: 'column',
    gap: Math.round(BUBBLE_EM * 0.2),
  },
  // `blockquote` — left rule and muted text.
  blockquote: {
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.border.subtle,
  },
  quoteText: {
    color: colors.fg.secondary,
  },
  // `hr` — 1px top border.
  rule: {
    height: 1,
    backgroundColor: colors.border.subtle,
  },
  strong: {
    fontWeight: '700',
  },
  emphasis: {
    fontStyle: 'italic',
  },
  delete: {
    textDecorationLine: 'line-through',
  },
  // `code` — muted background, 0.88em.
  inlineCode: {
    fontFamily: MONOSPACE_FONT,
    fontSize: Math.round(BUBBLE_EM * 0.88 * 10) / 10,
    backgroundColor: colors.status.mutedBg,
  },
  // `pre` — bordered panel that scrolls horizontally; `pre code` at 0.85em.
  codeBlock: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radii.md,
    backgroundColor: colors.bg.panelSubtle,
  },
  codeBlockContent: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  codeBlockText: {
    color: colors.fg.primary,
    fontFamily: MONOSPACE_FONT,
    fontSize: Math.round(BUBBLE_EM * 0.85 * 10) / 10,
    lineHeight: 18,
  },
  // `table`, `th`, `td` — collapsed 1px grid; `th` on the subtle panel.
  table: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: colors.border.subtle,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableCell: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border.subtle,
  },
  tableHeaderCell: {
    backgroundColor: colors.bg.panelSubtle,
  },
  tableText: {
    fontSize: Math.round(BUBBLE_EM * 0.95 * 10) / 10,
    lineHeight: 20,
  },
  tableHeaderText: {
    fontWeight: '600',
  },
  // `.messageBodyInertLink` — a link target the device cannot open.
  inertLink: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
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
