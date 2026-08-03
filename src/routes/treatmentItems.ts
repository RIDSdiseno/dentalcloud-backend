import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { update, remove } from '../controllers/treatmentItemsController';

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('tratamientos'));
router.use(requireRolePermission('tratamientos'));
router.patch('/:id', update);
router.delete('/:id', remove);
router.post('/:id/photos', uploadMiddleware.single('file'), uploadPhoto);
router.delete('/photos/:photoId', removePhoto);

export default router;
