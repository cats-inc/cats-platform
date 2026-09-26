import { Fragment, type ReactNode } from 'react';
import { Linking, ScrollView, Text, View, type StyleProp, type TextStyle } from 'react-native';

import {
  readMarkdownMention,
  type MessageBodyMarkdownNode,
  type MessageBodyMarkdownRoot,
} from '../../../src/mobile/index.js';
import { estimateTableColumnWidths, type MarkdownTable } from './markdownTableLayout';
import {
  messageBodyMarkdownStyles as styles,
  messageBodyStyles,
} from './styles/messageBody';

type MarkdownList = Extract<MessageBodyMarkdownNode, { type: 'list' }>;
type MarkdownListItem = Extract<MessageBodyMarkdownNode, { type: 'listItem' }>;

interface BlockContext {
  quoted: boolean;
  listDepth: number;
}

/** Links open outside the app only for web URLs, matching the Desktop renderer. */
const EXTERNAL_URL_REGEX = /^https?:\/\//i;
const BULLETS = ['•', '◦', '▪'];
const TOP_LEVEL: BlockContext = { quoted: false, listDepth: 0 };

export interface MessageBodyMarkdownProps {
  root: MessageBodyMarkdownRoot;
}

/**
 * Draws the shared agent-reply markdown tree with React Native primitives.
 * Raw HTML stays text and images render as links, as on the web.
 */
export function MessageBodyMarkdown({ root }: MessageBodyMarkdownProps) {
  return <View style={styles.blocks}>{renderBlocks(root.children, TOP_LEVEL)}</View>;
}

function renderBlocks(
  nodes: readonly MessageBodyMarkdownNode[],
  context: BlockContext,
): ReactNode[] {
  return nodes.map((node, index) => renderBlock(node, index, context));
}

function renderBlock(
  node: MessageBodyMarkdownNode,
  key: number,
  context: BlockContext,
): ReactNode {
  const textStyle = blockTextStyle(context);
  switch (node.type) {
    case 'paragraph':
      return <Text key={key} style={textStyle}>{renderInlines(node.children)}</Text>;
    case 'heading':
      return (
        <Text
          key={key}
          style={[
            textStyle,
            styles.heading,
            node.depth === 1 ? styles.heading1 : null,
            node.depth === 2 ? styles.heading2 : null,
          ]}
        >
          {renderInlines(node.children)}
        </Text>
      );
    case 'blockquote':
      return (
        <View key={key} style={[styles.blocks, styles.blockquote]}>
          {renderBlocks(node.children, { ...context, quoted: true })}
        </View>
      );
    case 'list':
      return <MarkdownListView key={key} list={node} context={context} />;
    case 'code':
      return (
        <ScrollView
          key={key}
          horizontal
          style={styles.codeBlock}
          contentContainerStyle={styles.codeBlockContent}
        >
          <Text style={styles.codeBlockText}>{node.value}</Text>
        </ScrollView>
      );
    case 'table':
      return <MarkdownTableView key={key} table={node} />;
    case 'thematicBreak':
      return <View key={key} style={styles.rule} />;
    case 'html':
      return <Text key={key} style={textStyle}>{node.value}</Text>;
    case 'footnoteDefinition':
      return (
        <View key={key} style={styles.listItem}>
          <Text style={[textStyle, styles.listMarker]}>[{node.label ?? node.identifier}]</Text>
          <View style={styles.listItemBody}>{renderBlocks(node.children, context)}</View>
        </View>
      );
    default:
      // Link reference definitions have no visible content.
      return null;
  }
}

function blockTextStyle(context: BlockContext): StyleProp<TextStyle> {
  return [messageBodyStyles.text, context.quoted ? styles.quoteText : null];
}

