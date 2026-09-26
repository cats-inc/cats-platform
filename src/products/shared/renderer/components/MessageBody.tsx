import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { MessageBodyMarkdown } from './MessageBodyMarkdown.js';
import {
  extractAttachments,
  segmentMessageBody,
  type MentionResolverCat,
} from './messageBodySegmenter.js';

/** Agent replies are authored as markdown; other senders' text is shown literally. */
export type MessageBodyFormat = 'plain' | 'markdown';

export interface MessageBodyProps {
  body: string;
  cats: MentionResolverCat[];
  channelId: string;
  disabledMentionNames?: string[];
  format?: MessageBodyFormat;
}

const NO_DISABLED_MENTION_NAMES: string[] = [];

export function MessageBody({
  body,
  cats,
  channelId,
  disabledMentionNames = NO_DISABLED_MENTION_NAMES,
  format = 'plain',
}: MessageBodyProps) {
  const { attachments, textBody } = useMemo(
    () => extractAttachments(body),
    [body],
  );

  const segments = useMemo(
    () => (format === 'plain' ? segmentMessageBody(textBody, cats, disabledMentionNames) : []),
    [disabledMentionNames, format, textBody, cats],
  );

  const imageAttachments = attachments.filter((attachment) => attachment.isImage);
  const fileAttachments = attachments.filter((attachment) => !attachment.isImage);
  const encodedChannelId = encodeURIComponent(channelId);

  return (
    <div className="messageBodyWrapper">
      {imageAttachments.length > 0 ? (
        <div className="messageBodyImages">
          {imageAttachments.map((attachment) => {
            const attachmentUrl = `/api/channels/${encodedChannelId}/attachments/${encodeURIComponent(attachment.filename)}`;
            return (
              <a
                key={attachment.relativePath}
                className="messageBodyImageLink"
                href={attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  className="messageBodyImage"
                  src={attachmentUrl}
                  alt={attachment.filename}
                  loading="lazy"
                />
              </a>
            );
          })}
        </div>
      ) : null}
      {fileAttachments.length > 0 ? (
        <div className="messageBodyFiles">
          {fileAttachments.map((attachment) => (
            <a
              key={attachment.relativePath}
              className="messageBodyFileChip"
              href={`/api/channels/${encodedChannelId}/attachments/${encodeURIComponent(attachment.filename)}`}
              download={attachment.filename}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              {attachment.filename}
            </a>
          ))}
        </div>
      ) : null}
      {textBody && format === 'markdown' ? (
        <MessageBodyMarkdown
          text={textBody}
          cats={cats}
          disabledMentionNames={disabledMentionNames}
        />
      ) : null}
      {textBody && format === 'plain' ? (
        <p className="messageBody">
          {segments.map((segment, index) => {
            switch (segment.kind) {
              case 'url':
                return (
                  <a
                    key={index}
                    className="messageBodyLink"
                    href={segment.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {segment.value}
                  </a>
                );
              case 'route':
                return (
                  <Link
                    key={index}
                    className="messageBodyLink"
                    to={segment.href ?? segment.value}
                  >
                    {segment.value}
                  </Link>
                );
              case 'mention':
                return (
                  <span
                    key={index}
                    className="messageBodyMention"
                    style={
                      segment.avatarColor
                        ? { background: segment.avatarColor }
                        : undefined
                    }
                  >
                    {segment.value}
                  </span>
                );
              default:
                return <span key={index}>{segment.value}</span>;
            }
          })}
        </p>
      ) : null}
    </div>
  );
}
