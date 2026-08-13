import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin';
import { requireFederationOrSuperAdmin } from '../middleware/requireFederationOrSuperAdmin';
import {
  create,
  getFederatedOverview,
  list,
  listAllAppointments,
  listAllDocuments,
  listAllEvolutions,
  listAllLedgerMovements,
  listAllObservations,
  listAllPatients,
  listAllTreatmentPlans,
  mirrorAppointment,
  mirrorClinica,
  mirrorConvenio,
  mirrorPatient,
  mirrorPrestacion,
  mirrorPrevision,
  mirrorTreatmentItem,
  mirrorTreatmentPlan,
  update,
  updateLogo,
} from '../controllers/clinicasController';

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

// Estas también las llama Dental-Demo-Back servidor-a-servidor (X-API-KEY),
// por eso van antes del authenticate/requireSuperAdmin de más abajo.
router.get('/', requireFederationOrSuperAdmin, list);
router.get('/pacientes', requireFederationOrSuperAdmin, listAllPatients);
router.get('/citas', requireFederationOrSuperAdmin, listAllAppointments);
router.post('/federated/mirror', requireFederationOrSuperAdmin, mirrorClinica);
router.post('/federated/patients/mirror', requireFederationOrSuperAdmin, mirrorPatient);
router.post('/federated/appointments/mirror', requireFederationOrSuperAdmin, mirrorAppointment);
router.post('/federated/treatment-plans/mirror', requireFederationOrSuperAdmin, mirrorTreatmentPlan);
router.post('/federated/treatment-plans/items/mirror', requireFederationOrSuperAdmin, mirrorTreatmentItem);
router.post('/federated/convenios/mirror', requireFederationOrSuperAdmin, mirrorConvenio);
router.post('/federated/prestaciones/mirror', requireFederationOrSuperAdmin, mirrorPrestacion);
router.post('/federated/previsiones/mirror', requireFederationOrSuperAdmin, mirrorPrevision);

router.use(authenticate);
router.use(requireSuperAdmin);
router.get('/tratamientos', listAllTreatmentPlans);
router.get('/documentos', listAllDocuments);
router.get('/cartola', listAllLedgerMovements);
router.get('/evoluciones', listAllEvolutions);
router.get('/observaciones', listAllObservations);
router.get('/federated/overview', getFederatedOverview);
router.post('/', uploadMiddleware.single('logo'), create);
router.patch('/:id', update);
router.patch('/:id/logo', uploadMiddleware.single('logo'), updateLogo);

export default router;
