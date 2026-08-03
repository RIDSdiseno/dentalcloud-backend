import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { requireRolePermission } from '../middleware/requireRolePermission';
import { update, remove, uploadPhoto, removePhoto } from '../controllers/treatmentItemsController';

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('tratamientos'));
router.use(requireRolePermission('tratamientos'));
router.patch('/:id', update);
router.delete('/:id', remove);
router.post('/:id/photos', uploadMiddleware.single('file'), uploadPhoto);
router.delete('/photos/:photoId', removePhoto);

export default router;
