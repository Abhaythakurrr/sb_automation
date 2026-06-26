/**
 * SOP → DOCX generator.
 * Builds a professional Word document from the shared Sop structure so the
 * downloaded file mirrors the on-screen SOP. Uses the `docx` library; imported
 * dynamically by callers so it never runs during SSR.
 */
// `docx` (and its JSZip dependency) rely on the Node globals `Buffer` and
// `process` (including `process.nextTick`). The webpack config provides them,
// but we also set them defensively at runtime using the real browser polyfills.
import { Buffer as BufferPolyfill } from 'buffer';
// @ts-ignore - process/browser has no bundled type declarations
import processPolyfill from 'process/browser';
if (typeof globalThis !== 'undefined') {
  const g = globalThis as any;
  if (!g.Buffer) g.Buffer = BufferPolyfill;
  if (!g.process || typeof g.process.nextTick !== 'function') g.process = processPolyfill;
}
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak,
} from 'docx';
import type { Sop, SopSection, CalloutKind } from '@/data/sopContent';

function hex(c: string) { return c.replace('#', '').toUpperCase(); }

const CALLOUT_STYLE: Record<CalloutKind, { fill: string; text: string; label: string }> = {
  info:    { fill: 'E3F2FD', text: '0D47A1', label: 'NOTE' },
  warning: { fill: 'FFF8E1', text: '8D6E00', label: 'IMPORTANT' },
  success: { fill: 'E8F5E9', text: '1B5E20', label: 'TIP' },
  danger:  { fill: 'FDECEA', text: 'B71C1C', label: 'CAUTION' },
};

function spacer(size = 120) {
  return new Paragraph({ spacing: { after: size }, children: [new TextRun('')] });
}

function metaRow(label: string, value: string, accent: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 28, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: 'EEF2F7', color: 'auto' },
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: '334155', size: 20 })] })],
      }),
      new TableCell({
        width: { size: 72, type: WidthType.PERCENTAGE },
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: value, size: 20, color: '0F172A' })] })],
      }),
    ],
  });
}

function calloutBlock(kind: CalloutKind, title: string, body: string): Table {
  const s = CALLOUT_STYLE[kind];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 2, color: s.text },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: s.text },
      left:   { style: BorderStyle.SINGLE, size: 18, color: s.text },
      right:  { style: BorderStyle.SINGLE, size: 2, color: s.text },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: s.fill, color: 'auto' },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              new Paragraph({ children: [new TextRun({ text: `${s.label}: ${title}`, bold: true, color: s.text, size: 20 })] }),
              new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: body, color: s.text, size: 20 })] }),
            ],
          }),
        ],
      }),
    ],
  });
}

function dataTable(columns: string[], rows: string[][], accent: string): Table {
  const headerCells = columns.map(c =>
    new TableCell({
      shading: { type: ShadingType.CLEAR, fill: hex(accent), color: 'auto' },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, color: 'FFFFFF', size: 19 })] })],
    })
  );
  const bodyRows = rows.map((r, idx) =>
    new TableRow({
      children: r.map(cell =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: idx % 2 === 0 ? 'F8FAFC' : 'FFFFFF', color: 'auto' },
          margins: { top: 70, bottom: 70, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: cell, size: 19, color: '0F172A' })] })],
        })
      ),
    })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ tableHeader: true, children: headerCells }), ...bodyRows],
  });
}

// ── UI mockups ("screenshots") rendered as framed tables ────────────────────
type MockTone = 'default' | 'accent' | 'ok' | 'warn' | 'danger' | 'muted';
interface MockLine { pin?: number; label: string; value?: string; tone?: MockTone; }
interface MockDef { title: string; caption: string; lines: MockLine[]; }

const MOCK_TONE: Record<MockTone, { color: string; bold: boolean }> = {
  default: { color: '334155', bold: false },
  accent:  { color: '0E7490', bold: true },
  ok:      { color: '1B7F3B', bold: true },
  warn:    { color: '8D6E00', bold: true },
  danger:  { color: 'B71C1C', bold: true },
  muted:   { color: '64748B', bold: false },
};

