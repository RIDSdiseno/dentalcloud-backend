import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import { getEmailSettings, updateEmailSettings, testEmailSettings } from '../controllers/emailSettingsController';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);
router.get('/', getEmailSettings);
router.put('/', updateEmailSettings);
router.post('/test', testEmailSettings);

export default router;
