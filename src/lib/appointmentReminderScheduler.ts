import cron from 'node-cron';
import prisma from './prisma';
import { send as sendEmail } from './emailService';

// ============================================================================
// Reloj de recordatorios de cita (automático).
//
// Toma el MISMO correo de recordatorio que el asistente ya envía a mano
// (recordar_cita en assistantController) y lo manda SOLO, una vez al día, a los
// pacientes que tienen cita al día siguiente.
//
// CUIDADOS (lo importante de este archivo):
//  - MODO ENSAYO por defecto: si RECORDATORIOS_ENVIAR !== 'true', hace TODO
//    menos enviar el correo — arma la lista de a quién avisaría y la escribe en
//    el log del servidor. Así se revisa antes de mandar nada de verdad.
//  - NO toca ninguna tabla existente. Las citas, pacientes y clínicas quedan
//    intactas; cero cambios al esquema de Prisma. La marca "ya avisada" y el
//    interruptor por clínica viven en DOS tablas propias, creadas a mano
//    (CREATE TABLE IF NOT EXISTS), igual que el patrón del portal del paciente.
//  - La tabla de "ya avisadas" se auto-limpia: borra las filas de más de 60 días,
//    así nunca crece sin control.
//  - Interruptor por clínica: arranca encendido SOLO para RIDS; las demás,
//    apagadas, hasta que se activen.
// ============================================================================

const TZ = 'America/Santiago';
const CRON_EXPR = process.env.RECORDATORIOS_HORA ?? '0 9 * * *'; // 09:00 cada día
const ENVIAR_DE_VERDAD = process.env.RECORDATORIOS_ENVIAR === 'true'; // false = ensayo 🧪
const RELOJ_ACTIVO = process.env.RECORDATORIOS_ACTIVO !== 'false'; // encendido salvo apagado explícito
const RETENCION_DIAS = 60;
const CLINICA_POR_DEFECTO = 'RIDS'; // única encendida en v1

export type ReminderPreview = {
  modo: 'ensayo' | 'envio_real';
  aEnviar: { paciente: string; email: string; cuando: string; clinica: string }[];
  sinCorreo: number;
  yaAvisados: number;
  clinicasActivas: number;
};

// Fecha de calendario en Chile (YYYY-MM-DD). Robusta a horario de verano sin
// necesitar librería de zonas horarias.
function chileYMD(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function fechaLegible(d: Date): string {
  return d.toLocaleString('es-CL', { timeZone: TZ, dateStyle: 'full', timeStyle: 'short' });
}

// Crea las dos tablas propias si no existen. Idempotente y aislado: no toca
// nada del esquema existente.
async function ensureTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS recordatorio_cita_enviado (
      appointment_id text PRIMARY KEY,
      enviado_en timestamptz NOT NULL DEFAULT now()
    )`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS recordatorio_config (
      clinica_id text PRIMARY KEY,
      activo boolean NOT NULL DEFAULT false,
      horas_antes integer NOT NULL DEFAULT 24,
      actualizado_en timestamptz NOT NULL DEFAULT now()
    )`);
}

// Enciende por defecto SOLO la clínica RIDS (si existe). Idempotente: no pisa
// una configuración ya guardada.
async function seedDefaults(): Promise<void> {
  const rids = await prisma.clinica.findFirst({
    where: { name: CLINICA_POR_DEFECTO },
    select: { id: true },
  });
  if (!rids) return;
  await prisma.$executeRawUnsafe(
    `INSERT INTO recordatorio_config (clinica_id, activo, horas_antes)
     VALUES ($1, true, 24)
     ON CONFLICT (clinica_id) DO NOTHING`,
    rids.id,
  );
}

async function clinicasActivas(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ clinica_id: string }[]>(
    `SELECT clinica_id FROM recordatorio_config WHERE activo = true`,
  );
  return rows.map((r) => r.clinica_id);
}

async function yaEnviado(appointmentId: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT 1 AS n FROM recordatorio_cita_enviado WHERE appointment_id = $1 LIMIT 1`,
    appointmentId,
  );
  return rows.length > 0;
}

async function marcarEnviado(appointmentId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO recordatorio_cita_enviado (appointment_id) VALUES ($1)
     ON CONFLICT (appointment_id) DO NOTHING`,
    appointmentId,
  );
}

