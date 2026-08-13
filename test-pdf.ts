import { buildTreatmentPlanReportPdf } from './src/lib/treatmentPlanReportPdf';

const testData = {
  clinica: { name: 'Clínica Test', logoUrl: null },
  patient: { firstName: 'Juan', lastName: 'Perez', rut: '12345678-9', birthDate: null },
  plan: { 
    number: 1, 
    name: null, 
    status: 'alta', 
    amount: 1000, 
    notes: null, 
    createdAt: new Date(), 
    completedAt: new Date(), 
    professional: null, 
    sucursal: null, 
    convenio: null, 
    prevision: null 
  },
  items: [{ 
    description: 'Test', 
    toothNumber: null, 
    cost: 1000, 
    completed: true, 
    treatedAt: new Date(), 
    treatedBy: null, 
    notes: null 
  }],
  photos: []
};

buildTreatmentPlanReportPdf(testData).then(buffer => {
  console.log('Tamaño del buffer:', buffer.length);
  console.log('Primeros 10 bytes (hex):', buffer.slice(0, 10).toString('hex'));
  console.log('Primeros 10 bytes (texto):', buffer.slice(0, 10).toString());
  console.log('¿Empieza con %PDF?', buffer.slice(0, 4).toString() === '%PDF');
  console.log('Primeros 4 bytes en hex:', buffer.slice(0, 4).toString('hex'));
  
  // Guardar el PDF para inspeccionarlo
  const fs = require('fs');
  fs.writeFileSync('test-output.pdf', buffer);
  console.log('PDF guardado como test-output.pdf');
});