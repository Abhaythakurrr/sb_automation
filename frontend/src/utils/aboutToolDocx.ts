/**
 * DOCX generator — StoneBranch Technical Documentation
 *
 * Diagrams are rendered to PNG images via an offscreen HTML canvas,
 * then embedded as real images in the DOCX. No "see web version" text.
 * The result opens cleanly in Microsoft Word and can be sent to clients.
 */

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, convertInchesToTwip,
  ShadingType, ImageRun,
} from 'docx';
import { saveAs } from 'file-saver';
import type { AboutToolDoc, AboutSection } from '@/data/aboutToolContent';

// ─────────────────────────────────────────────────────────────────────────────
// Colours
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  cyan:    '0e7490',
  body:    '334155',
  heading: '0f172a',
  sub:     '0e7490',
  border:  'cbd5e1',
  thFill:  'e0f2fe',
  rowA:    'f8fafc',
  rowB:    'ffffff',
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCX paragraph helpers
// ─────────────────────────────────────────────────────────────────────────────
const sp = (after = 120, before = 0) => ({ spacing: { after, before } });

function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    ...sp(160, 400),
    children: [new TextRun({ text, bold: true, size: 28, color: C.heading })],
  });
}
function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    ...sp(120, 280),
    children: [new TextRun({ text, bold: true, size: 22, color: C.sub })],
  });
}
function body(text: string): Paragraph {
  return new Paragraph({
    ...sp(120),
    children: [new TextRun({ text, size: 20, color: C.body })],
  });
}
function bullet(text: string, level = 0): Paragraph {
  return new Paragraph({
    bullet: { level },
    ...sp(80),
    children: [new TextRun({ text, size: 19, color: C.body })],
  });
}
function gap(n = 120): Paragraph {
  return new Paragraph({ spacing: { after: n } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Data table
// ─────────────────────────────────────────────────────────────────────────────
function makeTable(tbl: NonNullable<AboutSection['table']>): Table {
  const header = new TableRow({
    tableHeader: true,
    children: tbl.columns.map(col =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: C.thFill },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({ text: col, bold: true, size: 19, color: C.heading })],
        })],
      })
    ),
  });
  const rows = tbl.rows.map((row, ri) =>
    new TableRow({
      children: row.map(cell =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: ri % 2 === 0 ? C.rowA : C.rowB },
          margins: { top: 70, bottom: 70, left: 120, right: 120 },
          children: [new Paragraph({
            children: [new TextRun({ text: cell, size: 18, color: C.body })],
          })],
        })
      ),
    })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...rows],
    borders: {
      top:              { style: BorderStyle.SINGLE, size: 1, color: C.border },
      bottom:           { style: BorderStyle.SINGLE, size: 1, color: C.border },
      left:             { style: BorderStyle.SINGLE, size: 1, color: C.border },
      right:            { style: BorderStyle.SINGLE, size: 1, color: C.border },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: C.border },
      insideVertical:   { style: BorderStyle.SINGLE, size: 1, color: C.border },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas-based diagram renderer
// ─────────────────────────────────────────────────────────────────────────────
// Produces a PNG ArrayBuffer that can be embedded directly into the DOCX.

type NodeType = 'process' | 'data' | 'decision' | 'start' | 'end';

interface DiagramNode { id: string; label: string; type: NodeType; }
interface DiagramEdge { from: string; to: string; label?: string; }

// Visual config for each node type
const NODE_STYLE: Record<NodeType, { fill: string; stroke: string; text: string; shape: 'rect' | 'diamond' | 'rounded' | 'stadium' }> = {
  start:    { fill: '#dcfce7', stroke: '#16a34a', text: '#14532d', shape: 'stadium'  },
  end:      { fill: '#fee2e2', stroke: '#dc2626', text: '#7f1d1d', shape: 'stadium'  },
  process:  { fill: '#dbeafe', stroke: '#2563eb', text: '#1e3a8a', shape: 'rect'     },
  decision: { fill: '#fef9c3', stroke: '#ca8a04', text: '#78350f', shape: 'diamond'  },
  data:     { fill: '#f3e8ff', stroke: '#9333ea', text: '#4a044e', shape: 'rounded'  },
};

/**
 * Lay out nodes in a top-down flow: each node gets a (col, row) slot.
 * We use edge order to assign rows, grouping parallel branches in the same row.
 */
