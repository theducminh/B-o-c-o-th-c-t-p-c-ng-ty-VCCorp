import express from 'express';
import {
  createTask,
  listTasks,
  updateTask
} from '../controllers/taskController.js';
import { requireAuth } from '../auth/jwt.js';

const router = express.Router();

router.use(requireAuth);

// tạo và lấy
router.post('/', createTask);
router.get('/', listTasks);


// cập nhật task (partial)
router.patch('/:id', updateTask);

export default router;
