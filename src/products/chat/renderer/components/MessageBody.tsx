import { useMemo } from 'react';
import type { ChatCat } from '../../api/contracts';
import { segmentMessageBody } from './messageBodySegmenter';

export interface MessageBodyProps {
  body: string;
  cats: ChatCat[];
}

export function MessageBody({ body, cats }: MessageBodyProps) {
  const segments = useMemo(
    () => segmentMessageBody(body, cats),
    [body, cats],
  );

  return (
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
  );
}