const MOCKUPS: Record<string, MockDef> = {
  'connect': {
    title: 'Home - Connect to UAC',
    caption: 'Connect once: enter the Base URL and bearer token, then Connect. Only a session ID is kept afterwards.',
    lines: [
      { pin: 1, label: 'Base URL', value: 'https://uac.company.internal/uc', tone: 'muted' },
      { pin: 2, label: 'Bearer Token', value: '(entered once)', tone: 'muted' },
      { pin: 3, label: 'Connect', tone: 'accent' },
      { label: 'Status', value: 'Connected', tone: 'ok' },
    ],
  },
  'creation-input': {
    title: 'Job Creation - Provide Jobs',
    caption: 'Either paste a job document into Job Builder Chat or upload a spreadsheet. Pick the Task Type first.',
    lines: [
      { pin: 1, label: 'Job Builder Chat', value: 'select Task Type, paste document, Parse', tone: 'default' },
      { label: 'Sample', value: 'Job Name = PMFG-BU-AS1...  Job Workstation = A0021I10P3...  Job Script = /usr/bin/bash ...', tone: 'muted' },
      { pin: 2, label: 'Spreadsheet Upload', value: 'Drop .xlsx / .ods / .csv', tone: 'default' },
    ],
  },
  'creation-execute': {
    title: 'Job Creation - Execute & Verify',
    caption: 'Live progress per job. Triggers are created disabled; use Verify, then Enable to go live.',
    lines: [
      { label: '[ok] Agent resolved -> A0021I10P3_DD_94', tone: 'ok' },
      { label: '[ok] Task created -> PMFG-BU-AS1-MFG-I10-B2CPAYLD', tone: 'ok' },
      { label: '[!] Trigger created (DISABLED) -> ...-TR001', tone: 'warn' },
      { label: 'Actions', value: 'Verify -> Enable Trigger', tone: 'accent' },
    ],
  },
  'deletion-input': {
    title: 'Job Deletion - Enter Jobs',
    caption: 'Paste one task name per line, keep Backup enabled, then Delete. A confirmation step follows.',
    lines: [
      { pin: 1, label: 'Job names', value: 'PMFG-...-TESTJOB1 / PMFG-...-TESTJOB2', tone: 'muted' },
      { label: 'Delete 2 Jobs', tone: 'danger' },
      { pin: 2, label: 'Backup Before Delete', value: 'enabled', tone: 'accent' },
    ],
  },
  'deletion-confirm': {
    title: 'Job Deletion - Confirmation',
    caption: 'A modal lists the jobs and requires explicit confirmation to guard against accidental bulk deletes.',
    lines: [
      { label: 'Confirm Deletion', tone: 'danger' },
      { label: 'You are about to delete 2 job(s). This cannot be undone without a backup.', tone: 'muted' },
      { label: 'Buttons', value: 'Delete / Cancel', tone: 'default' },
    ],
  },
  'deletion-cards': {
    title: 'Job Deletion - Per-Job Result',
    caption: 'Each card streams live steps. WF = workflow action, TR = trigger action; final status shows DELETED/FAILED.',
    lines: [
      { label: 'SB-Unix-Test-086   [WF] [TR]   DELETED', tone: 'ok' },
      { label: '[!] Task is in 1 workflow(s): SB-Unix-Test-086-Workflow', tone: 'warn' },
      { label: '[ok] Deleted workflow trigger: ...-Workflow-TR001', tone: 'ok' },
      { label: '[ok] Workflow deleted (all tasks removed)', tone: 'ok' },
      { label: '[ok] Task deleted: SB-Unix-Test-086', tone: 'ok' },
    ],
  },
  'deletion-recovery': {
    title: 'Job Deletion - Recovery Center',
    caption: 'After a backup, recoverable jobs are listed. Click Recover, or re-upload the backup file to restore in bulk.',
    lines: [
      { label: 'Recovery Center', value: 'Upload to Restore', tone: 'accent' },
      { label: 'SB-Unix-Test-086', value: 'taskUnix   [Recover]', tone: 'muted' },
      { label: 'SB-Unix-Test-087', value: 'taskUnix   [Recover]', tone: 'muted' },
    ],
  },
};

function mockupFrame(name: string, accent: string): (Paragraph | Table)[] {
  const def = MOCKUPS[name];
  if (!def) return [];

  const titleRow = new TableRow({
    children: [new TableCell({
      shading: { type: ShadingType.CLEAR, fill: '0B1220', color: 'auto' },
      margins: { top: 80, bottom: 80, left: 140, right: 140 },
      children: [new Paragraph({ children: [
        new TextRun({ text: 'o o o   ', color: '475569', size: 16 }),
        new TextRun({ text: def.title, bold: true, color: 'CBD5E1', size: 18 }),
        new TextRun({ text: '     [ ILLUSTRATION ]', bold: true, color: hex(accent), size: 13 }),
      ] })],
    })],
  });

  const bodyParas = def.lines.map(l => {
    const tone = MOCK_TONE[l.tone || 'default'];
    const runs: TextRun[] = [];
    if (l.pin) runs.push(new TextRun({ text: `${l.pin}.  `, bold: true, color: hex(accent), size: 18 }));
    runs.push(new TextRun({ text: l.label, bold: tone.bold, color: tone.color, size: 18 }));
    if (l.value) runs.push(new TextRun({ text: `  -  ${l.value}`, color: '475569', size: 18 }));
    return new Paragraph({ spacing: { after: 50 }, children: runs });
  });

  const bodyRow = new TableRow({
    children: [new TableCell({
      shading: { type: ShadingType.CLEAR, fill: 'F8FAFC', color: 'auto' },
      margins: { top: 120, bottom: 120, left: 160, right: 160 },
      children: bodyParas,
    })],
  });

  const frame = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: hex(accent) },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: hex(accent) },
      left:   { style: BorderStyle.SINGLE, size: 4, color: hex(accent) },
      right:  { style: BorderStyle.SINGLE, size: 4, color: hex(accent) },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    },
    rows: [titleRow, bodyRow],
  });

  return [
    frame,
    new Paragraph({ spacing: { before: 40, after: 120 }, children: [new TextRun({ text: def.caption, italics: true, color: '64748B', size: 17 })] }),
  ];
}

