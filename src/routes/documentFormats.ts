import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import { list, create, update, remove } from '../controllers/documentFormatsController';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);
router.get('/', list);
router.post('/', create);
router.patch('/:id', update);
router.delete('/:id', remove);

export default router;
