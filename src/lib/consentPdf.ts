import axios from 'axios';
import PDFDocument from 'pdfkit';
import { drawTimbreWatermark, documentLabel, formatDocument } from './pdfClinicHeader';

type ConsentPdfInput = {
  clinica: { name: string; logoUrl: string | null; timbreUrl?: string | null };
  patient: { firstName: string; lastName: string; rut: string; documentType?: string | null };
  consentType: { name: string };
  // Doctor al que corresponde el consentimiento. Null en los de la clínica
  // (protección de datos, imágenes, grabación) y en los firmados antes de la
  // tarea 16.
  professional?: { name: string; rut: string | null; documentType?: string | null } | null;
  consent: {
    contentSnapshot: string | null;
    status: string;
    method: string | null;
    signerName: string | null;
    signerRut: string | null;
    signerDocumentType?: string | null;
    signerIp: string | null;
    respondedAt: Date | null;
    signatureUrl?: string | null;
    professionalSignatureUrl?: string | null;
  };
};

const STATUS_LABELS: Record<string, string> = {
  firmado: 'Aceptado',
  rechazado: 'Rechazado',
  pendiente: 'Pendiente',
  expirado: 'Expirado',
};

const METHOD_LABELS: Record<string, string> = {
  email: 'Remoto (enlace enviado por correo)',
  presencial: 'Presencial',
};

async function downloadLogo(logoUrl: string): Promise<Buffer | null> {
  try {
    const { data } = await axios.get<ArrayBuffer>(logoUrl, { responseType: 'arraybuffer', timeout: 8000 });
    return Buffer.from(data);
  } catch {
    // El PDF se genera igual sin logo si la descarga falla (URL caída, formato no soportado, etc).
    return null;
  }
}

export async function buildConsentPdf({
  clinica,
  patient,
  consentType,
  professional,
  consent,
}: ConsentPdfInput): Promise<Buffer> {
  const logoBuffer = clinica.logoUrl ? await downloadLogo(clinica.logoUrl) : null;
  const signatureBuffer = consent.signatureUrl ? await downloadLogo(consent.signatureUrl) : null;
  const professionalSignatureBuffer = consent.professionalSignatureUrl
    ? await downloadLogo(consent.professionalSignatureUrl)
    : null;

  const timbreBuffer = clinica.timbreUrl ? await downloadLogo(clinica.timbreUrl) : null;

  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  doc.on('pageAdded', () => drawTimbreWatermark(doc, timbreBuffer));
  drawTimbreWatermark(doc, timbreBuffer);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, doc.page.width - doc.page.margins.right - 80, 40, { fit: [80, 80] });
    } catch {
      // Formato de imagen no soportado por pdfkit (ej. algunos SVG) — se omite el logo.
    }
  }

  doc.fontSize(16).font('Helvetica-Bold').text(clinica.name, { width: 320 });
  doc.moveDown(0.4);
  doc.fontSize(13).font('Helvetica-Bold').text('Consentimiento informado', { width: 320 });
  doc.fontSize(11).font('Helvetica').fillColor('#334155').text(consentType.name, { width: 320 });
  doc.fillColor('#000000');

  doc.moveDown(1.5);
  doc.fontSize(10).font('Helvetica-Bold').text('Paciente');
  doc.font('Helvetica').text(
    `${patient.firstName} ${patient.lastName} — ${documentLabel(patient.documentType)} ${formatDocument(
      patient.rut,
      patient.documentType
    )}`
  );

  // El doctor que atendió: es lo que convierte esto en un consentimiento
  // clínico y no en un papel genérico de la clínica (reunión 30/09).
  if (professional) {
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').text('Profesional tratante');
    doc.font('Helvetica').text(
      professional.rut
        ? `${professional.name} — ${documentLabel(professional.documentType)} ${formatDocument(
            professional.rut,
            professional.documentType
          )}`
        : professional.name
    );
  }

  doc.moveDown(1);
  doc.font('Helvetica-Bold').text('Texto del consentimiento');
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).text(consent.contentSnapshot ?? '(sin texto registrado)', { align: 'justify' });

  doc.moveDown(1.5);
  doc.font('Helvetica-Bold').fontSize(10).text('Registro de la respuesta');
  doc.font('Helvetica');
  doc.text(`Estado: ${STATUS_LABELS[consent.status] ?? consent.status}`);
  if (consent.signerName) {
    const documento = consent.signerRut
      ? ` — ${documentLabel(consent.signerDocumentType)} ${formatDocument(consent.signerRut, consent.signerDocumentType)}`
      : '';
    doc.text(`Firmado por: ${consent.signerName}${documento}`);
  }
  if (consent.respondedAt) {
    doc.text(`Fecha: ${consent.respondedAt.toLocaleString('es-CL')}`);
  }
  if (consent.method) {
    doc.text(`Método: ${METHOD_LABELS[consent.method] ?? consent.method}`);
  }
  if (consent.signerIp) {
    doc.text(`IP de origen: ${consent.signerIp}`);
  }

  // Firma del paciente y, cuando el consentimiento es por doctor, también la
  // del profesional: las dos juntas son lo que le da peso al documento.
  if (signatureBuffer || professionalSignatureBuffer) {
    doc.moveDown(0.8);
    const left = doc.page.margins.left;
    const columnWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right - 24) / 2;
    const right = left + columnWidth + 24;
    const top = doc.y;

    const drawSignature = (buffer: Buffer | null, x: number, titulo: string, pie: string) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000').text(titulo, x, top, { width: columnWidth });
      if (buffer) {
        try {
          doc.image(buffer, x, top + 14, { fit: [columnWidth, 70] });
        } catch {
          // Formato no soportado por pdfkit — el resto del PDF sigue igual.
        }
      }
      doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(pie, x, top + 90, { width: columnWidth });
      doc.fillColor('#000000');
    };

    drawSignature(signatureBuffer, left, 'Firma del paciente', consent.signerName ?? '');
    if (professional) {
      // Si el doctor no tenía firma guardada, el documento lo dice en vez de
      // dejar un hueco mudo: quien lo lea sabe que falta y por qué.
      drawSignature(
        professionalSignatureBuffer,
        right,
        'Firma del profesional',
        professionalSignatureBuffer ? professional.name : `${professional.name} (firma no registrada)`
      );
    }
    doc.y = top + 110;
  }

  doc.moveDown(2);
  doc
    .fontSize(8)
    .fillColor('#64748b')
    .text(
      'Documento generado automáticamente por fordentcloud como respaldo del consentimiento registrado en el sistema.',
      { align: 'center' }
    );

  doc.end();
  return finished;
}
