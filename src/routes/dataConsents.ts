import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { getText, respondInPerson, send } from '../controllers/dataConsentsController';

const router = Router();

router.use(authenticate);
router.get('/text', getText);
router.use(requireModuleEnabled('consentimientos'));
router.post('/', send);
router.post('/:patientId/respond', respondInPerson);

export default router;
