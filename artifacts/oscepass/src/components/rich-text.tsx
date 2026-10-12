import type { ReactNode } from 'react';

/** Renders **bold** inside a line. Everything else stays plain text (no HTML is ever injected). */
export function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <span key={index}>{part}</span>,
  );
}

/** Station text format: blank line = new paragraph, lines starting with "- " = bullet list, **bold**. */
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    blocks.push(<ul key={`ul-${blocks.length}`}>{bullets.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>);
    bullets = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('- ')) { bullets.push(line.slice(2)); continue; }
    flush();
    if (line) blocks.push(<p key={`p-${blocks.length}`}>{inline(line)}</p>);
  }
  flush();
  return <div className={`rich-text ${className}`.trim()}>{blocks}</div>;
}

/** Only web, mail and same-site links are allowed from content. */
export function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const value = url.trim();
  return /^(https?:\/\/|mailto:|\/(?!\/))/i.test(value) ? value : undefined;
}
