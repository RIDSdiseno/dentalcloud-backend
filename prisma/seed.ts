import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@dentalcloud.local';
  const password = 'Admin123!';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      name: 'Administrador',
      role: 'admin',
    },
  });

  console.log(`Usuario de prueba listo -> email: ${user.email} / password: ${password}`);

  const professionalEmail = 'profesional@dentalcloud.local';
  const professionalPassword = 'Profesional123!';
  const professional = await prisma.user.upsert({
    where: { email: professionalEmail },
    update: { role: 'odontologo' },
    create: {
      email: professionalEmail,
      passwordHash: await bcrypt.hash(professionalPassword, 10),
      name: 'Sofía Ramírez',
      role: 'odontologo',
    },
  });
  console.log(`Profesional de prueba listo -> email: ${professional.email} / password: ${professionalPassword}`);

  const chairNumbers = [101, 102, 103, 104, 105, 106];
  const chairs: Record<number, { id: string }> = {};
  for (const number of chairNumbers) {
    chairs[number] = await prisma.chair.upsert({
      where: { number },
      update: {},
      create: { number },
    });
  }
  console.log(`Sillones listos: ${chairNumbers.join(', ')}`);

  const samplePatients = [
    { rut: '18234567-9', firstName: 'Camila', lastName: 'Torres', phone: '+56 9 8123 4501' },
    { rut: '19345678-2', firstName: 'Matías', lastName: 'Rojas', phone: '+56 9 8123 4502' },
    { rut: '17456789-1', firstName: 'Valentina', lastName: 'Muñoz', phone: '+56 9 8123 4503' },
    { rut: '20567890-5', firstName: 'Sebastián', lastName: 'Castro', phone: '+56 9 8123 4504' },
    { rut: '16678901-K', firstName: 'Fernanda', lastName: 'Silva', phone: '+56 9 8123 4505' },
    { rut: '21789012-8', firstName: 'Diego', lastName: 'Vargas', phone: '+56 9 8123 4506' },
    { rut: '15890123-4', firstName: 'Antonia', lastName: 'Reyes', phone: '+56 9 8123 4507' },
    { rut: '22901234-7', firstName: 'Cristóbal', lastName: 'Muñoz', phone: '+56 9 8123 4508' },
    { rut: '15446950-8', firstName: 'Maria', lastName: 'Gonzalez', phone: '+56911112222' },
  ];

  const patients: Record<string, { id: string }> = {};
  for (const p of samplePatients) {
    const rut = p.rut.replace(/[^0-9kK]/g, '').toUpperCase();
    patients[p.firstName] = await prisma.patient.upsert({
      where: { rut },
      update: {},
      create: { rut, firstName: p.firstName, lastName: p.lastName, phone: p.phone },
    });
  }
  console.log(`Pacientes de ejemplo listos: ${samplePatients.length}`);

  function at(daysFromNow: number, hours: number, minutes: number) {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  const sampleAppointments = [
    { patient: 'Camila', chair: 101, professional: user.id, day: 0, start: [9, 0], end: [9, 30] },
    { patient: 'Matías', chair: 102, professional: professional.id, day: 0, start: [10, 0], end: [10, 45] },
    { patient: 'Valentina', chair: 103, professional: user.id, day: 0, start: [11, 0], end: [11, 30] },
    { patient: 'Sebastián', chair: 101, professional: professional.id, day: 0, start: [14, 0], end: [14, 30] },
    { patient: 'Fernanda', chair: 104, professional: user.id, day: 1, start: [9, 30], end: [10, 0] },
    { patient: 'Diego', chair: 102, professional: professional.id, day: 1, start: [11, 0], end: [12, 0] },
    { patient: 'Antonia', chair: 105, professional: user.id, day: 2, start: [15, 0], end: [15, 30] },
    { patient: 'Cristóbal', chair: 103, professional: professional.id, day: 2, start: [16, 0], end: [16, 30] },
  ];

  let createdCount = 0;
  for (const appt of sampleAppointments) {
    const startAt = at(appt.day, appt.start[0], appt.start[1]);
    const endAt = at(appt.day, appt.end[0], appt.end[1]);

    const overlapping = await prisma.appointment.findFirst({
      where: {
        chairId: chairs[appt.chair].id,
        status: { not: 'cancelada' },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (overlapping) continue;

    await prisma.appointment.create({
      data: {
        chairId: chairs[appt.chair].id,
        patientId: patients[appt.patient].id,
        professionalId: appt.professional,
        startAt,
        endAt,
      },
    });
    createdCount += 1;
  }
  console.log(`Citas de ejemplo creadas: ${createdCount}`);

  const sucursalNames = ['RIDS - Sede Central', 'RIDS - Sede Norte'];
  for (const name of sucursalNames) {
    await prisma.sucursal.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Sucursales listas: ${sucursalNames.join(', ')}`);

  const previsionNames = ['Fonasa', 'Isapre', 'Particular'];
  for (const name of previsionNames) {
    await prisma.prevision.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Previsiones listas: ${previsionNames.join(', ')}`);

  const convenios = [
    { name: 'Particular', discountPercent: 0 },
    { name: 'Convenio Empresa RIDS', discountPercent: 10 },
    { name: 'Convenio Seguro Complementario', discountPercent: 15 },
  ];
  for (const c of convenios) {
    await prisma.convenio.upsert({ where: { name: c.name }, update: {}, create: c });
  }
  console.log(`Convenios listos: ${convenios.map((c) => c.name).join(', ')}`);

  const prestaciones = [
    { code: 'CONS-01', name: 'Consulta de urgencia', basePrice: 15000 },
    { code: 'DIAG-01', name: 'Radiografía periapical', basePrice: 8000 },
    { code: 'PREV-01', name: 'Destartraje y pulido', basePrice: 25000 },
    { code: 'PREV-02', name: 'Aplicación de flúor', basePrice: 12000 },
    { code: 'PREV-03', name: 'Sellante de fosas y fisuras', basePrice: 15000 },
    { code: 'REST-01', name: 'Resina simple', basePrice: 30000 },
    { code: 'REST-02', name: 'Resina compuesta', basePrice: 45000 },
    { code: 'END-01', name: 'Endodoncia unirradicular', basePrice: 90000 },
    { code: 'END-02', name: 'Endodoncia multirradicular', basePrice: 130000 },
    { code: 'CIR-01', name: 'Extracción simple', basePrice: 35000 },
    { code: 'CIR-02', name: 'Extracción de tercer molar', basePrice: 70000 },
    { code: 'PROT-01', name: 'Corona metal-porcelana', basePrice: 180000 },
    { code: 'PROT-02', name: 'Implante dental', basePrice: 450000 },
    { code: 'EST-01', name: 'Blanqueamiento dental', basePrice: 80000 },
    { code: 'ORTO-01', name: 'Control de ortodoncia mensual', basePrice: 40000 },
  ];
  for (const p of prestaciones) {
    await prisma.prestacion.upsert({ where: { code: p.code }, update: {}, create: p });
  }
  console.log(`Prestaciones listas: ${prestaciones.length}`);

  const evolutionTemplates = [
    {
      name: 'Control de rutina',
      section: 'Control',
      content: '<p><strong>Motivo de consulta:</strong> Control de rutina.</p><p><strong>Examen clínico:</strong> Sin hallazgos relevantes.</p><p><strong>Indicaciones:</strong> Mantener higiene oral habitual.</p>',
    },
    {
      name: 'Post operatorio',
      section: 'Control',
      content: '<p><strong>Procedimiento realizado:</strong> </p><p><strong>Evolución:</strong> Paciente evoluciona favorablemente, sin complicaciones.</p><p><strong>Indicaciones:</strong> Reposo relativo, analgesia según indicación, control en 7 días.</p>',
    },
    {
      name: 'Anamnesis inicial',
      section: 'Diagnóstico',
      content: '<p><strong>Motivo de consulta:</strong> </p><p><strong>Antecedentes médicos:</strong> </p><p><strong>Antecedentes odontológicos:</strong> </p><p><strong>Diagnóstico:</strong> </p>',
    },
    {
      name: 'Alta odontológica',
      section: 'Alta',
      content: '<p>Paciente finaliza tratamiento en buenas condiciones clínicas. Se indica control periódico cada 6 meses.</p>',
    },
  ];
  for (const t of evolutionTemplates) {
    const existing = await prisma.evolutionTemplate.findFirst({ where: { name: t.name } });
    if (!existing) {
      await prisma.evolutionTemplate.create({ data: t });
    }
  }
  console.log(`Plantillas de evolución listas: ${evolutionTemplates.length}`);

  const sedeCentral = await prisma.sucursal.findUniqueOrThrow({ where: { name: 'RIDS - Sede Central' } });
  const previsionParticular = await prisma.prevision.findUniqueOrThrow({ where: { name: 'Particular' } });
  const previsionFonasa = await prisma.prevision.findUniqueOrThrow({ where: { name: 'Fonasa' } });
  const convenioParticular = await prisma.convenio.findUniqueOrThrow({ where: { name: 'Particular' } });
  const convenioEmpresa = await prisma.convenio.findUniqueOrThrow({ where: { name: 'Convenio Empresa RIDS' } });
  const convenioSeguro = await prisma.convenio.findUniqueOrThrow({ where: { name: 'Convenio Seguro Complementario' } });

  const prestacionByCode: Record<string, Awaited<ReturnType<typeof prisma.prestacion.findUniqueOrThrow>>> = {};
  for (const p of prestaciones) {
    prestacionByCode[p.code] = await prisma.prestacion.findUniqueOrThrow({ where: { code: p.code } });
  }

  function discounted(basePrice: number, discountPercent: number) {
    return Math.round(basePrice * (1 - discountPercent / 100));
  }

  type SeedItem = { code: string; toothNumber?: string; completed?: boolean };

  async function seedPlanWithLedger(options: {
    patientKey: string;
    name: string;
    professionalId: string;
    sucursalId: string;
    previsionId: string;
    convenio: { id: string; discountPercent: number };
    paymentMethod: string;
    seedItems: SeedItem[];
    movements: Array<{
      type: 'abono' | 'interes' | 'ajuste';
      amount: number;
      direction?: 'debe' | 'haber';
      linkToPlan: boolean;
      description: string;
      paymentMethod?: string;
    }>;
  }) {
    const patientId = patients[options.patientKey].id;
    const existing = await prisma.treatmentPlan.findFirst({ where: { patientId, name: options.name } });
    if (existing) return;

    const itemsData = options.seedItems.map((si) => {
      const prestacion = prestacionByCode[si.code];
      const cost = discounted(prestacion.basePrice, options.convenio.discountPercent);
      return {
        prestacionId: prestacion.id,
        toothNumber: si.toothNumber ?? null,
        description: prestacion.name,
        listPrice: prestacion.basePrice,
        convenioDiscountPercent: options.convenio.discountPercent,
        cost,
        completed: si.completed ?? false,
      };
    });
    const amount = itemsData.reduce((sum, i) => sum + i.cost, 0);
    const completedCount = itemsData.filter((i) => i.completed).length;
    const status =
      completedCount === 0 ? 'sin_iniciar' : completedCount === itemsData.length ? 'terminado' : 'en_tratamiento';

    const plan = await prisma.treatmentPlan.create({
      data: {
        patientId,
        professionalId: options.professionalId,
        sucursalId: options.sucursalId,
        previsionId: options.previsionId,
        convenioId: options.convenio.id,
        name: options.name,
        paymentMethod: options.paymentMethod,
        status,
        amount,
        items: { create: itemsData },
      },
    });

    for (const mv of options.movements) {
      let debe = 0;
      let haber = 0;
      if (mv.type === 'abono') haber = mv.amount;
      else if (mv.type === 'interes') debe = mv.amount;
      else if (mv.direction === 'haber') haber = mv.amount;
      else debe = mv.amount;

      await prisma.ledgerMovement.create({
        data: {
          patientId,
          treatmentPlanId: mv.linkToPlan ? plan.id : null,
          type: mv.type,
          debe,
          haber,
          description: mv.description,
          paymentMethod: mv.paymentMethod ?? null,
          registeredById: user.id,
        },
      });
    }
  }

  await seedPlanWithLedger({
    patientKey: 'Camila',
    name: 'Plan preventivo',
    professionalId: professional.id,
    sucursalId: sedeCentral.id,
    previsionId: previsionParticular.id,
    convenio: convenioParticular,
    paymentMethod: 'Contado',
    seedItems: [
      { code: 'PREV-01', completed: true },
      { code: 'REST-01', toothNumber: '1.6', completed: false },
    ],
    movements: [
      { type: 'abono', amount: 30000, linkToPlan: true, description: 'Abono en efectivo', paymentMethod: 'Efectivo' },
      { type: 'ajuste', amount: 5000, direction: 'haber', linkToPlan: true, description: 'Descuento por convenio empresa' },
      { type: 'abono', amount: 10000, linkToPlan: false, description: 'Abono libre transferencia', paymentMethod: 'Transferencia' },
    ],
  });

  await seedPlanWithLedger({
    patientKey: 'Matías',
    name: 'Rehabilitación protésica',
    professionalId: user.id,
    sucursalId: sedeCentral.id,
    previsionId: previsionFonasa.id,
    convenio: convenioEmpresa,
    paymentMethod: 'Cuotas',
    seedItems: [
      { code: 'DIAG-01', completed: true },
      { code: 'PROT-01', toothNumber: '2.6', completed: false },
    ],
    movements: [
      { type: 'abono', amount: 50000, linkToPlan: true, description: 'Primera cuota', paymentMethod: 'Tarjeta' },
      { type: 'interes', amount: 8000, linkToPlan: true, description: 'Interés por atraso en cuota' },
    ],
  });

  await seedPlanWithLedger({
    patientKey: 'Valentina',
    name: 'Implante unitario',
    professionalId: professional.id,
    sucursalId: sedeCentral.id,
    previsionId: previsionParticular.id,
    convenio: convenioSeguro,
    paymentMethod: 'Cuotas',
    seedItems: [{ code: 'PROT-02', toothNumber: '3.6', completed: false }],
    movements: [
      { type: 'abono', amount: 100000, linkToPlan: true, description: 'Abono inicial', paymentMethod: 'Transferencia' },
      { type: 'abono', amount: 20000, linkToPlan: false, description: 'Abono libre', paymentMethod: 'Efectivo' },
    ],
  });

  await seedPlanWithLedger({
    patientKey: 'Maria',
    name: 'Tratamiento de conducto',
    professionalId: professional.id,
    sucursalId: sedeCentral.id,
    previsionId: previsionFonasa.id,
    convenio: convenioSeguro,
    paymentMethod: 'Cuotas',
    seedItems: [
      { code: 'END-01', toothNumber: '2.6', completed: true },
      { code: 'PROT-01', toothNumber: '2.6', completed: false },
    ],
    movements: [
      { type: 'abono', amount: 150000, linkToPlan: true, description: 'Abono cuota inicial', paymentMethod: 'Transferencia' },
      { type: 'interes', amount: 5000, linkToPlan: true, description: 'Interés por atraso' },
    ],
  });

  await seedPlanWithLedger({
    patientKey: 'Maria',
    name: 'Control y limpieza',
    professionalId: professional.id,
    sucursalId: sedeCentral.id,
    previsionId: previsionFonasa.id,
    convenio: convenioParticular,
    paymentMethod: 'Contado',
    seedItems: [
      { code: 'PREV-01', completed: true },
      { code: 'PREV-02', completed: true },
    ],
    movements: [
      { type: 'abono', amount: 37000, linkToPlan: true, description: 'Pago total en efectivo', paymentMethod: 'Efectivo' },
    ],
  });

  console.log('Presupuestos y movimientos de cartola de ejemplo listos.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
