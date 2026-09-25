import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { requireRolePermission } from '../middleware/requireRolePermission';
import {
  list,
  create,
  getOne,
  update,
  uploadPhoto,
  uploadMotivoConsultaAudio,
  uploadExamPhoto,
  listExamPhotos,
  uploadExamPhotoMarkup,
  listExamPhotoMarkups,
  deleteExamPhotoMarkup,
  uploadExamVideo,
  listExamVideos,
  corroborateData,
  generateAnamnesisSummaryHandler,
} from '../controllers/patientsController';
import { createExamRequest } from '../controllers/documentsController';

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
router.patch('/:id/motivo-consulta-audio', uploadMiddleware.single('audio'), uploadMotivoConsultaAudio);
router.get('/:id/exam-photos', listExamPhotos);
router.patch('/:id/exam-photo/:slot', uploadMiddleware.single('photo'), uploadExamPhoto);
router.get('/:id/exam-photo-markups', listExamPhotoMarkups);
router.post('/:id/exam-photo/:examPhotoId/markup', uploadMiddleware.single('photo'), uploadExamPhotoMarkup);
router.delete('/:id/exam-photo-markups/:markupId', deleteExamPhotoMarkup);
router.get('/:id/exam-videos', listExamVideos);
router.patch('/:id/exam-video', uploadMiddleware.single('video'), uploadExamVideo);
router.post('/:id/corroborate-data', corroborateData);
router.post('/:id/anamnesis-summary', generateAnamnesisSummaryHandler);
router.post('/:id/exam-request', createExamRequest);

export default router;