async function limpiarViejos(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM recordatorio_cita_enviado WHERE enviado_en < now() - interval '${RETENCION_DIAS} days'`,
  );
}

// Núcleo. En modo ensayo (dryRun) arma la lista pero NO envía ni marca nada, así
// se puede correr las veces que haga falta sin efectos. `diasVista` controla
// cuántos días hacia adelante mirar: el trabajo diario real usa 1 (solo mañana);
// un ensayo puede pedir más para mostrar una vista más amplia.
export async function runReminders(opts?: { dryRun?: boolean; diasVista?: number }): Promise<ReminderPreview> {
  const dryRun = opts?.dryRun ?? !ENVIAR_DE_VERDAD;
  const diasVista = Math.max(1, opts?.diasVista ?? 1);

  await ensureTables();
  await seedDefaults();

  const activas = await clinicasActivas();
  const preview: ReminderPreview = {
    modo: dryRun ? 'ensayo' : 'envio_real',
    aEnviar: [],
    sinCorreo: 0,
    yaAvisados: 0,
    clinicasActivas: activas.length,
  };
  if (activas.length === 0) return preview;

  const now = new Date();
  // Días objetivo (calendario chileno): desde mañana hasta mañana+diasVista-1.
  const diasObjetivo = new Set<string>();
  for (let d = 1; d <= diasVista; d++) {
    diasObjetivo.add(chileYMD(new Date(now.getTime() + d * 86_400_000)));
  }
  // Ventana UTC generosa que cubre esos días, con margen por el desfase horario.
  const hasta = new Date(now.getTime() + (diasVista + 1) * 86_400_000);

  for (const clinicaId of activas) {
    const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { name: true } });
    const citas = await prisma.appointment.findMany({
      where: { clinicaId, startAt: { gte: now, lte: hasta }, status: { not: 'cancelada' } },
      orderBy: { startAt: 'asc' },
      select: { id: true, startAt: true, patientId: true },
    });

    for (const cita of citas) {
      if (!diasObjetivo.has(chileYMD(cita.startAt))) continue; // no cae en el día a avisar
      if (await yaEnviado(cita.id)) {
        preview.yaAvisados++;
        continue;
      }
      const p = await prisma.patient.findUnique({
        where: { id: cita.patientId },
        select: { firstName: true, email: true },
      });
      if (!p?.email) {
        preview.sinCorreo++;
        continue;
      }
      const fechaTxt = fechaLegible(cita.startAt);
      preview.aEnviar.push({
        paciente: p.firstName,
        email: p.email,
        cuando: fechaTxt,
        clinica: clinica?.name ?? '',
      });

      if (!dryRun) {
        try {
          await sendEmail({
            to: p.email,
            subject: `Recordatorio de tu cita – ${clinica?.name ?? 'fordentcloud'}`,
            html:
              `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">` +
              `<p>Hola ${p.firstName},</p>` +
              `<p>Te recordamos tu próxima cita en <strong>${clinica?.name ?? 'la clínica'}</strong>:</p>` +
              `<p style="font-size:18px;margin:16px 0"><strong>${fechaTxt}</strong></p>` +
              `<p>Si no puedes asistir, por favor avísanos para reagendarla.</p>` +
              `<p style="color:#64748b;font-size:12px;margin-top:24px">Mensaje enviado por fordentcloud.</p></div>`,
            clinicaId,
          });
          await marcarEnviado(cita.id);
        } catch (err) {
          // Un correo que falla no debe botar el resto del lote.
          console.error(`[recordatorios] no se pudo enviar a ${p.email}`, err);
        }
      }
    }
  }

  if (!dryRun) await limpiarViejos();
  return preview;
}

// Arranca el reloj. Lo llama index.ts tras levantar el servidor.
export function startAppointmentReminders(): void {
  if (!RELOJ_ACTIVO) {
    console.log('[recordatorios] reloj APAGADO (RECORDATORIOS_ACTIVO=false)');
    return;
  }
  cron.schedule(
    CRON_EXPR,
    () => {
      runReminders({ dryRun: !ENVIAR_DE_VERDAD, diasVista: 1 })
        .then((p) => {
          if (p.modo === 'ensayo') {
            console.log(
              `[recordatorios] 🧪 ENSAYO: avisaría a ${p.aEnviar.length} paciente(s) mañana ` +
                `(sin correo: ${p.sinCorreo}, ya avisados: ${p.yaAvisados}). No se envió nada.`,
            );
            for (const r of p.aEnviar) console.log(`   · ${r.paciente} <${r.email}> — ${r.cuando}`);
          } else {
            console.log(
              `[recordatorios] enviados ${p.aEnviar.length} recordatorio(s) ` +
                `(sin correo: ${p.sinCorreo}, ya avisados: ${p.yaAvisados}).`,
            );
          }
        })
        .catch((err) => console.error('[recordatorios] falló el reloj', err));
    },
    { timezone: TZ },
  );
  console.log(
    `[recordatorios] reloj encendido — ${CRON_EXPR} (${TZ}), modo ${
      ENVIAR_DE_VERDAD ? 'ENVÍO REAL' : 'ENSAYO 🧪'
    }`,
  );
}
