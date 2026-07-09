/**
 * DOCX generator for About Tool technical documentation.
 * Diagrams are rendered as text-based flowcharts using DOCX tables —
 * fully self-contained, no "see web version" references.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  convertInchesToTwip,
  ShadingType,
} from 'docx';
import { saveAs } from 'file-saver';
import type { AboutToolDoc, AboutSection } from '@/data/aboutToolContent';

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  cyan:       '0e7490',  // heading accent
  body:       '334155',  // slate-700
  heading:    '0f172a',  // slate-900
  subhead:    '0e7490',  // cyan-700
  border:     'cbd5e1',  // slate-300
  rowEven:    'f8fafc',  // slate-50
  rowOdd:     'ffffff',
  tableHead:  'e0f2fe',  // sky-100
  // diagram node fills
  nodeStart:  'd1fae5',  // green-100
  nodeEnd:    'fee2e2',  // red-100
  nodeProc:   'dbeafe',  // blue-100
  nodeDec:    'fef9c3',  // yellow-100
  nodeData:   'f3e8ff',  // purple-100
  // diagram node text
  txtStart:   '065f46',
  txtEnd:     '991b1b',
  txtProc:    '1e40af',
  txtDec:     '92400e',
  txtData:    '6b21a8',
  // arrow cell
  arrow:      'f1f5f9',
};

// ── Tiny helpers ──────────────────────────────────────────────────────────────
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
    children: [new TextRun({ text, bold: true, size: 22, color: C.subhead })],
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

function gap(size = 100): Paragraph {
  return new Paragraph({ spacing: { after: size } });
}

// ── Data table ────────────────────────────────────────────────────────────────
function makeTable(table: NonNullable<AboutSection['table']>): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: table.columns.map(col =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: C.tableHead },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({ text: col, bold: true, size: 19, color: C.heading })],
        })],
      })
    ),
  });

  const dataRows = table.rows.map((row, ri) =>
    new TableRow({
      children: row.map(cell =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: ri % 2 === 0 ? C.rowEven : C.rowOdd },
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
    rows: [headerRow, ...dataRows],
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

// ── Flowchart diagram — rendered as a DOCX table grid ────────────────────────
// Each node becomes a shaded box. Edges are rendered as an arrow list beneath.
// This is fully self-contained in the DOCX — no browser required.

type NodeType = 'process' | 'data' | 'decision' | 'start' | 'end';

function nodeFill(type: NodeType): string {
  return type === 'start' ? C.nodeStart
       : type === 'end'   ? C.nodeEnd
       : type === 'data'  ? C.nodeData
       : type === 'decision' ? C.nodeDec
       : C.nodeProc;
}

function nodeTxt(type: NodeType): string {
  return type === 'start' ? C.txtStart
       : type === 'end'   ? C.txtEnd
       : type === 'data'  ? C.txtData
       : type === 'decision' ? C.txtDec
       : C.txtProc;
}

function nodeShape(type: NodeType): string {
  return type === 'start'    ? '▶ '
       : type === 'end'      ? '■ '
       : type === 'decision' ? '◆ '
       : type === 'data'     ? '⬡ '
       : '□ ';
}

function makeDiagram(diagram: NonNullable<AboutSection['diagram']>): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(body(diagram.description));
  out.push(gap(80));

  // ── Node grid (3 columns) ──────────────────────────────────────────────────
  if (diagram.nodes && diagram.nodes.length > 0) {
    const COLS = 3;
    const nodes = diagram.nodes;
    // Pad to multiple of COLS
    const padded = [...nodes];
    while (padded.length % COLS !== 0) padded.push(null as any);

    const tableRows: TableRow[] = [];

    for (let r = 0; r < padded.length / COLS; r++) {
      const cells: TableCell[] = [];
      for (let c = 0; c < COLS; c++) {
        const node = padded[r * COLS + c];
        if (!node) {
          // Empty filler cell
          cells.push(new TableCell({
            borders: {
              top:    { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
              bottom: { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
              left:   { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
              right:  { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
            },
            children: [new Paragraph({ children: [] })],
          }));
          continue;
        }
        cells.push(new TableCell({
          shading: { type: ShadingType.CLEAR, fill: nodeFill(node.type) },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          borders: {
            top:    { style: BorderStyle.SINGLE, size: 4, color: C.border },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border },
            left:   { style: BorderStyle.SINGLE, size: 4, color: C.border },
            right:  { style: BorderStyle.SINGLE, size: 4, color: C.border },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: nodeShape(node.type) + node.label.replace(/\n/g, ' '),
                  bold: node.type === 'start' || node.type === 'end',
                  size: 18,
                  color: nodeTxt(node.type),
                }),
              ],
            }),
          ],
        }));
      }
      tableRows.push(new TableRow({ children: cells }));
    }

    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows,
      borders: {
        top:              { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
        bottom:           { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
        left:             { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
        right:            { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
        insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
      },
    }));
    out.push(gap(120));
  }

  // ── Flow arrows ────────────────────────────────────────────────────────────
  if (diagram.edges && diagram.edges.length > 0) {
    out.push(new Paragraph({
      ...sp(80, 100),
      children: [new TextRun({ text: 'Flow Sequence', bold: true, size: 19, color: C.heading })],
    }));

    for (const edge of diagram.edges) {
      const label = edge.label ? `  [${edge.label}]` : '';
      out.push(new Paragraph({
        ...sp(60),
        children: [
          new TextRun({ text: `  ${edge.from}`, size: 18, color: C.txtProc, bold: true }),
          new TextRun({ text: '  →  ', size: 18, color: C.body }),
          new TextRun({ text: edge.to, size: 18, color: C.txtProc, bold: true }),
          new TextRun({ text: label, size: 17, color: C.subhead, italics: true }),
        ],
      }));
    }

    // Legend
    out.push(gap(80));
    out.push(new Paragraph({
      ...sp(60, 80),
      children: [new TextRun({ text: 'Legend:', bold: true, size: 17, color: C.heading })],
    }));
    const legend: [string, string, NodeType][] = [
      ['▶', 'Start / Entry point', 'start'],
      ['■', 'End / Terminal state', 'end'],
      ['□', 'Process / Action', 'process'],
      ['◆', 'Decision / Condition', 'decision'],
      ['⬡', 'Data / External system', 'data'],
    ];
    for (const [sym, desc, type] of legend) {
      out.push(new Paragraph({
        ...sp(50),
        children: [
          new TextRun({ text: `  ${sym} `, size: 18, color: nodeTxt(type), bold: true }),
          new TextRun({ text: desc, size: 17, color: C.body }),
        ],
      }));
    }
  }

  out.push(gap(160));
  return out;
}

// ── Code block ────────────────────────────────────────────────────────────────
function makeCodeBlock(ex: NonNullable<AboutSection['codeExample']>): (Paragraph | Table)[] {
  return [
    body(ex.description),
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: '1e293b' },
      ...sp(240, 80),
      children: [
        new TextRun({ text: ex.code, font: 'Courier New', size: 18, color: 'e2e8f0' }),
      ],
    }),
  ];
}

// ── Section builder ───────────────────────────────────────────────────────────
function buildSection(section: AboutSection): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(h1(section.heading));

  if (section.intro) out.push(body(section.intro));

  if (section.content) {
    for (const line of section.content) {
      if (line.startsWith('**') && line.endsWith('**')) {
        out.push(h2(line.replace(/\*\*/g, '')));
      } else if (!line.trim()) {
        out.push(gap(80));
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

  // Diagram — fully inline, no external reference
  if (section.diagram) out.push(...makeDiagram(section.diagram));

  // Table
  if (section.table) {
    out.push(gap(120));
    out.push(makeTable(section.table));
    out.push(gap(240));
  }

  // Code
  if (section.codeExample) out.push(...makeCodeBlock(section.codeExample));

  out.push(gap(80));
  return out;
}

// ── Cover page ────────────────────────────────────────────────────────────────
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
    // Divider
    new Paragraph({
      alignment: AlignmentType.CENTER,
      ...sp(400),
      children: [new TextRun({ text: '─────────────────────────────────', size: 18, color: C.border })],
    }),
  ];
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function generateAboutToolDocx(doc: AboutToolDoc): Promise<void> {
  const children: (Paragraph | Table)[] = [
    ...buildCover(doc),
    ...doc.sections.flatMap(buildSection),
  ];

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
