'use client';
/**
 * Minimal markdown renderer for Copilot answers.
 *
 * The Copilot emits a deliberately small subset — headings, bold, inline code,
 * bullet lists, blockquotes and horizontal rules — so a 100-line renderer is
 * preferable to pulling in a markdown library and a sanitiser. Nothing is ever
 * rendered as raw HTML, which removes the injection surface entirely.
 */
import { ReactNode } from 'react';

/** Renders `code`, **bold** and _italic_ inside a line of text. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split on inline code first — content inside backticks is never styled further.
  const parts = text.split(/(`[^`]+`)/g);

  parts.forEach((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      nodes.push(
        <code
          key={`${keyPrefix}-c${i}`}
          className="px-1 py-[1px] rounded font-mono text-[10px]"
          style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)', color: '#67e8f9' }}
        >
          {part.slice(1, -1)}
        </code>,
      );
      return;
    }

    // Bold, then italics, within the non-code segments.
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    boldParts.forEach((bp, j) => {
      if (bp.startsWith('**') && bp.endsWith('**') && bp.length > 4) {
        nodes.push(
          <strong key={`${keyPrefix}-b${i}-${j}`} className="font-bold text-slate-100">
            {bp.slice(2, -2)}
          </strong>,
        );
        return;
      }
      const italicParts = bp.split(/(_[^_]+_)/g);
      italicParts.forEach((ip, k) => {
        if (ip.startsWith('_') && ip.endsWith('_') && ip.length > 2) {
          nodes.push(
            <em key={`${keyPrefix}-i${i}-${j}-${k}`} className="italic text-slate-400">
              {ip.slice(1, -1)}
            </em>,
          );
        } else if (ip) {
          nodes.push(<span key={`${keyPrefix}-t${i}-${j}-${k}`}>{ip}</span>);
        }
      });
    });
  });

  return nodes;
}

export default function CopilotMarkdown({ text }: { text: string }) {
  const lines = (text || '').split('\n');
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={key} className="space-y-1 my-1.5">
        {listBuffer.map((item, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="shrink-0 mt-[5px] w-1 h-1 rounded-full" style={{ background: 'rgba(6,182,212,0.5)' }} />
            <span className="flex-1">{inline(item, `${key}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const key = `l${idx}`;

    // Bullet list item — also handles the numbered steps the Copilot emits.
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet) { listBuffer.push(bullet[1]); return; }
    if (numbered) { listBuffer.push(numbered[1]); return; }

    flushList(`${key}-list`);

    if (line.trim() === '') return;

    if (/^---+$/.test(line.trim())) {
      blocks.push(<div key={key} className="my-2 h-[1px]" style={{ background: 'rgba(51,65,85,0.25)' }} />);
      return;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <div
          key={key}
          className={`font-bold text-slate-100 ${level <= 2 ? 'text-xs mt-2.5' : 'text-[11px] mt-2'} mb-1`}
        >
          {inline(heading[2], key)}
        </div>,
      );
      return;
    }

    if (line.startsWith('>')) {
      blocks.push(
        <div
          key={key}
          className="pl-2.5 my-1.5 text-slate-400 italic"
          style={{ borderLeft: '2px solid rgba(6,182,212,0.25)' }}
        >
          {inline(line.replace(/^>\s?/, ''), key)}
        </div>,
      );
      return;
    }

    blocks.push(<p key={key} className="my-1 leading-relaxed">{inline(line, key)}</p>);
  });

  flushList('tail-list');

  return <div className="text-[11px] text-slate-300">{blocks}</div>;
}
