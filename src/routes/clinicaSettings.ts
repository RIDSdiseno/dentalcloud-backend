import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import { getRolePermissions, updateRolePermissions } from '../controllers/clinicaSettingsController';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);
router.get('/', getRolePermissions);
router.patch('/', updateRolePermissions);

export default router;
