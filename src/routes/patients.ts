import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { list, create, getOne, update } from '../controllers/patientsController';

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('pacientes'));
router.get('/', list);
router.post('/', create);
router.get('/:id', getOne);
router.patch('/:id', update);

export default router;
