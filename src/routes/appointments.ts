import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { requireRolePermission } from '../middleware/requireRolePermission';
import { list, create, remove } from '../controllers/appointmentsController';

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('agenda'));
router.use(requireRolePermission('agenda'));
router.get('/', list);
router.post('/', create);
router.delete('/:id', remove);

export default router;
