import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import { updateAgendaSettings } from '../controllers/clinicaSettingsController';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);
router.patch('/', updateAgendaSettings);

export default router;
