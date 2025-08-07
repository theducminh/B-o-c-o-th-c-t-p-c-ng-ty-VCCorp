import express from 'express';
import {
  createEvent,
  listEvents,
  updateEvent,
  deleteEvent
} from '../controllers/eventController.js';
import { requireAuth } from '../auth/jwt.js'; // nếu bạn đổi tên theo gợi ý trước

const router = express.Router();

// tất cả route cần auth
router.use(requireAuth);

// CRUD
router.get('/', listEvents);           // lấy events trong window (?from=&to=)
router.post('/', createEvent);         // tạo event mới
router.put('/:id', updateEvent);     // cập nhật partial
router.delete('/:id', deleteEvent);    // xóa

export default router;
