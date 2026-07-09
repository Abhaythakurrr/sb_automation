/**
 * Generate DOCX document from About Tool content
 * Similar to sopDocx.ts but for technical documentation
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
} from 'docx';
import { saveAs } from 'file-saver';
import type { AboutToolDoc, AboutSection } from '@/data/aboutToolContent';

const COLORS = {
  primary: '06b6d4',      // cyan
  heading: '0f172a',      // slate-900
  body: '475569',         // slate-600
  accent: '22d3ee',       // cyan-400
  border: 'cbd5e1',       // slate-300
};

function createTitle(doc: AboutToolDoc): Paragraph[] {
  return [
    new Paragraph({
      text: doc.title.toUpperCase(),
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: doc.title.toUpperCase(),
          bold: true,
          size: 32,
          color: COLORS.primary,
        }),
      ],
    }),
    new Paragraph({
      text: doc.subtitle,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: doc.subtitle,
          size: 20,
          color: COLORS.body,
        }),
      ],
    }),
    new Paragraph({
      text: `Version ${doc.version} • Last Updated: ${doc.lastUpdated}`,
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({
          text: `Version ${doc.version} • Last Updated: ${doc.lastUpdated}`,
          size: 18,
          color: COLORS.body,
          italics: true,
        }),
      ],
    }),
  ];
}

function createSectionHeading(heading: string): Paragraph {
  return new Paragraph({
    text: heading,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [
      new TextRun({
        text: heading,
        bold: true,
        size: 28,
        color: COLORS.heading,
      }),
    ],
  });
}

function createSubHeading(title: string): Paragraph {
  return new Paragraph({
    text: title,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [
      new TextRun({
        text: title,
        bold: true,
        size: 24,
        color: COLORS.primary,
      }),
    ],
  });
}

function createBodyText(text: string): Paragraph {
  return new Paragraph({
    text,
    spacing: { after: 150 },
    children: [
      new TextRun({
        text,
        size: 20,
        color: COLORS.body,
      }),
    ],
  });
}

function createBulletPoint(text: string, indent = 0): Paragraph {
  return new Paragraph({
    text,
    bullet: { level: indent },
    spacing: { after: 100 },
    children: [
      new TextRun({
        text,
        size: 20,
        color: COLORS.body,
      }),
    ],
  });
}

function createTable(table: NonNullable<AboutSection['table']>): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: table.columns.map(
      (col) =>
        new TableCell({
          children: [
            new Paragraph({
              text: col,
              children: [
                new TextRun({
                  text: col,
                  bold: true,
                  size: 20,
                  color: COLORS.heading,
                }),
              ],
            }),
          ],
          shading: { fill: 'f1f5f9' }, // slate-100
          margins: {
            top: convertInchesToTwip(0.08),
            bottom: convertInchesToTwip(0.08),
            left: convertInchesToTwip(0.1),
            right: convertInchesToTwip(0.1),
          },
        })
    ),
  });

  const dataRows = table.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [
                new Paragraph({
                  text: cell,
                  children: [
                    new TextRun({
                      text: cell,
                      size: 18,
                      color: COLORS.body,
                    }),
                  ],
                }),
              ],
              margins: {
                top: convertInchesToTwip(0.08),
                bottom: convertInchesToTwip(0.08),
                left: convertInchesToTwip(0.1),
                right: convertInchesToTwip(0.1),
              },
            })
        ),
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
      left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
      right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
    },
  });
}

function createCodeBlock(example: NonNullable<AboutSection['codeExample']>): Paragraph[] {
  return [
    createBodyText(example.description),
    new Paragraph({
      text: example.code,
      shading: { fill: '1e293b' }, // slate-800
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: example.code,
          font: 'Courier New',
          size: 18,
          color: 'e2e8f0', // slate-200
        }),
      ],
    }),
  ];
}

function createDiagramPlaceholder(diagram: NonNullable<AboutSection['diagram']>): Paragraph[] {
  return [
    createBodyText(diagram.description),
    new Paragraph({
      text: '📊 Diagram: See web version for interactive flowchart',
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: '📊 Diagram: See web version for interactive flowchart',
          italics: true,
          size: 18,
          color: COLORS.accent,
        }),
      ],
    }),
    ...(diagram.nodes
      ? [
          createBodyText('Diagram Components:'),
          ...diagram.nodes.map((node) => createBulletPoint(`${node.id}: ${node.label}`, 0)),
        ]
      : []),
  ];
}

function createSection(section: AboutSection): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  // Section heading
  elements.push(createSectionHeading(section.heading));

  // Intro text
  if (section.intro) {
    elements.push(createBodyText(section.intro));
  }

  // Content (plain text array)
  if (section.content) {
    section.content.forEach((line) => {
      if (line.startsWith('**') && line.endsWith('**')) {
        // Bold line (subheading)
        elements.push(createSubHeading(line.replace(/\*\*/g, '')));
      } else if (line.trim() === '') {
        // Empty line (spacing)
        elements.push(new Paragraph({ spacing: { after: 100 } }));
      } else {
        elements.push(createBodyText(line));
      }
    });
  }

  // Subsections
  if (section.subsections) {
    section.subsections.forEach((sub) => {
      elements.push(createSubHeading(sub.title));
      sub.points.forEach((point) => {
        elements.push(createBulletPoint(point));
      });
    });
  }

  // Diagram
  if (section.diagram) {
    elements.push(...createDiagramPlaceholder(section.diagram));
  }

  // Table (add directly to elements, not as placeholder)
  if (section.table) {
    elements.push(new Paragraph({ spacing: { before: 200 } }));
    elements.push(createTable(section.table));
    elements.push(new Paragraph({ spacing: { after: 300 } }));
  }

  // Code example
  if (section.codeExample) {
    elements.push(...createCodeBlock(section.codeExample));
  }

  return elements;
}

export async function generateAboutToolDocx(doc: AboutToolDoc): Promise<void> {
  const children: (Paragraph | Table)[] = [];

  // Title page
  children.push(...createTitle(doc));

  // Sections (tables are now included in createSection)
  doc.sections.forEach((section) => {
    children.push(...createSection(section));
  });

  // Create document
  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(0.75),
            },
          },
        },
        children,
      },
    ],
  });

  // Generate and download
  const blob = await Packer.toBlob(document);
  const fileName = `StoneBranch_Technical_Documentation_v${doc.version}.docx`;
  saveAs(blob, fileName);
}
