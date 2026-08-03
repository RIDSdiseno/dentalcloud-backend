import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';

import { list, create, update, remove, addItem, uploadPlanPhoto, removePlanPhoto } from '../controllers/treatmentPlansController';

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

import { requireRolePermission } from '../middleware/requireRolePermission';
import { list, create, update, remove, addItem } from '../controllers/treatmentPlansController';


const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('tratamientos'));
router.use(requireRolePermission('tratamientos'));
router.get('/', list);
router.post('/', create);
router.patch('/:id', update);
router.delete('/:id', remove);
router.post('/:id/items', addItem);
router.post('/:id/photos', uploadMiddleware.single('file'), uploadPlanPhoto);
router.delete('/photos/:photoId', removePlanPhoto);

export default router;
