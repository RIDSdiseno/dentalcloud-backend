import { Router } from 'express';
import { getByToken, respond } from '../controllers/dataConsentsController';

const router = Router();

router.get('/:token', getByToken);
router.post('/:token/respond', respond);

export default router;
