import axios from 'axios';
import PDFDocument from 'pdfkit';

type ExamRequestPdfInput = {
  clinica: { name: string; logoUrl: string | null };
  patient: { firstName: string; lastName: string; rut: string; birthDate: Date | null };
  professional: { name: string } | null;
  exams: string;
  notes: string | null;
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

// Etapa 04 (reunión 2/9 con Urbina): "si tú apretáis solicitud de exámenes,
// se te abriera algún tipo de receta de manera que salga qué exámenes
// necesitáis y lo imprima rápido" — formato simple, pensado para imprimir de
// inmediato en la misma consulta, no un informe clínico extenso.
export async function buildExamRequestPdf({
  clinica,
  patient,
  professional,
  exams,
  notes,
  createdAt,
}: ExamRequestPdfInput): Promise<Buffer> {
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
  doc.fontSize(13).font('Helvetica-Bold').text('Solicitud de exámenes previos', { width: 320 });
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
    doc.font('Helvetica-Bold').text('Solicitado por');
    doc.font('Helvetica').text(professional.name);
  }

  doc.moveDown(1.5);
  doc.font('Helvetica-Bold').fontSize(11).text('Exámenes solicitados');
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).text(exams, { align: 'left' });

  if (notes?.trim()) {
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(10).text('Observaciones');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).text(notes, { align: 'justify' });
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
