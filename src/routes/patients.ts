import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { list, create, getOne, update } from '../controllers/patientsController';

const router = Router();

router.use(authenticate);
router.get('/', list);
router.post('/', create);
router.get('/:id', getOne);
router.patch('/:id', update);

export default router;
