import axios from 'axios';
import PDFDocument from 'pdfkit';

type PlanRow = {
  number: number;
  name: string | null;
  professional: string | null;
  createdAt: Date;
  subtotal: number;
  interes: number;
  ajustes: number;
  total: number;
  abonado: number;
  saldo: number;
};

type Totals = {
  subtotal: number;
  interes: number;
  ajustes: number;
  total: number;
  abonado: number;
  saldo: number;
};

type Movement = {
  description: string | null;
  createdAt: Date;
  paymentMethod: string | null;
  registeredBy: { name: string };
  debe: number;
  haber: number;
  treatmentPlan: { number: number } | null;
};

type LedgerRow = {
  comprobante: string;
  number: number;
  createdAt: Date;
  debe: number;
  haber: number;
  planNumber: number | null;
  description: string | null;
  paymentMethod: string | null;
  documentNumber: string | null;
  notes: string | null;
};

type CartolaPdfInput = {
  clinica: { name: string; logoUrl: string | null };
  patient: { firstName: string; lastName: string; rut: string };
  plans: PlanRow[];
  totals: Totals;
  abonosLibres: Movement[];
  intereses: Movement[];
  ajustes: Movement[];
  ledger: LedgerRow[];
  saldoTotal: number;
};

type Column = { key: string; label: string; width: number; align?: 'left' | 'right' | 'center' };

// Paleta — azul de marca para acentos/encabezados, grises slate para texto y
// líneas, coherente con el color usado en los correos (#2563eb).
const BRAND = '#2563eb';
const BRAND_DARK = '#1e40af';
const INK = '#0f172a';
const SLATE = '#334155';
const MUTED = '#64748b';
const BORDER = '#cbd5e1';
const HEADER_BG = '#eff6ff';
const ZEBRA_BG = '#f8fafc';
const TOTALS_BG = '#dbeafe';

function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(
    amount
  );
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('es-CL');
}

async function downloadLogo(logoUrl: string): Promise<Buffer | null> {
  try {
    const { data } = await axios.get<ArrayBuffer>(logoUrl, { responseType: 'arraybuffer', timeout: 8000 });
    return Buffer.from(data);
  } catch {
    // El PDF se genera igual sin logo si la descarga falla (URL caída, formato no soportado, etc).
    return null;
  }
}

// pdfkit no tiene soporte de tablas — se dibuja fila por fila a mano,
// controlando el salto de página y repitiendo el encabezado en cada página.
function drawTable(
  doc: PDFKit.PDFDocument,
  columns: Column[],
  rows: Record<string, string>[],
  footer?: Record<string, string>
) {
  const startX = doc.page.margins.left;
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const rowHeight = 18;
  // Espacio entre columnas — sin esto, una columna alineada a la derecha y la
  // siguiente alineada a la izquierda quedan pegadas borde con borde y el
  // texto se ve concatenado (ej. "5506-08-2026").
  const cellPadding = 6;

  function drawRow(cells: Record<string, string>, y: number, bold: boolean, color: string) {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(color);
    let x = startX;
    for (const col of columns) {
      doc.text(cells[col.key] ?? '', x + cellPadding / 2, y + 4, {
        width: col.width - cellPadding,
        align: col.align ?? 'left',
        ellipsis: true,
        height: rowHeight,
        lineBreak: false,
      });
      x += col.width;
    }
    doc.fillColor(INK);
  }

  function drawHeaderRow() {
    const y = doc.y;
    doc.rect(startX, y, tableWidth, rowHeight).fill(HEADER_BG);
    doc.fontSize(8);
    const labels: Record<string, string> = {};
    for (const col of columns) labels[col.key] = col.label.toUpperCase();
    drawRow(labels, y, true, SLATE);
    doc.y = y + rowHeight;
    doc
      .moveTo(startX, doc.y)
      .lineTo(startX + tableWidth, doc.y)
      .strokeColor(BRAND)
      .lineWidth(1)
      .stroke();
    doc.fontSize(8);
  }

  function ensureSpace(neededHeight: number) {
    if (doc.y + neededHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeaderRow();
    }
  }

  drawHeaderRow();
  rows.forEach((row, i) => {
    ensureSpace(rowHeight);
    if (i % 2 === 1) {
      doc.rect(startX, doc.y, tableWidth, rowHeight).fill(ZEBRA_BG);
    }
    drawRow(row, doc.y, false, SLATE);
    doc.y += rowHeight;
  });

  if (footer) {
    ensureSpace(rowHeight + 4);
    doc.rect(startX, doc.y, tableWidth, rowHeight).fill(TOTALS_BG);
    drawRow(footer, doc.y, true, BRAND_DARK);
    doc.y += rowHeight;
    doc
      .moveTo(startX, doc.y)
      .lineTo(startX + tableWidth, doc.y)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
  } else {
    doc
      .moveTo(startX, doc.y)
      .lineTo(startX + tableWidth, doc.y)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
  }

  doc.font('Helvetica').fillColor(INK);
  doc.moveDown(1.4);
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  const y = doc.y;
  doc.rect(doc.page.margins.left, y + 1, 3, 12).fill(BRAND);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(INK)
    .text(title, doc.page.margins.left + 9, y);
  doc.fillColor(INK);
  doc.moveDown(0.6);
}

