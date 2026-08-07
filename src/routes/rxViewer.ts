import { Router } from 'express';
import { dicomFileList, dicomFile } from '../controllers/rxViewerController';

// Sin `authenticate` a propósito — ver nota en rxViewerController.ts.
const router = Router();

router.get('/:token/file_list.txt', dicomFileList);
router.get('/:token/:filename', dicomFile);

export default router;
