import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin';
import { requireFederationOrSuperAdmin } from '../middleware/requireFederationOrSuperAdmin';
import { requireFederationPairedTarget } from '../middleware/requireFederationPairedTarget';
import {
  connectFederation,
  create,
  disconnectFederation,
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
  mirrorLedgerMovement,
  mirrorPatient,
  mirrorPrestacion,
  mirrorPrevision,
  mirrorSucursal,
  mirrorTreatmentItem,
  mirrorTreatmentPlan,
  mirrorUser,
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
router.post('/federated/patients/mirror', requireFederationOrSuperAdmin, requireFederationPairedTarget, mirrorPatient);
router.post('/federated/users/mirror', requireFederationOrSuperAdmin, requireFederationPairedTarget, mirrorUser);
router.post('/federated/appointments/mirror', requireFederationOrSuperAdmin, requireFederationPairedTarget, mirrorAppointment);
router.post('/federated/treatment-plans/mirror', requireFederationOrSuperAdmin, requireFederationPairedTarget, mirrorTreatmentPlan);
router.post('/federated/treatment-plans/items/mirror', requireFederationOrSuperAdmin, requireFederationPairedTarget, mirrorTreatmentItem);
router.post('/federated/ledger-movements/mirror', requireFederationOrSuperAdmin, requireFederationPairedTarget, mirrorLedgerMovement);
router.post('/federated/convenios/mirror', requireFederationOrSuperAdmin, requireFederationPairedTarget, mirrorConvenio);
router.post('/federated/prestaciones/mirror', requireFederationOrSuperAdmin, requireFederationPairedTarget, mirrorPrestacion);
router.post('/federated/previsiones/mirror', requireFederationOrSuperAdmin, requireFederationPairedTarget, mirrorPrevision);
router.post('/federated/sucursales/mirror', requireFederationOrSuperAdmin, requireFederationPairedTarget, mirrorSucursal);

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
router.post('/:id/federation/connect', connectFederation);
router.post('/:id/federation/disconnect', disconnectFederation);

export default router;
