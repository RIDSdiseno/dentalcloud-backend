import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin';
import {
  list,
  listAllAppointments,
  listAllDocuments,
  listAllEvolutions,
  listAllLedgerMovements,
  listAllObservations,
  listAllPatients,
  listAllTreatmentPlans,
  update,
} from '../controllers/clinicasController';

const router = Router();

router.use(authenticate);
router.use(requireSuperAdmin);
router.get('/', list);
router.get('/pacientes', listAllPatients);
router.get('/citas', listAllAppointments);
router.get('/tratamientos', listAllTreatmentPlans);
router.get('/documentos', listAllDocuments);
router.get('/cartola', listAllLedgerMovements);
router.get('/evoluciones', listAllEvolutions);
router.get('/observaciones', listAllObservations);
router.patch('/:id', update);

export default router;
