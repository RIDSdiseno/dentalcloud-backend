import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';

import {
  list,
  create,
  update,
  remove,
  addItem,
  addEdit,
  uploadPlanPhoto,
  removePlanPhoto,
  getReport,
} from '../controllers/treatmentPlansController';
import { requireRolePermission } from '../middleware/requireRolePermission';

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});


const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('tratamientos'));
router.use(requireRolePermission('tratamientos'));
router.get('/', list);
router.post('/', requireRolePermission('crearPresupuestos'), create);
router.patch('/:id', update);
router.delete('/:id', remove);
router.post('/:id/items', addItem);
router.post('/:id/edits', addEdit);
router.post('/:id/photos', uploadMiddleware.single('file'), uploadPlanPhoto);
router.delete('/photos/:photoId', removePlanPhoto);
router.get('/:id/report', getReport);

export default router;
