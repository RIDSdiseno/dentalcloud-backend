export function buildConsentEmailHtml(params: {
  patientFirstName: string;
  signUrl: string;
  expiresAt: Date;
}): string {
  const { patientFirstName, signUrl, expiresAt } = params;
  const expiresLabel = expiresAt.toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
      <h2 style="color: #0f172a;">Consentimiento de tratamiento de datos personales</h2>
      <p>Hola ${patientFirstName},</p>
      <p>
        En el marco de la nueva ley de protección de datos personales, necesitamos tu
        autorización para el tratamiento de tus datos dentro de nuestra clínica dental.
      </p>
      <p>Por favor revisa y responde al siguiente documento:</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${signUrl}"
          style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; display: inline-block;">
          Revisar y responder
        </a>
      </p>
      <p style="font-size: 13px; color: #64748b;">
        Este link es válido hasta el ${expiresLabel}. Si el botón no funciona, copia y pega
        este enlace en tu navegador:<br />
        <a href="${signUrl}">${signUrl}</a>
      </p>
      <p style="margin-top: 32px; font-size: 13px; color: #64748b;">Clínica DentalCloud</p>
    </div>
  `;
}
