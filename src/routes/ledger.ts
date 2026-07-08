import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { summary, createMovement, removeMovement } from '../controllers/ledgerController';

const router = Router();

router.use(authenticate);
router.get('/summary', summary);
router.post('/movements', createMovement);
router.delete('/movements/:id', removeMovement);

export default router;
