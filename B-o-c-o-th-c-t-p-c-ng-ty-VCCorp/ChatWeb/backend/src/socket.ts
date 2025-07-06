import { Server, Socket } from 'socket.io';
import Message from './models/Message';
import Room from './models/Room';
import User from './models/User';

const onlineUsers = new Map<string, string>();

export function initSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log('User connected', socket.id);

    socket.on('register', (userId: string) => {
      onlineUsers.set(userId, socket.id);
    });

   socket.on('joinRoom', async (roomId: string) => {
  socket.join(roomId);
  socket.to(roomId).emit('userJoined', socket.id);

  const messages = await Message.find({ roomId })
    .sort({ timestamp: 1 })
    .lean();

  // Nếu message nào thiếu senderName → thêm vào

  const userCache = new Map<string, string>();

  const messagesWithName = await Promise.all(
    messages.map(async (msg) => {
      if (msg.senderName) return msg;

      if (!userCache.has(msg.senderId)) {
      const user = await User.findOne({ userID: msg.senderId });
      userCache.set(msg.senderId, user?.username || 'Unknown');
    }

      return {
        ...msg,
        senderName: userCache.get(msg.senderId),
      };
    })
  );

  socket.emit('oldMessages', messagesWithName);
});


    // Tin nhắn mới được gửi và lưu vào cơ sở dữ liệu
  socket.on('sendMessage', async ({ roomId, senderId, content }) => {
    try {
      const user = await User.findOne({ userID: senderId }); // Tìm user theo senderId
      if (!user) {
        console.error('User not found:', senderId);
        return;
      }

      // Kiểm tra kỹ user.userID và user.username
      if (!user.userID || !user.username) {
        console.error(' User thiếu thông tin userID hoặc username');
        return;
      }

      const message = await Message.create({
        roomId,
        senderId: user.userID, 
        senderName: user.username,
        content,
        timestamp: new Date(),
        seenBy: [user.userID] 
      });

      io.to(roomId).emit('receiveMessage', message);
    } catch (err) {
      console.error(' sendMessage error:', err);
    }
  });


    // Cập nhật trạng thái đã xem của tin nhắn

   socket.on('seenMessage', async ({ messageId, userId }) => {
  try {
    await Message.findByIdAndUpdate(messageId, {
      $addToSet: { seenBy: userId }
    });
  } catch (err) {
    console.error(' seenMessage error:', err);
  }
});
    socket.on('typing', ({ roomId, userId }) => {
      socket.to(roomId).emit('typing', userId);
    });

    socket.on('stopTyping', ({ roomId, userId }) => {
      socket.to(roomId).emit('stopTyping', userId);
    });

    // Xử lý khi người dùng ngắt kết nối
    socket.on('disconnecting', () => {
      socket.rooms.forEach((roomId) => {
        socket.to(roomId).emit('userLeft', socket.id);
      });
    });

    // Xử lý khi người dùng ngắt kết nối hoàn toàn

    socket.on('disconnect', () => {
      console.log('User disconnected', socket.id);
      for (const [uid, sid] of onlineUsers.entries()) {
        if (sid === socket.id) {
          onlineUsers.delete(uid);
          break;
        }
      }
    });
  });
}