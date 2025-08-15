import express from 'express';
import {
  createTask,
  listTasks,
  updateTask,
  deleteTask,
  getTaskById
} from '../controllers/taskController.js';
import { requireAuth } from '../auth/jwt.js';

const router = express.Router();

router.use(requireAuth);


router.post('/', createTask);
router.get('/', listTasks);
router.get('/:id', getTaskById);
router.delete('/:id', deleteTask);
router.put('/:id', updateTask);

export default router;
