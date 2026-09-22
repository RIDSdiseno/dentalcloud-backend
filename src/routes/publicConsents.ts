import { Router } from 'express';
import { publicConsentRateLimiter } from '../middleware/rateLimiters';
import { getByToken, respond } from '../controllers/dataConsentsController';

const router = Router();

router.use(publicConsentRateLimiter);
router.get('/:token', getByToken);
router.post('/:token/respond', respond);

export default router;
