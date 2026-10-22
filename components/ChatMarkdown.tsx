import { Fragment, type ReactNode } from 'react';
import { inlineParts, parseBlocks } from '@/lib/markdown';

// IJF AI's answers drawn from their blocks (lib/markdown.ts) as React elements, never as HTML. Links go
// only to dashboard pages, through onLink.

function Inline({ text, onLink }: { text: string; onLink: (href: string) => void }) {
  return (
    <>
      {inlineParts(text).map((part, i) => {
        if (part.type === 'strong') return <strong key={i}>{part.text}</strong>;
        if (part.type === 'em') return <em key={i}>{part.text}</em>;
        if (part.type === 'code') return <code key={i}>{part.text}</code>;
        if (part.type === 'link')
          return (
            <a
              key={i}
              href={part.href}
              onClick={(e) => {
                e.preventDefault();
                onLink(part.href);
              }}
            >
              {part.text}
            </a>
          );
        return <Fragment key={i}>{part.text}</Fragment>;
      })}
    </>
  );
}

export default function ChatMarkdown({ text, onLink }: { text: string; onLink: (href: string) => void }) {
  const blocks: ReactNode[] = parseBlocks(text).map((block, b) => {
    if (block.type === 'table')
      return (
        <div className="chat-table" key={b}>
          <table>
            <thead>
              <tr>
                {block.head.map((h, j) => (
                  <th key={j}>
                    <Inline text={h} onLink={onLink} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((c, j) => (
                    <td key={j}>
                      <Inline text={c} onLink={onLink} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    if (block.type === 'h')
      return (
        <p className="chat-heading" key={b}>
          <Inline text={block.text} onLink={onLink} />
        </p>
      );
    if (block.type === 'p')
      return (
        <p key={b}>
          {block.lines.map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              <Inline text={line} onLink={onLink} />
            </Fragment>
          ))}
        </p>
      );
    const List = block.type;
    return (
      <List key={b}>
        {block.items.map((item, j) => (
          <li key={j}>
            <Inline text={item} onLink={onLink} />
          </li>
        ))}
      </List>
    );
  });
  return <div className="chat-markdown">{blocks}</div>;
}
