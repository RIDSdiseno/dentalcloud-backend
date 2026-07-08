import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { login, refresh, logout, me } from '../controllers/authController';

const router = Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', authenticate, me);

export default router;
