// Auditoría de seguridad (16/09) — corre UNA sola vez (o cada vez que se
// quiera re-sincronizar) para rellenar `RxOrderClinic` con las órdenes de
// RIDS RX que YA existían antes de que ese candado existiera. Sin esto, el
// candado de rxController.ts (isOrderAccessAllowed) deja pasar cualquier
// orden vieja porque no tiene forma de saber de qué clínica es — este script
// se lo dice, consultando Dimage por cada paciente (mismo endpoint que ya
// usa listOrders) y anotando el resultado.
//
// Uso: npx tsx scripts/backfillRxOrderClinics.ts
//
// Solo lee de Dimage y de nuestra propia base — nunca crea, edita ni borra
// nada en Dimage, y en nuestra base solo hace upsert sobre la tabla nueva
// (rx_order_clinics), nunca toca ninguna otra.
import prisma from '../src/lib/prisma';
import { fetchOrdersByPatient } from '../src/lib/dimageClient';
import { dimageRut } from '../src/utils/rut';

const PAGE_SIZE = 50;
const DELAY_MS = 150; // no golpear la API de Dimage sin pausa

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAllOrdersForPatient(rut: string): Promise<Array<{ id: number | string }>> {
  const orders: Array<{ id: number | string }> = [];
  let page = 1;
  for (;;) {
    const result = await fetchOrdersByPatient(rut, page, PAGE_SIZE);
    const rows: Array<{ id: number | string }> = Array.isArray(result?.data) ? result.data : [];
    orders.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    page += 1;
    await sleep(DELAY_MS);
  }
  return orders;
}

async function main() {
  if (!process.env.DIMAGE_API_URL || !process.env.DIMAGE_API_KEY) {
    console.error('DIMAGE_API_URL/DIMAGE_API_KEY no configurados — no se puede correr el backfill.');
    process.exit(1);
  }

  // Excluye las clínicas demo fake generadas por la automatización diaria
  // (nombres "Demo ..."), que no tienen órdenes reales en Dimage — evita
  // miles de consultas desperdiciadas contra la API externa.
  const clinicas = await prisma.clinica.findMany({
    where: { rxEnabled: true, name: { not: { startsWith: 'Demo ' } } },
    select: { id: true, name: true },
  });
  console.log(`Clínicas con RX habilitado (excluyendo demo fake): ${clinicas.length}`);

  let totalPatients = 0;
  let totalOrdersSeen = 0;
  let totalOrdersNew = 0;
  let totalPatientErrors = 0;

  for (const clinica of clinicas) {
    const patients = await prisma.patient.findMany({
      where: { clinicaId: clinica.id, rut: { not: '' } },
      select: { id: true, rut: true },
    });
    console.log(`\n[${clinica.name}] ${patients.length} pacientes`);

    for (const patient of patients) {
      totalPatients += 1;
      try {
        const orders = await fetchAllOrdersForPatient(dimageRut(patient.rut));
        totalOrdersSeen += orders.length;
        for (const order of orders) {
          if (order.id === undefined || order.id === null) continue;
          const existing = await prisma.rxOrderClinic.findUnique({ where: { dimageOrderId: String(order.id) } });
          if (existing) continue;
          await prisma.rxOrderClinic.create({
            data: { dimageOrderId: String(order.id), clinicaId: clinica.id, patientId: patient.id },
          });
          totalOrdersNew += 1;
        }
      } catch (err) {
        totalPatientErrors += 1;
        console.error(`  Error consultando órdenes del paciente ${patient.id} (${patient.rut}):`, err instanceof Error ? err.message : err);
      }
      await sleep(DELAY_MS);
    }
  }

  console.log('\n--- Resumen ---');
  console.log(`Pacientes revisados: ${totalPatients}`);
  console.log(`Órdenes vistas en Dimage: ${totalOrdersSeen}`);
  console.log(`Mapeos nuevos creados: ${totalOrdersNew}`);
  console.log(`Pacientes con error al consultar: ${totalPatientErrors}`);
}

main()
  .catch((err) => {
    console.error('Backfill falló', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
