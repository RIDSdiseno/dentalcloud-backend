import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { list, create, update, remove, addItem } from '../controllers/treatmentPlansController';

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('tratamientos'));
router.get('/', list);
router.post('/', create);
router.patch('/:id', update);
router.delete('/:id', remove);
router.post('/:id/items', addItem);

export default router;
