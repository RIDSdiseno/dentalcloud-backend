import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import { list, create, remove } from '../controllers/workSchedulesController';

const router = Router();

router.use(authenticate, requireAdmin);
router.get('/', list);
router.post('/', create);
router.delete('/:id', remove);

export default router;
