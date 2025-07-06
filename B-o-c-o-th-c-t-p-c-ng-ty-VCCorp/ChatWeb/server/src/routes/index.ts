import express, { Request, Response } from 'express';
import User from '../models/User';
import Room from '../models/Room';

const router = express.Router();

router.get('/ping', (req: Request, res: Response) => {
  res.send('pong');
});

// User routes
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await User.find({}, 'userID username');
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/rooms', async (req: Request, res: Response) => {
  try {
    const room = await Room.create(req.body);
    res.status(201).json(room);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create room' });
  }
});

router.get('/rooms/:userId', async (req: Request, res: Response) => {
  try {
    const rooms = await Room.find({ members: req.params.userId });
    res.status(200).json(rooms);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

export default router;