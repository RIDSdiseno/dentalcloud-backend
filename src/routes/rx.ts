import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import {
  examCatalog,
  patientStatus,
  syncPatient,
  listOrders,
  createRxOrder,
  sendOrder,
  orderPdf,
  orderZip,
  orderDetail,
  updateRxOrder,
  uploadOrderFilesController,
  deleteOrderFileController,
} from '../controllers/rxController';

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

router.use(authenticate);
router.get('/exam-catalog', examCatalog);
router.get('/patient-status', patientStatus);
router.post('/patient-sync', syncPatient);
router.get('/orders', listOrders);
router.post('/orders', createRxOrder);
router.get('/orders/:id', orderDetail);
router.put('/orders/:id', updateRxOrder);
router.patch('/orders/:id/send', sendOrder);
router.get('/orders/:id/pdf', orderPdf);
router.get('/orders/:id/zip', orderZip);
router.post('/orders/:id/files/:examinationId', uploadMiddleware.array('files', 10), uploadOrderFilesController);
router.delete('/order-files/:fileId', deleteOrderFileController);

export default router;
