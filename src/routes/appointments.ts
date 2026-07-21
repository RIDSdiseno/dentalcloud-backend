import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { list, create, remove } from '../controllers/appointmentsController';

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('agenda'));
router.get('/', list);
router.post('/', create);
router.delete('/:id', remove);

export default router;
