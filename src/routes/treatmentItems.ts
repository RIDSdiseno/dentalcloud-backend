import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { requireRolePermission } from '../middleware/requireRolePermission';
import { update, remove } from '../controllers/treatmentItemsController';

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('tratamientos'));
router.use(requireRolePermission('tratamientos'));
router.patch('/:id', update);
router.delete('/:id', remove);

export default router;
