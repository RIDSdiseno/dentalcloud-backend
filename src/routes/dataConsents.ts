import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { getText, getTypes, listForPatient, respondInPerson, send } from '../controllers/dataConsentsController';

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('consentimientos'));
router.get('/types', getTypes);
router.get('/text/:consentTypeId', getText);
router.get('/patient/:patientId', listForPatient);
router.post('/', send);
router.post('/:patientId/:consentTypeId/respond', respondInPerson);

export default router;
