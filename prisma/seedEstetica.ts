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

  // Catálogo de estética facial, basado en zonas de Ácido Hialurónico y Toxina
  // Botulínica. Los precios son valores de referencia (CLP), editables luego
  // desde la clínica real.
  const prestaciones: Array<{ code: string; name: string; basePrice: number }> = [
    { code: 'AH-01', name: 'Ácido Hialurónico - Labios', basePrice: 180000 },
    { code: 'AH-02', name: 'Ácido Hialurónico - Nariz (Rinomodelación)', basePrice: 220000 },
    { code: 'AH-03', name: 'Ácido Hialurónico - Ojeras', basePrice: 200000 },
    { code: 'AH-04', name: 'Ácido Hialurónico - Pómulos y mejillas', basePrice: 250000 },
    { code: 'AH-05', name: 'Ácido Hialurónico - Mentón', basePrice: 200000 },
    { code: 'AH-06', name: 'Ácido Hialurónico - Mandíbula', basePrice: 260000 },
    { code: 'AH-07', name: 'Ácido Hialurónico - Sienes', basePrice: 220000 },
    { code: 'AH-08', name: 'Ácido Hialurónico - Surcos nasogenianos / marioneta', basePrice: 190000 },
    { code: 'BTX-01', name: 'Toxina Botulínica - Frente', basePrice: 120000 },
    { code: 'BTX-02', name: 'Toxina Botulínica - Entrecejo', basePrice: 100000 },
    { code: 'BTX-03', name: 'Toxina Botulínica - Patas de gallo', basePrice: 110000 },
    { code: 'BTX-04', name: 'Toxina Botulínica - Párpados', basePrice: 90000 },
    { code: 'BTX-05', name: 'Toxina Botulínica - Mandíbula (bruxismo/maseteros)', basePrice: 150000 },
  ];

  for (const p of prestaciones) {
    await prisma.prestacion.upsert({
      where: { clinicaId_code: { clinicaId: clinica.id, code: p.code } },
      update: { name: p.name, basePrice: p.basePrice },
      create: { ...p, clinicaId: clinica.id },
    });
  }
  console.log(`Prestaciones de estética listas: ${prestaciones.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
