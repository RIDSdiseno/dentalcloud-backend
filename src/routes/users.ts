import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import { list, create, update, importFromDimage } from '../controllers/usersController';

const router = Router();

router.use(authenticate, requireAdmin);
router.get('/', list);
router.post('/', create);
router.patch('/:id', update);
router.post('/import-from-dimage', importFromDimage);

export default router;
