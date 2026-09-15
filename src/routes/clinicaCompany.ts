import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import { getCompanyInfo, updateCompanyInfo, updateMyLogo } from '../controllers/clinicaSettingsController';

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

router.use(authenticate);
router.use(requireAdmin);
router.get('/', getCompanyInfo);
router.patch('/', updateCompanyInfo);
router.patch('/logo', uploadMiddleware.single('logo'), updateMyLogo);

export default router;