export async function buildCartolaPdf({
  clinica,
  patient,
  plans,
  totals,
  abonosLibres,
  intereses,
  ajustes,
  ledger,
  saldoTotal,
}: CartolaPdfInput): Promise<Buffer> {
  const logoBuffer = clinica.logoUrl ? await downloadLogo(clinica.logoUrl) : null;

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  // Caja ancha y baja (no cuadrada) para que quepa cualquier forma de logo —
  // ícono cuadrado, isotipo+texto horizontal, etc. — sin deformarse (fit
  // preserva la proporción) y sin sobresalir por debajo de la línea divisora:
  // la altura de la caja está acotada al alto real del bloque de texto del
  // encabezado (nombre + subtítulo), no a un tamaño arbitrario más grande.
  const LOGO_BOX_WIDTH = 130;
  const LOGO_BOX_HEIGHT = 44;
  const logoSlot = logoBuffer ? LOGO_BOX_WIDTH + 16 : 0;

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, doc.page.width - doc.page.margins.right - LOGO_BOX_WIDTH, doc.page.margins.top, {
        fit: [LOGO_BOX_WIDTH, LOGO_BOX_HEIGHT],
        align: 'right',
      });
    } catch {
      // Formato de imagen no soportado por pdfkit (ej. algunos SVG) — se omite el logo.
    }
  }

  doc.fontSize(18).font('Helvetica-Bold').fillColor(INK).text(clinica.name, { width: contentWidth - logoSlot });
  doc.fontSize(10).font('Helvetica-Bold').fillColor(BRAND).text('CARTOLA DE PACIENTE', { width: contentWidth - logoSlot });
  doc.fillColor(INK);

  doc.moveDown(0.5);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor(BRAND)
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(0.7);

  // Tarjeta con los datos del paciente y la fecha de emisión, para que se lea
  // como un documento formal (estilo encabezado de factura/estado de cuenta).
  const cardY = doc.y;
  const cardHeight = 44;
  doc.roundedRect(doc.page.margins.left, cardY, contentWidth, cardHeight, 4).fill('#f8fafc');
  doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('PACIENTE', doc.page.margins.left + 14, cardY + 8);
  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .fillColor(INK)
    .text(`${patient.firstName} ${patient.lastName}`, doc.page.margins.left + 14, cardY + 20);

  const midX = doc.page.margins.left + contentWidth * 0.4;
  doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('RUT', midX, cardY + 8);
  doc.fontSize(11).font('Helvetica').fillColor(SLATE).text(patient.rut, midX, cardY + 20);

  const rightX = doc.page.margins.left + contentWidth * 0.68;
  doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('GENERADO EL', rightX, cardY + 8);
  doc.fontSize(11).font('Helvetica').fillColor(SLATE).text(formatDate(new Date()), rightX, cardY + 20);

  doc.fillColor(INK);
  doc.y = cardY + cardHeight + 20;

  drawSectionTitle(doc, 'Listado de presupuestos');
  drawTable(
    doc,
    [
      { key: 'number', label: 'N°', width: 35 },
      { key: 'createdAt', label: 'Fecha', width: 55 },
      { key: 'professional', label: 'Profesional', width: 130 },
      { key: 'subtotal', label: 'Subtotal', width: 80, align: 'right' },
      { key: 'interes', label: 'Interés', width: 70, align: 'right' },
      { key: 'ajustes', label: 'Ajustes', width: 70, align: 'right' },
      { key: 'total', label: 'Total', width: 80, align: 'right' },
      { key: 'abonado', label: 'Abonado', width: 80, align: 'right' },
      { key: 'saldo', label: 'Saldo', width: 80, align: 'right' },
    ],
    plans.map((p) => ({
      number: String(p.number),
      createdAt: formatDate(p.createdAt),
      professional: p.professional ?? '—',
      subtotal: formatCLP(p.subtotal),
      interes: formatCLP(p.interes),
      ajustes: formatCLP(p.ajustes),
      total: formatCLP(p.total),
      abonado: formatCLP(p.abonado),
      saldo: formatCLP(p.saldo),
    })),
    plans.length > 0
      ? {
          professional: 'Totales',
          subtotal: formatCLP(totals.subtotal),
          interes: formatCLP(totals.interes),
          ajustes: formatCLP(totals.ajustes),
          total: formatCLP(totals.total),
          abonado: formatCLP(totals.abonado),
          saldo: formatCLP(totals.saldo),
        }
      : undefined
  );

  if (abonosLibres.length > 0) {
    drawSectionTitle(doc, 'Abonos libres');
    drawTable(
      doc,
      [
        { key: 'description', label: 'Descripción', width: 220 },
        { key: 'createdAt', label: 'Fecha', width: 70 },
        { key: 'paymentMethod', label: 'Forma de pago', width: 130 },
        { key: 'registeredBy', label: 'Registrado por', width: 130 },
        { key: 'monto', label: 'Monto', width: 90, align: 'right' },
      ],
      abonosLibres.map((m) => ({
        description: m.description || 'Abono libre',
        createdAt: formatDate(m.createdAt),
        paymentMethod: m.paymentMethod ?? 'Sin forma de pago',
        registeredBy: m.registeredBy.name,
        monto: formatCLP(m.haber),
      }))
    );
  }

  if (intereses.length > 0) {
    drawSectionTitle(doc, 'Intereses generados');
    drawTable(
      doc,
      [
        { key: 'description', label: 'Descripción', width: 260 },
        { key: 'createdAt', label: 'Fecha', width: 70 },
        { key: 'registeredBy', label: 'Registrado por', width: 150 },
        { key: 'monto', label: 'Monto', width: 90, align: 'right' },
      ],
      intereses.map((m) => ({
        description: `${m.description || 'Interés'}${m.treatmentPlan ? ` · Presupuesto N° ${m.treatmentPlan.number}` : ''}`,
        createdAt: formatDate(m.createdAt),
        registeredBy: m.registeredBy.name,
        monto: formatCLP(m.debe),
      }))
    );
  }

  if (ajustes.length > 0) {
    drawSectionTitle(doc, 'Ajustes');
    drawTable(
      doc,
      [
        { key: 'description', label: 'Descripción', width: 260 },
        { key: 'createdAt', label: 'Fecha', width: 70 },
        { key: 'registeredBy', label: 'Registrado por', width: 150 },
        { key: 'monto', label: 'Monto', width: 90, align: 'right' },
      ],
      ajustes.map((m) => ({
        description: `${m.description || 'Ajuste'}${m.treatmentPlan ? ` · Presupuesto N° ${m.treatmentPlan.number}` : ''}`,
        createdAt: formatDate(m.createdAt),
        registeredBy: m.registeredBy.name,
        monto: m.debe > 0 ? formatCLP(m.debe) : `-${formatCLP(m.haber)}`,
      }))
    );
  }

  drawSectionTitle(doc, 'Detalle de movimientos');
  drawTable(
    doc,
    [
      { key: 'comprobante', label: 'Comprobante', width: 75 },
      { key: 'number', label: 'N° Mov.', width: 45, align: 'right' },
      { key: 'createdAt', label: 'Fecha', width: 55 },
      { key: 'debe', label: 'Debe', width: 65, align: 'right' },
      { key: 'haber', label: 'Haber', width: 65, align: 'right' },
      { key: 'planNumber', label: 'Presup.', width: 45, align: 'right' },
      { key: 'description', label: 'Glosa', width: 150 },
      { key: 'paymentMethod', label: 'Pago', width: 80 },
      { key: 'documentNumber', label: 'N° doc.', width: 60 },
      { key: 'notes', label: 'Observación', width: 130 },
    ],
    ledger.map((row) => ({
      comprobante: row.comprobante,
      number: String(row.number),
      createdAt: formatDate(row.createdAt),
      debe: row.debe > 0 ? formatCLP(row.debe) : '—',
      haber: row.haber > 0 ? formatCLP(row.haber) : '—',
      planNumber: row.planNumber != null ? String(row.planNumber) : '—',
      description: row.description ?? '—',
      paymentMethod: row.paymentMethod ?? '—',
      documentNumber: row.documentNumber ?? '—',
      notes: row.notes ?? '—',
    }))
  );

  // Banner final con el saldo total — el resumen que más importa, destacado
  // aparte de la tabla en vez de perderse como una fila más.
  const bannerHeight = 40;
  if (doc.y + bannerHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
  const bannerY = doc.y;
  doc.roundedRect(doc.page.margins.left, bannerY, contentWidth, bannerHeight, 4).fill(saldoTotal > 0 ? '#fef3c7' : '#dcfce7');
  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor(saldoTotal > 0 ? '#92400e' : '#166534')
    .text('SALDO TOTAL', doc.page.margins.left + 16, bannerY + 12);
  doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .fillColor(saldoTotal > 0 ? '#92400e' : '#166534')
    .text(formatCLP(saldoTotal), doc.page.margins.left, bannerY + 10, { width: contentWidth - 16, align: 'right' });
  doc.fillColor(INK);
  doc.y = bannerY + bannerHeight + 16;

  doc
    .fontSize(8)
    .font('Helvetica')
    .fillColor(MUTED)
    .text('Documento generado automáticamente por fordentcloud a partir de los movimientos registrados en el sistema.', {
      align: 'center',
    });

  // Numeración de páginas — se agrega al final, sobre las páginas ya
  // generadas (bufferPages permite volver atrás con switchToPage). Escribir
  // dentro de la franja del margen inferior hace que pdfkit crea que no
  // alcanza el espacio y agregue una página nueva en blanco — se baja el
  // margen a 0 momentáneamente solo para dibujar el pie de página.
  const range = doc.bufferedPageRange();
  const bottomMargin = doc.page.margins.bottom;
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor(MUTED)
      .text(`Página ${i - range.start + 1} de ${range.count}`, doc.page.margins.left, doc.page.height - 24, {
        width: contentWidth,
        align: 'center',
      });
    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();
  return finished;
}
