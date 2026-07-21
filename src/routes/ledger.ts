import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { summary, createMovement, removeMovement } from '../controllers/ledgerController';

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('cartola'));
router.get('/summary', summary);
router.post('/movements', createMovement);
router.delete('/movements/:id', removeMovement);

export default router;
