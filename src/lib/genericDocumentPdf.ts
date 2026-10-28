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

// Generador de documentos clínicos simples de TEXTO LIBRE (certificados,
// indicaciones, constancias). Reusa el mismo encabezado/pie/timbre que la
// receta y la solicitud de exámenes, para que todos los PDF se vean
// consistentes. Es el equivalente a examRequestPdf pero con título y cuerpo
// libres en vez de una lista de exámenes.

type GenericDocumentPdfInput = {
  clinica: ClinicaPdfInfo;
  patient: {
    firstName: string;
    lastName: string;
    rut: string;
    documentType?: string | null;
    birthDate: Date | null;
  };
  professional: { name: string } | null;
  titulo: string;
  cuerpo: string;
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

export async function buildGenericDocumentPdf({
  clinica,
  patient,
  professional,
  titulo,
  cuerpo,
  createdAt,
}: GenericDocumentPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  drawTimbreWatermark(doc, clinica.timbreUrl ? await downloadPdfImage(clinica.timbreUrl) : null);
  await drawClinicHeader(doc, clinica, titulo);

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
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('EMITIDO POR', { characterSpacing: 0.4 });
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

  doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(cuerpo, { align: 'justify', lineGap: 2 });

  doc.moveDown(3);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('_______________________________');
  doc.text('Firma y timbre profesional');

  doc.moveDown(2);
  doc.fontSize(7.5).fillColor('#94a3b8').text('Documento generado automáticamente por fordentcloud.', { align: 'center' });

  drawLegalFooter(doc, clinica);

  doc.end();
  return finished;
}
