import { useMemo } from 'react';
import type { ChatCat } from '../../api/contracts';
import { extractAttachments, segmentMessageBody } from './messageBodySegmenter';

export interface MessageBodyProps {
  body: string;
  cats: ChatCat[];
  channelId: string;
}

export function MessageBody({ body, cats, channelId }: MessageBodyProps) {
  const { attachments, textBody } = useMemo(
    () => extractAttachments(body),
    [body],
  );

  const segments = useMemo(
    () => segmentMessageBody(textBody, cats),
    [textBody, cats],
  );

  const imageAttachments = attachments.filter((a) => a.isImage);
  const fileAttachments = attachments.filter((a) => !a.isImage);

  return (
    <div className="messageBodyWrapper">
      {imageAttachments.length > 0 ? (
        <div className="messageBodyImages">
          {imageAttachments.map((attachment) => (
            <a
              key={attachment.relativePath}
              className="messageBodyImageLink"
              href={`/api/channels/${channelId}/attachments/${encodeURIComponent(attachment.filename)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                className="messageBodyImage"
                src={`/api/channels/${channelId}/attachments/${encodeURIComponent(attachment.filename)}`}
                alt={attachment.filename}
                loading="lazy"
              />
            </a>
          ))}
        </div>
      ) : null}
      {fileAttachments.length > 0 ? (
        <div className="messageBodyFiles">
          {fileAttachments.map((attachment) => (
            <a
              key={attachment.relativePath}
              className="messageBodyFileChip"
              href={`/api/channels/${channelId}/attachments/${encodeURIComponent(attachment.filename)}`}
              target="_blank"
              rel="noopener noreferrer"
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
      {textBody ? (
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