function sectionChildren(section: SopSection, accent: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text: section.heading, bold: true, color: hex(accent), size: 26 })],
  }));

  if (section.intro) {
    out.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: section.intro, size: 21, color: '334155' })] }));
  }

  if (section.steps) {
    section.steps.forEach((step, i) => {
      out.push(new Paragraph({
        spacing: { before: 100, after: 30 },
        children: [
          new TextRun({ text: `Step ${i + 1}.  `, bold: true, color: hex(accent), size: 21 }),
          new TextRun({ text: step.title, bold: true, color: '0F172A', size: 21 }),
        ],
      }));
      out.push(new Paragraph({ spacing: { after: 40 }, indent: { left: 360 }, children: [new TextRun({ text: step.detail, size: 20, color: '334155' })] }));
      step.substeps?.forEach(ss => {
        out.push(new Paragraph({ bullet: { level: 1 }, spacing: { after: 20 }, children: [new TextRun({ text: ss, size: 20, color: '475569' })] }));
      });
    });
  }

  if (section.bullets) {
    section.bullets.forEach(b => {
      out.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 30 }, children: [new TextRun({ text: b, size: 21, color: '334155' })] }));
    });
  }

  if (section.table) {
    out.push(dataTable(section.table.columns, section.table.rows, accent));
    out.push(spacer());
  }

  if (section.callout) {
    out.push(spacer(60));
    out.push(calloutBlock(section.callout.kind, section.callout.title, section.callout.body));
    out.push(spacer());
  }

  if (section.mockups && section.mockups.length > 0) {
    out.push(new Paragraph({
      spacing: { before: 80, after: 40 },
      children: [new TextRun({ text: 'Screen reference', bold: true, color: '64748B', size: 18, allCaps: true })],
    }));
    section.mockups.forEach(m => { out.push(...mockupFrame(m, accent)); });
  }

  return out;
}

export async function generateSopDocx(sop: Sop): Promise<void> {
  const accent = sop.accent;

  const titleBlock: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 40 },
      children: [new TextRun({ text: sop.title, bold: true, color: hex(accent), size: 40 })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: sop.subtitle, italics: true, color: '64748B', size: 24 })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        metaRow('Document Code', sop.docCode, accent),
        metaRow('Version', sop.version, accent),
        metaRow('Owner', sop.owner, accent),
        metaRow('Audience', sop.audience, accent),
        metaRow('Last Updated', new Date().toISOString().slice(0, 10), accent),
      ],
    }),
    spacer(200),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 120, after: 80 },
      children: [new TextRun({ text: 'Purpose', bold: true, color: hex(accent), size: 26 })],
    }),
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: sop.purpose, size: 21, color: '334155' })] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 120, after: 80 },
      children: [new TextRun({ text: 'Prerequisites', bold: true, color: hex(accent), size: 26 })],
    }),
    ...sop.prerequisites.map(p =>
      new Paragraph({ bullet: { level: 0 }, spacing: { after: 30 }, children: [new TextRun({ text: p, size: 21, color: '334155' })] })
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  const sectionBlocks = sop.sections.flatMap(s => sectionChildren(s, accent));

  const footer = [
    spacer(240),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1', space: 8 } },
      spacing: { before: 200 },
      children: [new TextRun({ text: 'StoneBranch Automation Platform — Designed and Engineered by Abhay Thakur', italics: true, color: '94A3B8', size: 18 })],
    }),
  ];

  const doc = new Document({
    creator: 'StoneBranch Automation Platform',
    title: sop.title,
    description: sop.subtitle,
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      children: [...titleBlock, ...sectionBlocks, ...footer],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sop.docCode}_${sop.id}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
