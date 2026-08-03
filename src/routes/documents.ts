import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { requireRolePermission } from '../middleware/requireRolePermission';
import { list, upload, remove } from '../controllers/documentsController';

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

router.use(authenticate);
router.use(requireModuleEnabled('documentosClinicos'));
router.use(requireRolePermission('documentosClinicos'));
router.get('/', list);
router.post('/', uploadMiddleware.single('file'), upload);
router.delete('/:id', remove);

export default router;
