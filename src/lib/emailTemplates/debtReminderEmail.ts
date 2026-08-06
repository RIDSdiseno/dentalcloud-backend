function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(
    amount
  );
}

export function buildDebtReminderEmailHtml(params: {
  patientFirstName: string;
  clinicaNombre: string;
  clinicaLogoUrl?: string | null;
  saldoTotal: number;
}): string {
  const { patientFirstName, clinicaNombre, clinicaLogoUrl, saldoTotal } = params;
  const hasDebt = saldoTotal > 0;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
      ${
        clinicaLogoUrl
          ? `<p style="text-align: center; margin-bottom: 8px;"><img src="${clinicaLogoUrl}" alt="${clinicaNombre}" style="max-height: 56px;" /></p>`
          : ''
      }
      <h2 style="color: #0f172a;">${hasDebt ? 'Recordatorio de pago pendiente' : 'Tu cartola'}</h2>
      <p>Hola ${patientFirstName},</p>
      <p>
        ${
          hasDebt
            ? `Te escribimos de ${clinicaNombre} para recordarte que tienes un saldo pendiente en tu cuenta.`
            : `Te escribimos de ${clinicaNombre} para enviarte tu cartola.`
        }
        Adjuntamos el detalle completo en PDF, con tus presupuestos y movimientos.
      </p>
      <p style="text-align: center; margin: 24px 0;">
        <span style="background-color: ${hasDebt ? '#fef3c7' : '#dcfce7'}; color: ${hasDebt ? '#92400e' : '#166534'}; padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 18px; display: inline-block;">
          ${hasDebt ? `Saldo total: ${formatCLP(saldoTotal)}` : 'Tu cuenta está al día'}
        </span>
      </p>
      <p style="font-size: 13px; color: #64748b;">
        ${hasDebt ? 'Si ya realizaste este pago, puedes ignorar este mensaje.' : ''} Ante cualquier duda, contáctanos.
      </p>
      <p style="margin-top: 32px; font-size: 13px; color: #64748b;">${clinicaNombre}</p>
    </div>
  `;
}
