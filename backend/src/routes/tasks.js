//routes/tasks.js
import express from 'express';
import {
  createTask,
  listTasks,
  updateTask,
  deleteTask,
  getTaskById,
  updateTaskStatus,
} from '../controllers/taskController.js';
import { requireAuth } from '../auth/jwt.js';

const router = express.Router();

router.use(requireAuth);


router.post('/', createTask);
router.get('/', listTasks);
router.get('/:id', getTaskById);
router.delete('/:id', deleteTask);
router.put('/:id', updateTask);
router.put('/:id/status', updateTaskStatus);

export default router;
