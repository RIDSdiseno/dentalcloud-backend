import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { list, create, update } from '../controllers/evolutionsController';

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('evoluciones'));
router.get('/', list);
router.post('/', create);
router.patch('/:id', update);

export default router;
