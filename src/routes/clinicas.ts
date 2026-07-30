import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin';
import {
  create,
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

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

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
router.post('/', uploadMiddleware.single('logo'), create);
router.patch('/:id', update);

export default router;
