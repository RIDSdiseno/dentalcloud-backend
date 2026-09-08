import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { list, create, findByRut } from '../controllers/consultationPaymentsController';

const router = Router();

router.use(authenticate);
router.get('/', list);
router.post('/', create);
router.get('/by-rut/:rut', findByRut);

export default router;
