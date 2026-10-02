import PDFDocument from 'pdfkit';
import {
  drawClinicHeader,
  drawLegalFooter,
  downloadPdfImage,
  documentLabel,
  formatDocument,
  type ClinicaPdfInfo,
} from './pdfClinicHeader';

type Medicamento = { medicamento: string; indicaciones: string };

type RecetaManualPdfInput = {
  clinica: ClinicaPdfInfo;
  patient: {
    firstName: string;
    lastName: string;
    rut: string;
    documentType?: string | null;
    birthDate: Date | null;
    address: string | null;
  };
  professional: {
    name: string;
    rut: string | null;
    // Una doctora española lleva DNI, no RUT: rotularlo mal en una receta
    // tampoco es un detalle (mismo criterio que la cabecera de la clínica).
    documentType?: string | null;
    signatureUrl: string | null;
  } | null;
  medicamentos: Medicamento[];
  observaciones: string | null;
  createdAt: Date;
};

const INK = '#0f172a';
const MUTED = '#64748b';

function professionalLine(professional: { name: string; rut: string | null; documentType?: string | null }): string {
  if (!professional.rut) return professional.name;
  return `${professional.name} — ${documentLabel(professional.documentType)} ${formatDocument(professional.rut, professional.documentType)}`;
}

function formatAge(birthDate: Date | null): string {
  if (!birthDate) return '';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthday =
    today.getMonth() > birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hasHadBirthday) age -= 1;
  return `${age} años`;
}

function labelValue(doc: PDFKit.PDFDocument, label: string, value: string, width: number) {
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), { width, characterSpacing: 0.4 });
  doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(value, { width });
  doc.moveDown(0.5);
}

// Feedback de un usuario real (29/09): la primera versión de este PDF se
// veía "pelada" — solo nombre y RUT del paciente, sin dirección ni el
// resto de los datos que trae una receta real, y el encabezado no mostraba
// el logo/datos de la clínica salvo que ya estuvieran perfectos. Rediseñado
// tomando como referencia el formato estándar de receta médica en Chile
// (paciente identificado con nombre, RUT y edad; medicamento con
// indicaciones claras; firma y timbre del profesional) — sin inventar
// campos que la app no tiene (no hay diagnóstico ni N° de ficha, por
// ejemplo, así que no se muestran).
export async function buildRecetaManualPdf({
  clinica,
  patient,
  professional,
  medicamentos,
  observaciones,
  createdAt,
}: RecetaManualPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  await drawClinicHeader(doc, clinica, 'Receta médica');

  const signatureBuffer = professional?.signatureUrl ? await downloadPdfImage(professional.signatureUrl) : null;

  const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right - 24) / 2;
  const colX = [doc.page.margins.left, doc.page.margins.left + colWidth + 24];
  const rowTop = doc.y;

  function fieldAt(col: 0 | 1, y: number, label: string, value: string): number {
    doc.x = colX[col];
    doc.y = y;
    labelValue(doc, label, value, colWidth);
    return doc.y;
  }

  const patientName = `${patient.firstName} ${patient.lastName}`.trim();
  const ageSuffix = formatAge(patient.birthDate);
  let leftY = fieldAt(0, rowTop, 'Paciente', ageSuffix ? `${patientName} (${ageSuffix})` : patientName);
  leftY = fieldAt(
    0,
    leftY,
    `${documentLabel(patient.documentType)} paciente`,
    formatDocument(patient.rut, patient.documentType)
  );
  if (patient.address) leftY = fieldAt(0, leftY, 'Dirección', patient.address);

  let rightY = fieldAt(1, rowTop, 'Fecha', createdAt.toLocaleDateString('es-CL', { dateStyle: 'long' }));
  if (professional) {
    rightY = fieldAt(1, rightY, 'Prescrito por', professionalLine(professional));
  }

  doc.x = doc.page.margins.left;
  doc.y = Math.max(leftY, rightY, rowTop + 60) + 8;

  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .lineWidth(1)
    .strokeColor('#e2e8f0')
    .stroke();
  doc.moveDown(1.2);

  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('Medicamentos', { characterSpacing: 0.3 });
  doc.moveDown(0.6);
  medicamentos.forEach((item, index) => {
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(`${index + 1}.  ${item.medicamento}`);
    if (item.indicaciones.trim()) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(item.indicaciones, { indent: 18 });
    }
    doc.moveDown(0.7);
  });

  if (observaciones?.trim()) {
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Observaciones');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(observaciones, { align: 'justify' });
  }

  const signatureBlockHeight = 138;
  if (doc.y > doc.page.height - doc.page.margins.bottom - signatureBlockHeight) {
    doc.addPage();
  }
  doc.y = doc.page.height - doc.page.margins.bottom - signatureBlockHeight;

  if (signatureBuffer) {
    try {
      doc.image(signatureBuffer, doc.page.margins.left, doc.y, { fit: [180, 60] });
    } catch {
      // Formato de imagen no soportado por pdfkit — se omite y queda solo la línea.
    }
  }
  doc.y += 64;
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.margins.left + 220, doc.y)
    .lineWidth(1)
    .strokeColor('#94a3b8')
    .stroke();
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text('Firma y timbre profesional', doc.page.margins.left);
  if (professional) {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(professional.name, doc.page.margins.left);
  }

  doc.moveDown(0.8);
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor('#94a3b8')
    .text('Documento generado automáticamente por fordentcloud.', doc.page.margins.left, doc.y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: 'center',
      lineBreak: false,
    });

  drawLegalFooter(doc, clinica);

  doc.end();
  return finished;
}
