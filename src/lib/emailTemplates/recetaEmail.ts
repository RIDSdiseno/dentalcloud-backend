export function buildRecetaEmailHtml(params: {
  patientFirstName: string;
  clinicaNombre: string;
  clinicaLogoUrl?: string | null;
  profesionalNombre: string;
  medicamentos: { medicamento: string; indicaciones: string }[];
  observaciones?: string | null;
}): string {
  const { patientFirstName, clinicaNombre, clinicaLogoUrl, profesionalNombre, medicamentos, observaciones } = params;

  // El detalle va también en el cuerpo, no sólo en el PDF: mucha gente lee el
  // correo en el teléfono y abrir un adjunto es una fricción de más para algo
  // que necesita tener a mano a la hora de tomar el remedio.
  const lista = medicamentos
    .map(
      (item) => `
        <li style="margin-bottom: 8px;">
          <strong style="color: #0f172a;">${item.medicamento}</strong>
          ${item.indicaciones ? `<br /><span style="color: #475569;">${item.indicaciones}</span>` : ''}
        </li>`
    )
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
      ${
        clinicaLogoUrl
          ? `<p style="text-align: center; margin-bottom: 8px;"><img src="${clinicaLogoUrl}" alt="${clinicaNombre}" style="max-height: 56px;" /></p>`
          : ''
      }
      <h2 style="color: #0f172a;">Tu receta médica</h2>
      <p>Hola ${patientFirstName},</p>
      <p>Adjuntamos la receta que te indicó <strong>${profesionalNombre}</strong> en ${clinicaNombre}.</p>

      <ul style="padding-left: 18px; margin: 16px 0;">${lista}</ul>

      ${
        observaciones
          ? `<p style="background: #f8fafc; border-left: 3px solid #0891b2; padding: 10px 12px; color: #334155;">
               <strong>Indicaciones:</strong> ${observaciones}
             </p>`
          : ''
      }

      <p style="color: #475569; font-size: 13px;">
        El documento firmado va adjunto en PDF. Si tienes dudas sobre la indicación, consulta con tu profesional antes de
        tomar cualquier medicamento.
      </p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">${clinicaNombre}</p>
    </div>
  `;
}
