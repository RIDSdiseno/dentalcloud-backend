import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { requireRolePermission } from '../middleware/requireRolePermission';
import { list, create, update, remove, uploadPhoto, removePhoto } from '../controllers/evolutionsController';

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('evoluciones'));
router.use(requireRolePermission('evoluciones'));
router.get('/', list);
router.post('/', create);
router.patch('/:id', update);
router.delete('/:id', remove);
router.post('/:id/photos', uploadMiddleware.single('file'), uploadPhoto);
router.delete('/photos/:photoId', removePhoto);

export default router;
