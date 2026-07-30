import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { requireRolePermission } from '../middleware/requireRolePermission';
import { list, create, remove } from '../controllers/observationsController';

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('observaciones'));
router.use(requireRolePermission('observaciones'));
router.get('/', list);
router.post('/', create);
router.delete('/:id', remove);

export default router;
