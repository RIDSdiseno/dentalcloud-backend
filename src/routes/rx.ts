import os from 'os';
import crypto from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireRxEnabled } from '../middleware/requireRxEnabled';
import { requireRolePermission } from '../middleware/requireRolePermission';
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
  dicomViewerToken,
  updateRxOrder,
  uploadOrderFilesController,
  deleteOrderFileController,
} from '../controllers/rxController';

// Los estudios CBCT (Cone Beam) se entregan como ZIP con series DICOM completas
// y pueden pesar hasta ~3 GB — muy por sobre lo que conviene bufferear en RAM,
// así que se guardan como temporales en disco (streaming) y no en memoria.
const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => cb(null, `rx-upload-${crypto.randomUUID()}-${file.originalname}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024 * 1024 },
});

const router = Router();

router.use(authenticate);
router.use(requireRxEnabled);
router.use(requireRolePermission('rx'));
router.get('/exam-catalog', examCatalog);
router.get('/patient-status', patientStatus);
router.post('/patient-sync', syncPatient);
router.get('/orders', listOrders);
router.post('/orders', createRxOrder);
router.get('/orders/:id', orderDetail);
router.post('/orders/:id/dicom-viewer-token', dicomViewerToken);
router.put('/orders/:id', updateRxOrder);
router.patch('/orders/:id/send', sendOrder);
router.get('/orders/:id/pdf', orderPdf);
router.get('/orders/:id/zip', orderZip);
router.post('/orders/:id/files/:examinationId', uploadMiddleware.array('files', 10), uploadOrderFilesController);
router.delete('/order-files/:fileId', deleteOrderFileController);

export default router;
