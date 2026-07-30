import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { requireRolePermission } from '../middleware/requireRolePermission';
import { getText, getTypes, listForPatient, respondInPerson, send } from '../controllers/dataConsentsController';

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('consentimientos'));
router.use(requireRolePermission('consentimientos'));
router.get('/types', getTypes);
router.get('/text/:consentTypeId', getText);
router.get('/patient/:patientId', listForPatient);
router.post('/', send);
router.post('/:patientId/:consentTypeId/respond', respondInPerson);

export default router;
