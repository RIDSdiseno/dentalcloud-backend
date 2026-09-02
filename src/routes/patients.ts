import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { requireRolePermission } from '../middleware/requireRolePermission';
import { list, create, getOne, update, uploadPhoto } from '../controllers/patientsController';

const router = Router();
const uploadMiddleware = multer({ storage: multer.memoryStorage() });

router.use(authenticate);
router.use(requireModuleEnabled('pacientes'));
router.use(requireRolePermission('pacientes'));
router.get('/', list);
router.post('/', create);
router.get('/:id', getOne);
router.patch('/:id', update);
router.patch('/:id/photo', uploadMiddleware.single('photo'), uploadPhoto);

export default router;
