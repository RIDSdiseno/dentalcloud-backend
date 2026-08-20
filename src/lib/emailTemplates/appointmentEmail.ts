export function buildAppointmentConfirmationEmailHtml(params: {
  patientFirstName: string;
  professionalName: string;
  startAt: Date;
  clinicaNombre: string;
  clinicaLogoUrl?: string | null;
}): string {
  const { patientFirstName, professionalName, startAt, clinicaNombre, clinicaLogoUrl } = params;
  const dateLabel = startAt.toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeLabel = startAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
      ${
        clinicaLogoUrl
          ? `<p style="text-align: center; margin-bottom: 8px;"><img src="${clinicaLogoUrl}" alt="${clinicaNombre}" style="max-height: 56px;" /></p>`
          : ''
      }
      <h2 style="color: #0f172a;">Tu cita ha sido agendada</h2>
      <p>Hola ${patientFirstName},</p>
      <p>Te confirmamos tu hora en ${clinicaNombre}:</p>
      <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
        <p style="margin: 0 0 6px; font-size: 15px;"><strong>Día:</strong> ${dateLabel}</p>
        <p style="margin: 0 0 6px; font-size: 15px;"><strong>Hora:</strong> ${timeLabel}</p>
        <p style="margin: 0; font-size: 15px;"><strong>Profesional:</strong> ${professionalName}</p>
      </div>
      <p style="font-size: 13px; color: #64748b;">
        Si necesitas reprogramar o cancelar tu cita, comunícate directamente con ${clinicaNombre}.
      </p>
      <p style="margin-top: 32px; font-size: 13px; color: #64748b;">${clinicaNombre}</p>
    </div>
  `;
}
