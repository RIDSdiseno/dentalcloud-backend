import axios from 'axios';
import PDFDocument from 'pdfkit';
import { TREATMENT_STATUS_LABELS_ES, formatCLP, formatReportDate, type TreatmentPlanReportInput } from './treatmentPlanReportData';

export type { TreatmentPlanReportInput };

// Paleta de colores mejorada
const COLORS = {
  primary: '#0A5C8A',        // Azul oscuro corporativo
  primaryLight: '#4A90D9',   // Azul medio
  primaryLighter: '#E8F0FE', // Azul muy claro
  secondary: '#2C3E50',      // Gris oscuro
  accent: '#E74C3C',         // Rojo para totales
  success: '#27AE60',        // Verde para completado
  text: '#1A1A2E',          // Texto principal
  textLight: '#4A4A5A',     // Texto secundario
  textMuted: '#7F8C8D',     // Texto terciario
  border: '#D5D8DC',        // Bordes
  background: '#F8F9FA',    // Fondo general
  cardBg: '#FFFFFF',        // Fondo tarjetas
  headerBg: '#0A5C8A',      // Fondo encabezado tabla
  zebraLight: '#F7F9FC',    // Fila zebra clara
  zebraDark: '#ECF0F1',     // Fila zebra oscura
  totalBg: '#E8F0FE',       // Fondo totales
};

const FONTS = {
  heading: 'Helvetica-Bold',
  subheading: 'Helvetica-BoldOblique',
  body: 'Helvetica',
  bodyBold: 'Helvetica-Bold',
  small: 'Helvetica-Oblique',
};

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const { data } = await axios.get<ArrayBuffer>(url, { 
      responseType: 'arraybuffer', 
      timeout: 15000,
      headers: { 'Accept': 'image/*' }
    });
    return Buffer.from(data);
  } catch {
    return null;
  }
}

type Column = { key: string; label: string; width: number; align?: 'left' | 'right' | 'center' };

function drawProfessionalTable(
  doc: PDFKit.PDFDocument, 
  columns: Column[], 
  rows: Record<string, string>[], 
  footer?: Record<string, string>
) {
  const startX = doc.page.margins.left;
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const rowHeight = 22;
  const cellPadding = 8;
  const headerHeight = 28;

  function drawHeader() {
    const y = doc.y;
    // Fondo del encabezado
    doc.rect(startX, y, tableWidth, headerHeight)
       .fill(COLORS.headerBg);
    
    // Texto del encabezado
    doc.font(FONTS.bodyBold)
       .fontSize(9)
       .fillColor('#FFFFFF');
    
    let x = startX;
    for (const col of columns) {
      doc.text(col.label.toUpperCase(), x + cellPadding / 2, y + 8, {
        width: col.width - cellPadding,
        align: col.align ?? 'left',
        ellipsis: true,
        height: rowHeight,
        lineBreak: false,
      });
      x += col.width;
    }
    
    doc.fillColor(COLORS.text);
    doc.y = y + headerHeight + 2;
  }

  function drawRow(cells: Record<string, string>, y: number, isBold: boolean, bgColor?: string) {
    if (bgColor) {
      doc.rect(startX, y, tableWidth, rowHeight).fill(bgColor);
    }
    
    doc.font(isBold ? FONTS.bodyBold : FONTS.body)
       .fontSize(8.5)
       .fillColor(isBold ? COLORS.primary : COLORS.text);
    
    let x = startX;
    for (const col of columns) {
      doc.text(cells[col.key] ?? '', x + cellPadding / 2, y + 5, {
        width: col.width - cellPadding,
        align: col.align ?? 'left',
        ellipsis: true,
        height: rowHeight,
        lineBreak: false,
      });
      x += col.width;
    }
    
    doc.fillColor(COLORS.text);
  }

  function ensureSpace(neededHeight: number) {
    if (doc.y + neededHeight > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
      drawHeader();
    }
  }

  // Dibujar encabezado
  drawHeader();

  // Dibujar filas
  rows.forEach((row, i) => {
    ensureSpace(rowHeight);
    const bgColor = i % 2 === 0 ? COLORS.zebraLight : COLORS.zebraDark;
    drawRow(row, doc.y, false, bgColor);
    doc.y += rowHeight;
  });

  // Dibujar footer (totales)
  if (footer) {
    ensureSpace(rowHeight + 4);
    const totalY = doc.y;
    doc.rect(startX, totalY, tableWidth, rowHeight + 4)
       .fill(COLORS.totalBg);
    
    // Línea separadora
    doc.moveTo(startX, totalY)
       .lineTo(startX + tableWidth, totalY)
       .strokeColor(COLORS.primary)
       .lineWidth(1.5)
       .stroke();
    
    drawRow(footer, totalY + 2, true);
    doc.y = totalY + rowHeight + 6;
    
    // Línea inferior
    doc.moveTo(startX, doc.y)
       .lineTo(startX + tableWidth, doc.y)
       .strokeColor(COLORS.border)
       .lineWidth(0.5)
       .stroke();
  }
  
  doc.font(FONTS.body).fillColor(COLORS.text);
  doc.moveDown(1.2);
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, icon?: string) {
  const y = doc.y;
  const padding = 6;
  
  // Línea decorativa
  doc.rect(doc.page.margins.left, y + 6, 40, 2)
     .fill(COLORS.primary);
  
  doc.rect(doc.page.margins.left + 44, y + 8, 20, 1)
     .fill(COLORS.primaryLight);
  
  // Título
  doc.font(FONTS.heading)
     .fontSize(13)
     .fillColor(COLORS.secondary)
     .text(title, doc.page.margins.left + 50, y);
  
  doc.fillColor(COLORS.text);
  doc.moveDown(0.6);
}

