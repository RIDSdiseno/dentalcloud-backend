import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import { list, create, update } from '../controllers/usersController';

const router = Router();

router.use(authenticate, requireAdmin);
router.get('/', list);
router.post('/', create);
router.patch('/:id', update);

export default router;
