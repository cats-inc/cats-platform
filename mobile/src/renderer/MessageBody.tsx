import { Image, Linking, Pressable, Text, View } from 'react-native';

import {
  type MessageBodyAttachment,
  type MessageBodySegment,
} from './types/messageBody';
import { messageBodyStyles as styles } from './styles/messageBody';

/**
 * Returns the absolute URL to fetch / open the named attachment, or
 * `null` when the connection mode is not configured yet (Phase 7) and
 * attachments cannot be addressed from the device. SPEC-095 Open
 * Question on connection mode resolution drives the eventual concrete
 * implementation.
 */
export type ResolveAttachmentUrl = (
  channelId: string,
  filename: string,
) => string | null;

export interface MessageBodyProps {
  /**
   * Pre-segmented body content. SPEC-095 NFR-001 requires the shared
   * segmenter (`cats-platform/src/products/shared/renderer/components/messageBodySegmenter.ts`)
   * to produce these — the harness uses fixed segments while Metro
   * resolution to the shared file is unwired.
   */
  segments: MessageBodySegment[];
  attachments: MessageBodyAttachment[];
  /**
   * Channel id used to build attachment URLs. Web renderer points at the
   * platform host's `/api/channels/{id}/attachments/...` endpoint;
   * mobile resolves the same path through whatever connection mode is
   * active (relay / tunnel / Tailscale, per the 2026-03-24 research
   * note).
   */
  channelId: string;
  /**
   * Required. Returning `null` indicates the device has no connection
   * mode wired up yet — attachments are still rendered for context but
   * remain non-interactive (no fetch, no `Linking.openURL`). Returning
   * a string opens that URL on tap and uses it as the image source.
   */
  resolveAttachmentUrl: ResolveAttachmentUrl;
}

export function MessageBody({
  segments,
  attachments,
  channelId,
  resolveAttachmentUrl,
}: MessageBodyProps) {
  const imageAttachments = attachments.filter((attachment) => attachment.isImage);
  const fileAttachments = attachments.filter((attachment) => !attachment.isImage);

  return (
    <View style={styles.wrapper}>
      {imageAttachments.length > 0 ? (
        <View style={styles.images}>
          {imageAttachments.map((attachment) => {
            const url = resolveAttachmentUrl(channelId, attachment.filename);
            if (!url) {
              return (
                <View
                  key={attachment.relativePath}
                  style={[styles.imageLink, styles.imagePlaceholder]}
                  accessibilityLabel={attachment.filename}
                >
                  <Text style={styles.imagePlaceholderText} numberOfLines={2}>
                    {attachment.filename}
                  </Text>
                </View>
              );
            }
            return (
              <Pressable
                key={attachment.relativePath}
                style={styles.imageLink}
                onPress={() => {
                  void Linking.openURL(url);
                }}
              >
                <Image
                  source={{ uri: url }}
                  style={styles.image}
                  accessibilityLabel={attachment.filename}
                  resizeMode="cover"
                />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {fileAttachments.length > 0 ? (
        <View style={styles.files}>
          {fileAttachments.map((attachment) => {
            const url = resolveAttachmentUrl(channelId, attachment.filename);
            if (!url) {
              return (
                <View
                  key={attachment.relativePath}
                  style={[styles.fileChip, styles.fileChipDisabled]}
                  accessibilityState={{ disabled: true }}
                >
                  <FileGlyph />
                  <Text
                    style={[styles.fileChipText, styles.fileChipTextDisabled]}
                    numberOfLines={1}
                  >
                    {attachment.filename}
                  </Text>
                </View>
              );
            }
            return (
              <Pressable
                key={attachment.relativePath}
                style={styles.fileChip}
                onPress={() => {
                  void Linking.openURL(url);
                }}
              >
                <FileGlyph />
                <Text style={styles.fileChipText} numberOfLines={1}>
                  {attachment.filename}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {segments.length > 0 ? (
        <Text style={styles.text}>
          {segments.map((segment, index) => {
            switch (segment.kind) {
              case 'url':
                return (
                  <Text
                    key={index}
                    style={styles.link}
                    onPress={() => {
                      if (segment.href) {
                        void Linking.openURL(segment.href);
                      }
                    }}
                  >
                    {segment.value}
                  </Text>
                );
              case 'mention':
                return (
                  <Text
                    key={index}
                    style={[
                      styles.mention,
                      segment.avatarColor
                        ? { backgroundColor: segment.avatarColor }
                        : null,
                    ]}
                  >
                    {segment.value}
                  </Text>
                );
              default:
                return <Text key={index}>{segment.value}</Text>;
            }
          })}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The web renderer ships an inline 14×14 SVG file glyph. RN does not parse
 * SVG without `react-native-svg`, which is a Phase-3 dependency we have
 * not added yet. The Unicode `📄` codepoint matches the visual weight of
 * the SVG closely enough to satisfy the Phase-2 visual gate. Replace once
 * `react-native-svg` (or `@expo/vector-icons`) lands.
 */
function FileGlyph() {
  return (
    <Text style={{ fontSize: 14, lineHeight: 18 }} accessibilityLabel="file">
      📄
    </Text>
  );
}
