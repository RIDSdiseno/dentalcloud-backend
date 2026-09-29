import axios from 'axios';
import { formatRut } from '../utils/rut';

export type ClinicaPdfInfo = {
  name: string;
  logoUrl: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  rut?: string | null;
};

const INK = '#0f172a';
const MUTED = '#64748b';
const RULE = '#e2e8f0';
const ACCENT = '#0891b2'; // mismo celeste de marca que usa el resto de fordentcloud

export async function downloadPdfImage(url: string): Promise<Buffer | null> {
  try {
    const { data } = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 8000 });
    return Buffer.from(data);
  } catch {
    return null;
  }
}

// Feedback de un usuario real (29/09): la receta se veía "pelada" — sin
// logo ni datos de la clínica — porque esta clínica de prueba nunca
// configuró un logo en Configuración > Compañía. En vez de dejar un
// espacio en blanco cuando eso pasa, se dibuja el mismo tipo de "avatar
// con inicial" que ya se ve en toda la interfaz (pacientes, usuarios sin
// foto) — no es un logo inventado, es el mismo recurso visual que ya usa
// la app cuando no hay foto.
function drawMonogram(doc: PDFKit.PDFDocument, x: number, y: number, size: number, name: string) {
  const letter = (name.trim()[0] || '?').toUpperCase();
  doc.roundedRect(x, y, size, size, size * 0.22).fill(ACCENT);
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(size * 0.42)
    .text(letter, x, y + size * 0.27, { width: size, align: 'center' });
  doc.fillColor(INK);
}

// Encabezado compartido por los PDFs "rápidos" que arma el sistema (receta
// manual, solicitud de exámenes): logo (o iniciales si la clínica no tiene
// uno) + nombre + dirección/teléfono/email/RUT si están cargados, más el
// título del documento. Antes cada PDF dibujaba su propio encabezado por
// separado y solo mostraba nombre+logo, sin el resto de los datos de la
// clínica que Configuración > Compañía ya permite cargar.
export async function drawClinicHeader(
  doc: PDFKit.PDFDocument,
  clinica: ClinicaPdfInfo,
  documentTitle: string
): Promise<void> {
  const logoSize = 54;
  const logoX = doc.page.width - doc.page.margins.right - logoSize;
  const logoY = doc.page.margins.top;
  const textWidth = logoX - doc.page.margins.left - 16;

  const logoBuffer = clinica.logoUrl ? await downloadPdfImage(clinica.logoUrl) : null;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, logoX, logoY, { fit: [logoSize, logoSize] });
    } catch {
      drawMonogram(doc, logoX, logoY, logoSize, clinica.name);
    }
  } else {
    drawMonogram(doc, logoX, logoY, logoSize, clinica.name);
  }

  doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(clinica.name, doc.page.margins.left, logoY, { width: textWidth, lineBreak: false });

  let lineY = logoY + 20;
  const contactLine = [clinica.address, clinica.phone, clinica.email].filter(Boolean).join('   ·   ');
  if (contactLine) {
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(contactLine, doc.page.margins.left, lineY, { width: textWidth, lineBreak: false });
    lineY += 13;
  }
  if (clinica.rut) {
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(`RUT ${formatRut(clinica.rut)}`, doc.page.margins.left, lineY, { width: textWidth, lineBreak: false });
    lineY += 13;
  }

  const headerBottom = Math.max(lineY, logoY + logoSize) + 12;
  doc
    .moveTo(doc.page.margins.left, headerBottom)
    .lineTo(doc.page.width - doc.page.margins.right, headerBottom)
    .lineWidth(1)
    .strokeColor(RULE)
    .stroke();

  doc.y = headerBottom + 16;
  doc
    .font('Helvetica-Bold')
    .fontSize(12.5)
    .fillColor(INK)
    .text(documentTitle.toUpperCase(), doc.page.margins.left, doc.y, { characterSpacing: 0.6 });
  doc.moveDown(1);
  doc.fillColor(INK);
}
