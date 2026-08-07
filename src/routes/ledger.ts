import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { requireRolePermission } from '../middleware/requireRolePermission';
import {
  summary,
  summaryPdf,
  balance,
  sendCartolaEmail,
  createMovement,
  removeMovement,
} from '../controllers/ledgerController';

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('cartola'));
router.use(requireRolePermission('cartola'));
router.get('/summary', summary);
router.get('/summary/pdf', summaryPdf);
router.get('/balance', balance);
router.post('/send-email', sendCartolaEmail);
router.post('/movements', createMovement);
router.delete('/movements/:id', removeMovement);

export default router;
