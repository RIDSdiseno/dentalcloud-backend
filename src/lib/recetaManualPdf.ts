import axios from 'axios';
import PDFDocument from 'pdfkit';

type Medicamento = { medicamento: string; indicaciones: string };

type RecetaManualPdfInput = {
  clinica: { name: string; logoUrl: string | null };
  patient: { firstName: string; lastName: string; rut: string; birthDate: Date | null };
  professional: { name: string } | null;
  medicamentos: Medicamento[];
  observaciones: string | null;
  createdAt: Date;
};

function formatAge(birthDate: Date | null): string {
  if (!birthDate) return '';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthday =
    today.getMonth() > birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hasHadBirthday) age -= 1;
  return ` (${age} años)`;
}

async function downloadLogo(logoUrl: string): Promise<Buffer | null> {
  try {
    const { data } = await axios.get<ArrayBuffer>(logoUrl, { responseType: 'arraybuffer', timeout: 8000 });
    return Buffer.from(data);
  } catch {
    return null;
  }
}

// Feedback de un usuario real (29/09): la pestaña "Recetas Médicas" de
// Documentos clínicos solo permite SUBIR un archivo ya existente — no hay
// forma de redactar una receta desde cero. Este PDF resuelve eso siguiendo
// el mismo patrón que `buildExamRequestPdf`: se genera el archivo acá y
// queda guardado como un ClinicalDocument más (categoría "receta"), sin
// tocar el flujo de subida manual que ya existía.
export async function buildRecetaManualPdf({
  clinica,
  patient,
  professional,
  medicamentos,
  observaciones,
  createdAt,
}: RecetaManualPdfInput): Promise<Buffer> {
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
      // Formato de imagen no soportado por pdfkit — se omite el logo.
    }
  }

  doc.fontSize(16).font('Helvetica-Bold').text(clinica.name, { width: 320 });
  doc.moveDown(0.4);
  doc.fontSize(13).font('Helvetica-Bold').text('Receta médica', { width: 320 });
  doc.fillColor('#000000');

  doc.moveDown(1.5);
  doc.fontSize(10).font('Helvetica-Bold').text('Paciente');
  doc
    .font('Helvetica')
    .text(`${patient.firstName} ${patient.lastName}${formatAge(patient.birthDate)} — RUT ${patient.rut}`);

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').text('Fecha');
  doc.font('Helvetica').text(createdAt.toLocaleDateString('es-CL', { dateStyle: 'long' }));

  if (professional) {
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').text('Prescrito por');
    doc.font('Helvetica').text(professional.name);
  }

  doc.moveDown(1.5);
  doc.font('Helvetica-Bold').fontSize(11).text('Medicamentos');
  doc.moveDown(0.4);
  medicamentos.forEach((item, index) => {
    doc.font('Helvetica-Bold').fontSize(10).text(`${index + 1}. ${item.medicamento}`);
    if (item.indicaciones.trim()) {
      doc.font('Helvetica').fontSize(10).text(item.indicaciones, { indent: 14 });
    }
    doc.moveDown(0.5);
  });

  if (observaciones?.trim()) {
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(10).text('Observaciones');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).text(observaciones, { align: 'justify' });
  }

  doc.moveDown(3);
  doc.font('Helvetica').fontSize(10).text('_______________________________');
  doc.text('Firma y timbre profesional');

  doc.moveDown(2);
  doc
    .fontSize(8)
    .fillColor('#64748b')
    .text('Documento generado automáticamente por fordentcloud.', { align: 'center' });

  doc.end();
  return finished;
}
