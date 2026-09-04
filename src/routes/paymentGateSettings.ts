import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import { getPaymentGateSettings, updatePaymentGateSettings } from '../controllers/clinicaSettingsController';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);
router.get('/', getPaymentGateSettings);
router.patch('/', updatePaymentGateSettings);

export default router;
