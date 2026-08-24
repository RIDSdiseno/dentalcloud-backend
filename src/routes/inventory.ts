import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  listInventorySupplies,
  getInventorySupply,
  createInventorySupply,
  updateInventorySupply,
  archiveInventorySupply,
  listInventoryLots,
  createInventoryLot,
  updateInventoryLot,
  createInventoryLotMovement,
  getInventoryAlerts,
} from '../controllers/inventoryController';

const router = Router();

router.use(authenticate, requireAdmin);
router.get('/supplies', listInventorySupplies);
router.get('/supplies/:id', getInventorySupply);
router.post('/supplies', createInventorySupply);
router.patch('/supplies/:id', updateInventorySupply);
router.post('/supplies/:id/archive', archiveInventorySupply);
router.get('/supplies/:id/lots', listInventoryLots);
router.post('/supplies/:id/lots', createInventoryLot);
router.patch('/supplies/:id/lots/:lotId', updateInventoryLot);
router.post('/supplies/:id/lots/:lotId/movements', createInventoryLotMovement);
router.get('/alerts', getInventoryAlerts);

export default router;
