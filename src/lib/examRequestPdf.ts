import PDFDocument from 'pdfkit';
import {
  drawClinicHeader,
  drawLegalFooter,
  drawTimbreWatermark,
  downloadPdfImage,
  documentLabel,
  formatDocument,
  type ClinicaPdfInfo,
} from './pdfClinicHeader';
import { formatRut } from '../utils/rut';

type ExamRequestPdfInput = {
  clinica: ClinicaPdfInfo;
  patient: {
    firstName: string;
    lastName: string;
    rut: string;
    documentType?: string | null;
    birthDate: Date | null;
  };
  professional: { name: string } | null;
  exams: string;
  notes: string | null;
  createdAt: Date;
};

const INK = '#0f172a';
const MUTED = '#64748b';

function formatAge(birthDate: Date | null): string {
  if (!birthDate) return '';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthday =
    today.getMonth() > birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hasHadBirthday) age -= 1;
  return ` (${age} años)`;
}

// Etapa 04 (reunión 2/9 con Urbina): "si tú apretáis solicitud de exámenes,
// se te abriera algún tipo de receta de manera que salga qué exámenes
// necesitáis y lo imprima rápido" — formato simple, pensado para imprimir de
// inmediato en la misma consulta, no un informe clínico extenso.
// Encabezado actualizado (29/09) al mismo `drawClinicHeader` que usa la
// receta manual, para que ambos PDFs se vean consistentes y siempre
// muestren el logo/datos reales de la clínica que los emite.
export async function buildExamRequestPdf({
  clinica,
  patient,
  professional,
  exams,
  notes,
  createdAt,
}: ExamRequestPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  drawTimbreWatermark(doc, clinica.timbreUrl ? await downloadPdfImage(clinica.timbreUrl) : null);
  await drawClinicHeader(doc, clinica, 'Solicitud de exámenes previos');

  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('PACIENTE', { characterSpacing: 0.4 });
  doc
    .font('Helvetica')
    .fontSize(10.5)
    .fillColor(INK)
    .text(
      `${patient.firstName} ${patient.lastName}${formatAge(patient.birthDate)} — ` +
        `${documentLabel(patient.documentType)} ${formatDocument(patient.rut, patient.documentType)}`
    );
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('FECHA', { characterSpacing: 0.4 });
  doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(createdAt.toLocaleDateString('es-CL', { dateStyle: 'long' }));
  doc.moveDown(0.5);

  if (professional) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('SOLICITADO POR', { characterSpacing: 0.4 });
    doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(professional.name);
    doc.moveDown(0.5);
  }

  doc.moveDown(0.6);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .lineWidth(1)
    .strokeColor('#e2e8f0')
    .stroke();
  doc.moveDown(1.2);

  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('Exámenes solicitados');
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(exams, { align: 'left' });

  if (notes?.trim()) {
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Observaciones');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(notes, { align: 'justify' });
  }

  doc.moveDown(3);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('_______________________________');
  doc.text('Firma y timbre profesional');

  doc.moveDown(2);
  doc
    .fontSize(7.5)
    .fillColor('#94a3b8')
    .text('Documento generado automáticamente por fordentcloud.', { align: 'center' });

  drawLegalFooter(doc, clinica);

  doc.end();
  return finished;
}
