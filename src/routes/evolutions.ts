import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { list, create, update } from '../controllers/evolutionsController';

const router = Router();

router.use(authenticate);
router.get('/', list);
router.post('/', create);
router.patch('/:id', update);

export default router;
