// backend/src/routes/notifications.js
import express from 'express';

const router = express.Router();
let clients = [];

router.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();
  
  clients.push(res);

  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
});

export function sendSSEMessage(data) {
  clients.forEach(res => res.write(`data: ${JSON.stringify(data)}\n\n`));
}

export default router;
