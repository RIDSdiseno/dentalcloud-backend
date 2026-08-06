import axios from 'axios';
import PDFDocument from 'pdfkit';

type ConsentPdfInput = {
  clinica: { name: string; logoUrl: string | null };
  patient: { firstName: string; lastName: string; rut: string };
  consentType: { name: string };
  consent: {
    contentSnapshot: string | null;
    status: string;
    method: string | null;
    signerName: string | null;
    signerRut: string | null;
    signerIp: string | null;
    respondedAt: Date | null;
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

export async function buildConsentPdf({ clinica, patient, consentType, consent }: ConsentPdfInput): Promise<Buffer> {
  const logoBuffer = clinica.logoUrl ? await downloadLogo(clinica.logoUrl) : null;

  const doc = new PDFDocument({ size: 'A4', margin: 56 });
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
  doc.font('Helvetica').text(`${patient.firstName} ${patient.lastName} — RUT ${patient.rut}`);

  doc.moveDown(1);
  doc.font('Helvetica-Bold').text('Texto del consentimiento');
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).text(consent.contentSnapshot ?? '(sin texto registrado)', { align: 'justify' });

  doc.moveDown(1.5);
  doc.font('Helvetica-Bold').fontSize(10).text('Registro de la respuesta');
  doc.font('Helvetica');
  doc.text(`Estado: ${STATUS_LABELS[consent.status] ?? consent.status}`);
  if (consent.signerName) {
    doc.text(`Firmado por: ${consent.signerName}${consent.signerRut ? ` — RUT ${consent.signerRut}` : ''}`);
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
