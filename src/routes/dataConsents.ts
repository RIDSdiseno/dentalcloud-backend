import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { requireRolePermission } from '../middleware/requireRolePermission';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  getPdf,
  getText,
  getTypes,
  listForPatient,
  removeConsentTypePdf,
  respondInPerson,
  send,
  uploadConsentTypePdf,
} from '../controllers/dataConsentsController';

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('consentimientos'));
router.use(requireRolePermission('consentimientos'));
router.get('/types', getTypes);
router.get('/text/:consentTypeId', getText);
router.get('/patient/:patientId', listForPatient);
router.get('/:id/pdf', getPdf);
router.post('/', send);
router.post('/:patientId/:consentTypeId/respond', respondInPerson);
router.post('/types/:consentTypeId/pdf', requireAdmin, uploadMiddleware.single('pdf'), uploadConsentTypePdf);
router.delete('/types/:consentTypeId/pdf', requireAdmin, removeConsentTypePdf);

export default router;
