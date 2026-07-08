import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { list, create, update, remove } from '../controllers/chairsController';

const router = Router();

router.use(authenticate);
router.get('/', list);
router.post('/', create);
router.patch('/:id', update);
router.delete('/:id', remove);

export default router;