function layoutNodes(
  nodes: DiagramNode[],
  edges: DiagramEdge[]
): Map<string, { x: number; y: number; w: number; h: number }> {
  // Build adjacency for BFS rank assignment
  const rankMap = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) adj.get(e.from)?.push(e.to);

  // BFS from nodes with no incoming edges
  const inDeg = new Map<string, number>();
  for (const n of nodes) inDeg.set(n.id, 0);
  for (const e of edges) inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);

  const queue: string[] = nodes.filter(n => (inDeg.get(n.id) ?? 0) === 0).map(n => n.id);
  for (const id of queue) rankMap.set(id, 0);

  while (queue.length) {
    const cur = queue.shift()!;
    const rank = rankMap.get(cur) ?? 0;
    for (const next of (adj.get(cur) ?? [])) {
      const existing = rankMap.get(next) ?? -1;
      if (rank + 1 > existing) rankMap.set(next, rank + 1);
      if (!queue.includes(next) && (inDeg.get(next) ?? 0) > 0) queue.push(next);
    }
  }

  // Group by rank
  const byRank = new Map<number, string[]>();
  for (const n of nodes) {
    const r = rankMap.get(n.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(n.id);
  }

  const NODE_W = 180;
  const NODE_H = 60;
  const PAD_X  = 40;
  const PAD_Y  = 70;
  const START_Y = 30;

  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  const maxCols = Math.max(...Array.from(byRank.values()).map(a => a.length));

  for (const [rank, ids] of Array.from(byRank.entries()).sort((a, b) => a[0] - b[0])) {
    const totalW = ids.length * NODE_W + (ids.length - 1) * PAD_X;
    const canvasW = maxCols * NODE_W + (maxCols - 1) * PAD_X;
    let startX = (canvasW - totalW) / 2;
    for (const id of ids) {
      pos.set(id, {
        x: startX,
        y: START_Y + rank * (NODE_H + PAD_Y),
        w: NODE_W,
        h: NODE_H,
      });
      startX += NODE_W + PAD_X;
    }
  }
  return pos;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawNode(ctx: CanvasRenderingContext2D, node: DiagramNode, p: { x: number; y: number; w: number; h: number }) {
  const s = NODE_STYLE[node.type];
  ctx.fillStyle   = s.fill;
  ctx.strokeStyle = s.stroke;
  ctx.lineWidth   = 2;

  const { x, y, w, h } = p;

  if (s.shape === 'diamond') {
    const cx = x + w / 2, cy = y + h / 2;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(x + w, cy);
    ctx.lineTo(cx, y + h);
    ctx.lineTo(x, cy);
    ctx.closePath();
  } else if (s.shape === 'stadium') {
    roundRect(ctx, x, y, w, h, h / 2);
  } else if (s.shape === 'rounded') {
    roundRect(ctx, x, y, w, h, 10);
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
  ctx.fill(); ctx.stroke();

  // Label — wrap at ~22 chars
  ctx.fillStyle  = s.text;
  ctx.font       = '13px sans-serif';
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'middle';
  const label = node.label.replace(/\n/g, ' ');
  const words = label.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > p.w - 16) { if (cur) lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);

  const lineH = 16;
  const totalH = lines.length * lineH;
  const startY = y + h / 2 - totalH / 2 + lineH / 2;
  lines.forEach((l, i) => ctx.fillText(l, x + p.w / 2, startY + i * lineH));
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  label?: string
) {
  ctx.strokeStyle = '#64748b';
  ctx.fillStyle   = '#64748b';
  ctx.lineWidth   = 1.5;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Arrowhead
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const AH = 10;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - AH * Math.cos(angle - 0.4), y2 - AH * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - AH * Math.cos(angle + 0.4), y2 - AH * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();

  // Edge label
  if (label) {
    ctx.fillStyle  = '#0e7490';
    ctx.font       = 'italic 11px sans-serif';
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    ctx.fillText(label, mx + 6, my - 8);
  }
}

async function renderDiagramToPng(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  description: string
): Promise<ArrayBuffer> {
  const pos    = layoutNodes(nodes, edges);
  const MARGIN = 40;
  const NODE_H = 60;
  const PAD_Y  = 70;

  // Canvas size
  const maxRank = Math.max(...nodes.map(n => {
    let maxR = 0;
    pos.forEach((p, id) => { /* find rank via y */ });
    return 0;
  }));
  const allPos  = Array.from(pos.values());
  const canvasW = Math.max(...allPos.map(p => p.x + p.w)) + MARGIN * 2;
  const canvasH = Math.max(...allPos.map(p => p.y + p.h)) + MARGIN * 2 + 30;

  const canvas = document.createElement('canvas');
  canvas.width  = canvasW  + MARGIN * 2;
  canvas.height = canvasH  + MARGIN;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Description label
  ctx.fillStyle    = '#334155';
  ctx.font         = '12px sans-serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(description, MARGIN, 10);

  // Offset all positions by margin
  const off = (p: { x: number; y: number; w: number; h: number }) =>
    ({ x: p.x + MARGIN, y: p.y + MARGIN + 28, w: p.w, h: p.h });

  // Draw edges first (behind nodes)
  for (const edge of edges) {
    const fromPos = pos.get(edge.from);
    const toPos   = pos.get(edge.to);
    if (!fromPos || !toPos) continue;
    const fp = off(fromPos), tp = off(toPos);
    // Exit from bottom-centre, enter at top-centre
    const x1 = fp.x + fp.w / 2, y1 = fp.y + fp.h;
    const x2 = tp.x + tp.w / 2, y2 = tp.y;
    drawArrow(ctx, x1, y1, x2, y2, edge.label);
  }

  // Draw nodes
  for (const node of nodes) {
    const p = pos.get(node.id);
    if (p) drawNode(ctx, node, off(p));
  }

  // Legend bar at bottom
  const legendY = canvas.height - 28;
  const types: NodeType[] = ['start', 'end', 'process', 'decision', 'data'];
  const labels = ['Start', 'End', 'Process', 'Decision', 'Data/System'];
  let lx = MARGIN;
  for (let i = 0; i < types.length; i++) {
    const s = NODE_STYLE[types[i]];
    ctx.fillStyle = s.fill; ctx.strokeStyle = s.stroke; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.rect(lx, legendY, 14, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#334155'; ctx.font = '11px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], lx + 18, legendY + 7);
    lx += ctx.measureText(labels[i]).width + 36;
  }

  return await new Promise<ArrayBuffer>((resolve) => {
    canvas.toBlob((blob) => {
      blob!.arrayBuffer().then(resolve);
    }, 'image/png', 1.0);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Section builder
// ─────────────────────────────────────────────────────────────────────────────
async function buildSection(section: AboutSection): Promise<(Paragraph | Table)[]> {
  const out: (Paragraph | Table)[] = [];

  out.push(h1(section.heading));
  if (section.intro) out.push(body(section.intro));

  if (section.content) {
    for (const line of section.content) {
      if (!line.trim()) { out.push(gap(80)); continue; }
      if (line.startsWith('**') && line.endsWith('**')) {
        out.push(h2(line.replace(/\*\*/g, '')));
      } else {
        out.push(body(line));
      }
    }
  }

  if (section.subsections) {
    for (const sub of section.subsections) {
      out.push(h2(sub.title));
      for (const pt of sub.points) out.push(bullet(pt));
    }
  }

  // ── Diagram rendered as a real PNG image ───────────────────────────────────
  if (section.diagram?.nodes && section.diagram.nodes.length > 0) {
    try {
      const png = await renderDiagramToPng(
        section.diagram.nodes,
        section.diagram.edges ?? [],
        section.diagram.description
      );

      // Calculate display size — transformation uses points (1 pt = 12700 EMU)
      // Target: 6 inches wide = 432 pt; height scaled proportionally.
      const pos2  = layoutNodes(section.diagram.nodes, section.diagram.edges ?? []);
      const allP2 = Array.from(pos2.values());
      const pxW   = Math.max(...allP2.map(p => p.x + p.w)) + 160;
      const pxH   = Math.max(...allP2.map(p => p.y + p.h)) + 116;
      const dispW = 432;                                    // 6 inches in pt
      const dispH = Math.round(dispW * (pxH / pxW));

      out.push(new Paragraph({
        ...sp(80, 120),
        children: [
          new ImageRun({
            data: png,
            transformation: { width: dispW, height: dispH },
            type: 'png',
          }),
        ],
      }));
    } catch (err) {
      // Fallback: plain text edge list
      out.push(body(`[Diagram: ${section.diagram.description}]`));
      if (section.diagram.edges) {
        for (const e of section.diagram.edges) {
          out.push(bullet(`${e.from}  →  ${e.to}${e.label ? '  (' + e.label + ')' : ''}`));
        }
      }
    }
    out.push(gap(160));
  }

  if (section.table) {
    out.push(gap(120));
    out.push(makeTable(section.table));
    out.push(gap(240));
  }

  if (section.codeExample) {
    out.push(body(section.codeExample.description));
    out.push(new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: '1e293b' },
      ...sp(240, 80),
      children: [new TextRun({
        text: section.codeExample.code,
        font: 'Courier New', size: 18, color: 'e2e8f0',
      })],
    }));
  }

  out.push(gap(80));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cover page
// ─────────────────────────────────────────────────────────────────────────────
function buildCover(doc: AboutToolDoc): Paragraph[] {
  return [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      ...sp(200, 600),
      children: [new TextRun({ text: doc.title.toUpperCase(), bold: true, size: 36, color: C.cyan })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      ...sp(600),
      children: [new TextRun({ text: doc.subtitle, size: 22, color: C.body })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      ...sp(500),
      children: [new TextRun({ text: '─────────────────────────────────', size: 18, color: C.border })],
    }),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────────
export async function generateAboutToolDocx(doc: AboutToolDoc): Promise<void> {
  const children: (Paragraph | Table)[] = [...buildCover(doc)];

  for (const section of doc.sections) {
    children.push(...await buildSection(section));
  }

  const document = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top:    convertInchesToTwip(0.85),
            right:  convertInchesToTwip(0.85),
            bottom: convertInchesToTwip(0.85),
            left:   convertInchesToTwip(0.85),
          },
        },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(document);
  saveAs(blob, 'StoneBranch_Technical_Documentation.docx');
}
