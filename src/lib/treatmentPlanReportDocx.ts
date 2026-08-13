import axios from 'axios';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
} from 'docx';
import { TREATMENT_STATUS_LABELS_ES, formatCLP, formatReportDate, type TreatmentPlanReportInput } from './treatmentPlanReportData';

// docx (a diferencia de pdfkit) exige declarar el tipo de imagen de
// antemano — no lo detecta del buffer. Se infiere de la extensión de la URL
// (Cloudinary la conserva) y si no se reconoce se asume "jpg" (el formato más
// común de fotos subidas desde cámara/galería).
function guessImageType(url: string): 'jpg' | 'png' | 'gif' | 'bmp' {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'png';
  if (ext === 'gif') return 'gif';
  if (ext === 'bmp') return 'bmp';
  return 'jpg';
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const { data } = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 10000 });
    return Buffer.from(data);
  } catch {
    return null;
  }
}

const CELL_MARGIN = { top: 60, bottom: 60, left: 100, right: 100 };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

function labelCell(label: string) {
  return new TableCell({
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    margins: CELL_MARGIN,
    children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 16, color: '64748B' })] })],
  });
}

function valueCell(value: string, opts?: { bold?: boolean; color?: string }) {
  return new TableCell({
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    margins: CELL_MARGIN,
    children: [
      new Paragraph({
        children: [new TextRun({ text: value, bold: opts?.bold ?? false, size: 22, color: opts?.color ?? '0F172A' })],
      }),
    ],
  });
}

function sectionHeading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, bold: true, color: '1E40AF' })],
  });
}

export async function buildTreatmentPlanReportDocx({ clinica, patient, plan, items, photos }: TreatmentPlanReportInput): Promise<Buffer> {
  const downloadedPhotos = await Promise.all(
    photos.map(async (p) => ({ label: p.label, type: guessImageType(p.url), buffer: await downloadImage(p.url) }))
  );

  const tags = [plan.sucursal?.name, plan.convenio?.name, plan.prevision?.name].filter((t): t is string => Boolean(t));
  const itemsWithNotes = items.filter((i) => i.notes?.trim());

  const itemsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: ['Prestación', 'Zona/pieza', 'Fecha', 'Realizado por', 'Costo'].map(
          (label) =>
            new TableCell({
              shading: { fill: 'EFF6FF' },
              margins: CELL_MARGIN,
              children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 16, color: '334155' })] })],
            })
        ),
      }),
      ...items.map(
        (item) =>
          new TableRow({
            children: [
              new TableCell({ margins: CELL_MARGIN, children: [new Paragraph(item.description)] }),
              new TableCell({ margins: CELL_MARGIN, children: [new Paragraph(item.toothNumber ?? '—')] }),
              new TableCell({
                margins: CELL_MARGIN,
                children: [new Paragraph(item.treatedAt ? formatReportDate(item.treatedAt) : '—')],
              }),
              new TableCell({ margins: CELL_MARGIN, children: [new Paragraph(item.treatedBy?.name ?? '—')] }),
              new TableCell({
                margins: CELL_MARGIN,
                children: [new Paragraph({ alignment: AlignmentType.RIGHT, text: formatCLP(item.cost) })],
              }),
            ],
          })
      ),
      new TableRow({
        children: [
          new TableCell({ margins: CELL_MARGIN, children: [new Paragraph('')] }),
          new TableCell({ margins: CELL_MARGIN, children: [new Paragraph('')] }),
          new TableCell({ margins: CELL_MARGIN, children: [new Paragraph('')] }),
          new TableCell({
            shading: { fill: 'DBEAFE' },
            margins: CELL_MARGIN,
            children: [new Paragraph({ children: [new TextRun({ text: 'Total', bold: true, color: '1E40AF' })] })],
          }),
          new TableCell({
            shading: { fill: 'DBEAFE' },
            margins: CELL_MARGIN,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: formatCLP(plan.amount), bold: true, color: '1E40AF' })],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [labelCell('PACIENTE'), labelCell('RUT'), labelCell('GENERADO EL')] }),
      new TableRow({
        children: [
          valueCell(`${patient.firstName} ${patient.lastName}`, { bold: true }),
          valueCell(patient.rut),
          valueCell(formatReportDate(new Date())),
        ],
      }),
      new TableRow({
        children: [labelCell('PRESUPUESTO'), labelCell('PROFESIONAL'), labelCell('ESTADO')],
      }),
      new TableRow({
        children: [
          valueCell(`N° ${plan.number}${plan.name ? ` · ${plan.name}` : ''}`),
          valueCell(plan.professional?.name ?? 'Sin diagnosticador'),
          valueCell(TREATMENT_STATUS_LABELS_ES[plan.status] ?? plan.status, { bold: true, color: '1E40AF' }),
        ],
      }),
    ],
  });

  const photosWithBuffer = downloadedPhotos.filter(
    (p): p is { label: string | null; type: 'jpg' | 'png' | 'gif' | 'bmp'; buffer: Buffer } => p.buffer !== null
  );

  const photoParagraphs: Paragraph[] = [];
  const PHOTO_SIZE = 180;
  for (let i = 0; i < photosWithBuffer.length; i += 3) {
    const rowPhotos = photosWithBuffer.slice(i, i + 3);
    const runs = rowPhotos.flatMap((photo, idx) => {
      try {
        const image = new ImageRun({
          type: photo.type,
          data: photo.buffer,
          transformation: { width: PHOTO_SIZE, height: PHOTO_SIZE },
        });
        return idx < rowPhotos.length - 1 ? [image, new TextRun({ text: '   ' })] : [image];
      } catch {
        // Buffer no soportado por docx — se omite esa foto puntual.
        return [];
      }
    });
    if (runs.length > 0) {
      photoParagraphs.push(new Paragraph({ children: runs, spacing: { after: 100 } }));
      photoParagraphs.push(
        new Paragraph({
          children: rowPhotos.map((p) => new TextRun({ text: `${p.label ?? ''}    `, size: 14, color: '64748B' })),
          spacing: { after: 200 },
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: clinica.name, bold: true, size: 32 })] }),
          new Paragraph({
            children: [new TextRun({ text: 'INFORME DE TRATAMIENTO', bold: true, size: 20, color: '2563EB' })],
            spacing: { after: 200 },
          }),
          infoTable,
          ...(tags.length > 0
            ? [new Paragraph({ children: [new TextRun({ text: tags.join('  ·  '), color: '64748B' })], spacing: { before: 150 } })]
            : []),
          sectionHeading('Prestaciones realizadas'),
          itemsTable,
          ...(itemsWithNotes.length > 0
            ? [
                sectionHeading('Notas clínicas por prestación'),
                ...itemsWithNotes.flatMap((item) => [
                  new Paragraph({ children: [new TextRun({ text: item.description, bold: true })] }),
                  new Paragraph({ text: item.notes ?? '', spacing: { after: 150 } }),
                ]),
              ]
            : []),
          ...(plan.notes?.trim()
            ? [sectionHeading('Notas del presupuesto'), new Paragraph({ text: plan.notes, spacing: { after: 150 } })]
            : []),
          ...(photoParagraphs.length > 0 ? [sectionHeading('Fotografías'), ...photoParagraphs] : []),
          new Paragraph({
            spacing: { before: 400 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Documento generado automáticamente por fordentcloud a partir de los datos registrados en el sistema.',
                size: 14,
                color: '64748B',
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
