import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { requireRolePermission } from '../middleware/requireRolePermission';
import {
  list,
  create,
  createUrgencia,
  remove,
  markArrival,
  startAttention,
  finishAttention,
} from '../controllers/appointmentsController';

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('agenda'));
router.use(requireRolePermission('agenda'));
router.get('/', list);
router.post('/', create);
router.post('/urgencia', createUrgencia);
router.delete('/:id', remove);
router.patch('/:id/arrival', markArrival);
router.patch('/:id/start-attention', startAttention);
router.patch('/:id/finish', finishAttention);

export default router;
