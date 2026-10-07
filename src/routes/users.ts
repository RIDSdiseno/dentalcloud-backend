import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  list,
  create,
  update,
  updatePassword,
  importFromDimage,
  getPermissions,
  updatePermissions,
} from '../controllers/usersController';

const router = Router();

router.use(authenticate, requireAdmin);
router.get('/', list);
router.post('/', create);
router.patch('/:id', update);
router.patch('/:id/password', updatePassword);
router.get('/:id/permissions', getPermissions);
router.patch('/:id/permissions', updatePermissions);
router.post('/import-from-dimage', importFromDimage);

export default router;