function MarkdownListView({ list, context }: { list: MarkdownList; context: BlockContext }) {
  const start = list.start ?? 1;
  const itemContext = { ...context, listDepth: context.listDepth + 1 };
  return (
    <View style={styles.list}>
      {list.children.map((item, index) => (
        <View key={index} style={styles.listItem}>
          <Text style={[blockTextStyle(context), styles.listMarker]}>
            {listMarker(list, item, start + index, context.listDepth)}
          </Text>
          <View style={styles.listItemBody}>{renderBlocks(item.children, itemContext)}</View>
        </View>
      ))}
    </View>
  );
}

function listMarker(
  list: MarkdownList,
  item: MarkdownListItem,
  ordinal: number,
  depth: number,
): string {
  if (typeof item.checked === 'boolean') {
    return item.checked ? '☑' : '☐';
  }
  return list.ordered ? `${ordinal}.` : BULLETS[Math.min(depth, BULLETS.length - 1)];
}

function MarkdownTableView({ table }: { table: MarkdownTable }) {
  const widths = estimateTableColumnWidths(table);
  return (
    <ScrollView horizontal>
      <View style={styles.table}>
        {table.children.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.tableRow}>
            {widths.map((width, column) => {
              const cell = row.children[column];
              const align = table.align?.[column] ?? null;
              return (
                <View
                  key={column}
                  style={[styles.tableCell, rowIndex === 0 ? styles.tableHeaderCell : null, { width }]}
                >
                  <Text
                    style={[
                      messageBodyStyles.text,
                      styles.tableText,
                      rowIndex === 0 ? styles.tableHeaderText : null,
                      align ? { textAlign: align } : null,
                    ]}
                  >
                    {cell ? renderInlines(cell.children) : null}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function renderInlines(nodes: readonly MessageBodyMarkdownNode[]): ReactNode[] {
  return nodes.map((node, index) => renderInline(node, index));
}

function renderInline(node: MessageBodyMarkdownNode, key: number): ReactNode {
  switch (node.type) {
    case 'text': {
      const mention = readMarkdownMention(node);
      if (!mention) {
        return <Fragment key={key}>{node.value}</Fragment>;
      }
      return (
        <Text
          key={key}
          style={[
            messageBodyStyles.mention,
            mention.avatarColor ? { backgroundColor: mention.avatarColor } : null,
          ]}
        >
          {node.value}
        </Text>
      );
    }
    case 'break':
      return <Fragment key={key}>{'\n'}</Fragment>;
    case 'strong':
      return <Text key={key} style={styles.strong}>{renderInlines(node.children)}</Text>;
    case 'emphasis':
      return <Text key={key} style={styles.emphasis}>{renderInlines(node.children)}</Text>;
    case 'delete':
      return <Text key={key} style={styles.delete}>{renderInlines(node.children)}</Text>;
    case 'inlineCode':
      return <Text key={key} style={styles.inlineCode}>{node.value}</Text>;
    case 'link':
      return <MarkdownLink key={key} url={node.url}>{renderInlines(node.children)}</MarkdownLink>;
    case 'image': {
      // Remote images are not loaded automatically, so a reply cannot trigger requests.
      const label = node.alt || node.url;
      return EXTERNAL_URL_REGEX.test(node.url)
        ? <MarkdownLink key={key} url={node.url}>{label}</MarkdownLink>
        : <Fragment key={key}>{label}</Fragment>;
    }
    case 'linkReference':
      return <Fragment key={key}>{renderInlines(node.children)}</Fragment>;
    case 'imageReference':
      return <Fragment key={key}>{node.alt ?? ''}</Fragment>;
    case 'footnoteReference':
      return <Fragment key={key}>[{node.label ?? node.identifier}]</Fragment>;
    case 'html':
      return <Fragment key={key}>{node.value}</Fragment>;
    default:
      return null;
  }
}

function MarkdownLink({ url, children }: { url: string; children: ReactNode }) {
  if (EXTERNAL_URL_REGEX.test(url)) {
    return (
      <Text
        style={messageBodyStyles.link}
        onPress={() => {
          void Linking.openURL(url);
        }}
      >
        {children}
      </Text>
    );
  }
  // Local files, anchors and Desktop routes have nothing to open on the device.
  return <Text style={styles.inertLink}>{children}</Text>;
}
