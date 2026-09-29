import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { loginRateLimiter, refreshRateLimiter } from '../middleware/rateLimiters';
import { login, refresh, logout, me, updateMySignature, deleteMySignature } from '../controllers/authController';

const router = Router();

router.post('/login', loginRateLimiter, login);
router.post('/refresh', refreshRateLimiter, refresh);
router.post('/logout', logout);
router.get('/me', authenticate, me);
router.patch('/me/signature', authenticate, updateMySignature);
router.delete('/me/signature', authenticate, deleteMySignature);

export default router;
