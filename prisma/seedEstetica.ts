import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Seed independiente para una clínica de demostración tipo "estetica" (facial).
// No toca nada de la clínica dental existente (seed.ts) — crea su propia
// Clinica con tipo: 'estetica' y todo el catálogo/datos quedan scoped a ella.
async function main() {
  const clinica = await prisma.clinica.upsert({
    where: { id: 'estetica-demo-clinica' },
    update: {},
    create: {
      id: 'estetica-demo-clinica',
      name: 'Clínica Estética Demo',
      tipo: 'estetica',
      rxEnabled: false,
    },
  });
  console.log(`Clínica de estética lista -> ${clinica.name} (tipo: ${clinica.tipo})`);

  const email = 'admin@esteticademo.local';
  const password = 'Admin123!';
  const admin = await prisma.user.upsert({
    where: { email },
    update: { clinicaId: clinica.id, role: 'admin' },
    create: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      name: 'Administradora Estética',
      role: 'admin',
      clinicaId: clinica.id,
    },
  });
  console.log(`Usuario admin de estética listo -> email: ${admin.email} / password: ${password}`);

  const professionalEmail = 'profesional@esteticademo.local';
  const professionalPassword = 'Profesional123!';
  const professional = await prisma.user.upsert({
    where: { email: professionalEmail },
    update: { clinicaId: clinica.id, role: 'odontologo' },
    create: {
      email: professionalEmail,
      passwordHash: await bcrypt.hash(professionalPassword, 10),
      name: 'Dra. Constanza Vidal',
      role: 'odontologo',
      clinicaId: clinica.id,
    },
  });
  console.log(`Profesional de estética listo -> email: ${professional.email} / password: ${professionalPassword}`);

  const sucursal = await prisma.sucursal.upsert({
    where: { clinicaId_name: { clinicaId: clinica.id, name: 'Sede Providencia' } },
    update: {},
    create: { name: 'Sede Providencia', clinicaId: clinica.id },
  });
  console.log(`Sucursal lista: ${sucursal.name}`);

  const prevision = await prisma.prevision.upsert({
    where: { clinicaId_name: { clinicaId: clinica.id, name: 'Particular' } },
    update: {},
    create: { name: 'Particular', clinicaId: clinica.id },
  });
  console.log(`Previsión lista: ${prevision.name}`);

  const convenio = await prisma.convenio.upsert({
    where: { clinicaId_name: { clinicaId: clinica.id, name: 'Particular' } },
    update: {},
    create: { name: 'Particular', discountPercent: 0, clinicaId: clinica.id },
  });
  console.log(`Convenio listo: ${convenio.name}`);

  const patient = await prisma.patient.upsert({
    where: { clinicaId_rut: { clinicaId: clinica.id, rut: '19887766-3' } },
    update: {},
    create: {
      rut: '19887766-3',
      firstName: 'Javiera',
      lastName: 'Contreras',
      phone: '+56 9 8234 5678',
      clinicaId: clinica.id,
    },
  });
  console.log(`Paciente de ejemplo listo: ${patient.firstName} ${patient.lastName}`);

  // Catálogo de estética facial: prestaciones genéricas (no atadas a una
  // zona específica), porque un mismo implemento (ej. una jeringa de ácido
  // hialurónico o toxina botulínica) se aplica indistintamente en una o
  // varias zonas del mapa facial durante una misma sesión — el precio es por
  // implemento/procedimiento, no por zona. Los precios son valores de
  // referencia (CLP), editables luego desde la clínica real.
  const prestaciones: Array<{ code: string; name: string; basePrice: number }> = [
    { code: 'AH-01', name: 'Ácido Hialurónico', basePrice: 200000 },
    { code: 'BTX-01', name: 'Toxina Botulínica', basePrice: 120000 },
  ];

  for (const p of prestaciones) {
    await prisma.prestacion.upsert({
      where: { clinicaId_code: { clinicaId: clinica.id, code: p.code } },
      update: { name: p.name, basePrice: p.basePrice },
      create: { ...p, clinicaId: clinica.id },
    });
  }

  const currentCodes = prestaciones.map((p) => p.code);
  const removed = await prisma.prestacion.deleteMany({
    where: { clinicaId: clinica.id, code: { notIn: currentCodes } },
  });
  if (removed.count > 0) {
    console.log(`Prestaciones antiguas por zona eliminadas: ${removed.count}`);
  }
  console.log(`Prestaciones de estética listas: ${prestaciones.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
