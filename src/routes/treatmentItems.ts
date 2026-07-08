import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { update, remove } from '../controllers/treatmentItemsController';

const router = Router();

router.use(authenticate);
router.patch('/:id', update);
router.delete('/:id', remove);

export default router;