function drawStatusBadge(doc: PDFKit.PDFDocument, status: string, x: number, y: number) {
  const statusColors: Record<string, { bg: string; text: string }> = {
    sin_iniciar: { bg: '#FFE5E5', text: '#C0392B' },
    en_tratamiento: { bg: '#FFF3CD', text: '#856404' },
    terminado: { bg: '#D4EDDA', text: '#155724' },
    alta: { bg: '#D1ECF1', text: '#0C5460' },
  };
  
  const colors = statusColors[status] || statusColors.sin_iniciar;
  const label = TREATMENT_STATUS_LABELS_ES[status] || status;
  const width = 80;
  const height = 20;
  
  doc.roundedRect(x, y, width, height, 4)
     .fill(colors.bg);
  
  doc.font(FONTS.bodyBold)
     .fontSize(8)
     .fillColor(colors.text)
     .text(label, x + 6, y + 4, {
       width: width - 12,
       align: 'center',
     });
  
  doc.fillColor(COLORS.text);
}

export async function buildTreatmentPlanReportPdf({ clinica, patient, plan, items, photos }: TreatmentPlanReportInput): Promise<Buffer> {
  // Descargar logo y fotos
  const logoBuffer = clinica.logoUrl ? await downloadImage(clinica.logoUrl) : null;
  const downloadedPhotos = await Promise.all(
    photos.map(async (p) => ({ label: p.label, buffer: await downloadImage(p.url) }))
  );

  const doc = new PDFDocument({ 
    size: 'A4', 
    margin: 40,
    bufferPages: true,
    info: {
      Title: `Informe Tratamiento #${plan.number}`,
      Author: clinica.name,
      Subject: 'Informe de tratamiento odontológico',
      Keywords: 'tratamiento, odontología, informe',
    }
  });
  
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const LOGO_SIZE = 80;
  const logoSlot = logoBuffer ? LOGO_SIZE + 20 : 0;

  // ============ ENCABEZADO ============
  const headerY = doc.page.margins.top;
  
  // Logo
  if (logoBuffer) {
    try {
      // Sombra sutil para el logo
      doc.rect(
        doc.page.width - doc.page.margins.right - LOGO_SIZE + 3,
        headerY + 3,
        LOGO_SIZE,
        LOGO_SIZE
      ).fill('#E8ECF0');
      
      doc.image(logoBuffer, 
        doc.page.width - doc.page.margins.right - LOGO_SIZE,
        headerY,
        { fit: [LOGO_SIZE, LOGO_SIZE], align: 'center', valign: 'center' }
      );
    } catch {
      // Error al cargar logo - omitir
    }
  }

  // Nombre de la clínica
  doc.font(FONTS.heading)
     .fontSize(20)
     .fillColor(COLORS.secondary)
     .text(clinica.name, doc.page.margins.left, headerY, {
       width: contentWidth - logoSlot,
     });

  // Subtítulo con línea decorativa
  doc.font(FONTS.subheading)
     .fontSize(9)
     .fillColor(COLORS.primaryLight)
     .text('INFORME DE TRATAMIENTO ODONTOLÓGICO', doc.page.margins.left, headerY + 26, {
       width: contentWidth - logoSlot,
     });

  // Línea decorativa doble
  const lineY = headerY + 40;
  doc.rect(doc.page.margins.left, lineY, contentWidth, 2)
     .fill(COLORS.primary);
  doc.rect(doc.page.margins.left, lineY + 4, contentWidth * 0.3, 1)
     .fill(COLORS.primaryLight);
  
  doc.moveDown(1.2);

  // ============ TARJETA DE INFORMACIÓN ============
  const cardY = doc.y;
  const cardHeight = 95;
  
  // Sombra de la tarjeta
  doc.rect(doc.page.margins.left + 2, cardY + 2, contentWidth, cardHeight)
     .fill('#E8ECF0');
  
  // Fondo de la tarjeta
  doc.roundedRect(doc.page.margins.left, cardY, contentWidth, cardHeight, 6)
     .fill(COLORS.cardBg);
  
  // Borde superior decorativo
  doc.rect(doc.page.margins.left, cardY, contentWidth, 3)
     .fill(COLORS.primary);

  // Layout de 3 columnas
  const col1 = doc.page.margins.left + 16;
  const col2 = doc.page.margins.left + contentWidth * 0.38;
  const col3 = doc.page.margins.left + contentWidth * 0.70;
  const rowGap = 24;

  // Columna 1: Paciente
  doc.font(FONTS.bodyBold)
     .fontSize(8)
     .fillColor(COLORS.textMuted)
     .text('PACIENTE', col1, cardY + 12);
  
  doc.font(FONTS.heading)
     .fontSize(14)
     .fillColor(COLORS.secondary)
     .text(`${patient.firstName} ${patient.lastName}`, col1, cardY + 24);

  doc.font(FONTS.body)
     .fontSize(9)
     .fillColor(COLORS.textLight)
     .text(`RUT: ${patient.rut}`, col1, cardY + 46);
  
  if (patient.birthDate) {
    doc.text(`Edad: ${new Date().getFullYear() - patient.birthDate.getFullYear()} años`, col1, cardY + 60);
  }

  // Columna 2: Presupuesto
  doc.font(FONTS.bodyBold)
     .fontSize(8)
     .fillColor(COLORS.textMuted)
     .text('PRESUPUESTO', col2, cardY + 12);
  
  doc.font(FONTS.heading)
     .fontSize(13)
     .fillColor(COLORS.primary)
     .text(`N° ${plan.number}`, col2, cardY + 24);

  if (plan.name) {
    doc.font(FONTS.body)
       .fontSize(9)
       .fillColor(COLORS.textLight)
       .text(plan.name, col2, cardY + 44);
  }

  doc.font(FONTS.body)
     .fontSize(9)
     .fillColor(COLORS.textLight)
     .text(`Monto: ${formatCLP(plan.amount)}`, col2, cardY + 58);

  // Columna 3: Estado y fechas
  drawStatusBadge(doc, plan.status, col3, cardY + 12);

  doc.font(FONTS.bodyBold)
     .fontSize(8)
     .fillColor(COLORS.textMuted)
     .text('CREADO', col3, cardY + 40);
  
  doc.font(FONTS.body)
     .fontSize(9)
     .fillColor(COLORS.textLight)
     .text(formatReportDate(plan.createdAt), col3, cardY + 50);

  if (plan.completedAt) {
    doc.font(FONTS.bodyBold)
       .fontSize(8)
       .fillColor(COLORS.textMuted)
       .text('FINALIZADO', col3, cardY + 68);
    
    doc.font(FONTS.body)
       .fontSize(9)
       .fillColor(COLORS.textLight)
       .text(formatReportDate(plan.completedAt), col3, cardY + 78);
  }

  doc.y = cardY + cardHeight + 18;

  // ============ ETIQUETAS (Sucursal, Convenio, Previsión) ============
  const tags = [
    plan.sucursal?.name ? `📍 ${plan.sucursal.name}` : null,
    plan.convenio?.name ? `🏛️ ${plan.convenio.name}` : null,
    plan.prevision?.name ? `🩺 ${plan.prevision.name}` : null,
  ].filter((t): t is string => Boolean(t));

  if (tags.length > 0) {
    doc.font(FONTS.body)
       .fontSize(8.5)
       .fillColor(COLORS.textMuted)
       .text(tags.join('  ·  '), {
         width: contentWidth,
         align: 'center',
       });
    doc.moveDown(0.8);
  }

  // ============ PROFESIONAL RESPONSABLE ============
  if (plan.professional) {
    doc.font(FONTS.body)
       .fontSize(9)
       .fillColor(COLORS.textLight)
       .text(`Profesional responsable: ${plan.professional.name}`, {
         width: contentWidth,
         align: 'center',
       });
    doc.moveDown(1.2);
  }

  // ============ TABLA DE PRESTACIONES ============
  drawSectionTitle(doc, 'Prestaciones Realizadas');
  
  drawProfessionalTable(
    doc,
    [
      { key: 'item', label: 'Prestación', width: 165 },
      { key: 'zona', label: 'Zona/Pieza', width: 85 },
      { key: 'fecha', label: 'Fecha', width: 75 },
      { key: 'profesional', label: 'Realizado por', width: 100 },
      { key: 'costo', label: 'Costo', width: 85, align: 'right' },
    ],
    items.map((item) => ({
      item: item.completed ? `✓ ${item.description}` : `○ ${item.description}`,
      zona: item.toothNumber || '—',
      fecha: item.treatedAt ? formatReportDate(item.treatedAt) : '—',
      profesional: item.treatedBy?.name || '—',
      costo: formatCLP(item.cost),
    })),
    { 
      item: 'TOTAL', 
      zona: '', 
      fecha: '', 
      profesional: '', 
      costo: formatCLP(plan.amount) 
    }
  );

  // ============ NOTAS CLÍNICAS ============
  const itemsWithNotes = items.filter((i) => i.notes?.trim());
  if (itemsWithNotes.length > 0) {
    drawSectionTitle(doc, 'Notas Clínicas');
    
    itemsWithNotes.forEach((item, index) => {
      const y = doc.y;
      // Número de ítem
      doc.rect(doc.page.margins.left, y + 1, 18, 18)
         .fill(COLORS.primaryLighter);
      
      doc.font(FONTS.bodyBold)
         .fontSize(8)
         .fillColor(COLORS.primary)
         .text((index + 1).toString(), doc.page.margins.left + 6, y + 4);
      
      // Título de la nota
      doc.font(FONTS.bodyBold)
         .fontSize(9.5)
         .fillColor(COLORS.secondary)
         .text(item.description, doc.page.margins.left + 24, y + 2);
      
      // Contenido de la nota
      doc.font(FONTS.body)
         .fontSize(9)
         .fillColor(COLORS.textLight)
         .text(item.notes || '', doc.page.margins.left + 24, y + 20, {
           width: contentWidth - 24,
           lineGap: 2,
         });
      
      doc.y = y + 20 + (item.notes?.length || 0) / 120 * 16 + 12;
    });
    
    doc.moveDown(0.6);
  }

  // ============ NOTAS DEL PRESUPUESTO ============
  if (plan.notes?.trim()) {
    drawSectionTitle(doc, 'Observaciones Generales');
    
    doc.rect(doc.page.margins.left, doc.y, contentWidth, 1)
       .fill(COLORS.border);
    
    doc.font(FONTS.body)
       .fontSize(9)
       .fillColor(COLORS.textLight)
       .text(plan.notes, doc.page.margins.left + 8, doc.y + 8, {
         width: contentWidth - 16,
         lineGap: 2,
       });
    
    doc.y += 20;
    doc.moveDown(0.8);
  }

  // ============ GALERÍA DE FOTOS ============
  const photosWithBuffer = downloadedPhotos.filter(
    (p): p is { label: string | null; buffer: Buffer } => p.buffer !== null
  );
  
  if (photosWithBuffer.length > 0) {
    drawSectionTitle(doc, 'Registro Fotográfico');
    
    const cols = 3;
    const gap = 10;
    const cellWidth = (contentWidth - gap * (cols - 1)) / cols;
    const cellHeight = cellWidth * 0.75;
    const labelHeight = 16;
    
    photosWithBuffer.forEach((photo, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      
      if (col === 0 && doc.y + cellHeight + labelHeight > doc.page.height - doc.page.margins.bottom - 40) {
        doc.addPage();
      }
      
      const x = doc.page.margins.left + col * (cellWidth + gap);
      const y = doc.y + row * (cellHeight + labelHeight + 8);
      
      // Marco de la foto
      doc.roundedRect(x, y, cellWidth, cellHeight, 4)
         .strokeColor(COLORS.border)
         .lineWidth(0.5)
         .stroke();
      
      // Número de foto
      doc.rect(x + 4, y + 4, 20, 16)
         .fill(COLORS.primaryLight)
         .opacity(0.8);
      
      doc.opacity(1);
      doc.font(FONTS.bodyBold)
         .fontSize(7)
         .fillColor('#FFFFFF')
         .text(`#${i + 1}`, x + 7, y + 6);
      
      try {
        doc.image(photo.buffer, x + 2, y + 2, { 
          fit: [cellWidth - 4, cellHeight - 4], 
          align: 'center', 
          valign: 'center' 
        });
      } catch {
        // Error al cargar imagen - mostrar placeholder
        doc.rect(x + 2, y + 2, cellWidth - 4, cellHeight - 4)
           .fill('#F0F0F0');
        doc.font(FONTS.body)
           .fontSize(8)
           .fillColor(COLORS.textMuted)
           .text('📷', x + cellWidth/2 - 10, y + cellHeight/2 - 10, {
             width: 20,
             align: 'center',
           });
      }
      
      if (photo.label) {
        doc.font(FONTS.body)
           .fontSize(7.5)
           .fillColor(COLORS.textMuted)
           .text(photo.label, x, y + cellHeight + 2, {
             width: cellWidth,
             align: 'center',
           });
      }
      
      if (col === cols - 1 || i === photosWithBuffer.length - 1) {
        doc.y = y + cellHeight + labelHeight + 8;
      }
    });
    doc.moveDown(0.6);
  }

  // ============ FOOTER ============
  // Separador
  doc.rect(doc.page.margins.left, doc.y, contentWidth, 1)
     .fill(COLORS.border);
  
  doc.moveDown(0.8);
  
  // Información de la clínica
  doc.font(FONTS.body)
     .fontSize(8)
     .fillColor(COLORS.textMuted)
     .text(clinica.name, {
       width: contentWidth,
       align: 'center',
     });
  
  doc.font(FONTS.small)
     .fontSize(7)
     .fillColor(COLORS.textMuted)
     .text('Documento generado automáticamente por el sistema. Este informe es válido como respaldo del tratamiento realizado.', {
       width: contentWidth,
       align: 'center',
       lineGap: 2,
     });
  
  doc.moveDown(0.4);
  
  doc.font(FONTS.small)
     .fontSize(7)
     .fillColor('#B0B0B0')
     .text(`ID: ${plan.number} · Generado: ${formatReportDate(new Date())} · Sistema v2.0`, {
       width: contentWidth,
       align: 'center',
     });

  // ============ PAGINACIÓN ============
  const range = doc.bufferedPageRange();
  const bottomMargin = doc.page.margins.bottom;
  
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    
    // Línea separadora en el pie
    doc.rect(doc.page.margins.left, doc.page.height - 30, contentWidth, 0.5)
       .fill(COLORS.border);
    
    // Número de página
    doc.font(FONTS.body)
       .fontSize(7)
       .fillColor(COLORS.textMuted)
       .text(
         `Página ${i - range.start + 1} de ${range.count} · ${clinica.name}`,
         doc.page.margins.left,
         doc.page.height - 24,
         { width: contentWidth, align: 'center' }
       );
    
    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();
  return finished;
}