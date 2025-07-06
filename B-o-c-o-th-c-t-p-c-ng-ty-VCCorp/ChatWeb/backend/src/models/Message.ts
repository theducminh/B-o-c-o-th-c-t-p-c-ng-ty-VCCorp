  import mongoose from 'mongoose';

  const messageSchema = new mongoose.Schema({
    _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    roomId: { type: String, required: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    content: { type: String, required: true },
    seenBy: { type: [String], default: [] }
  }, { timestamps: { createdAt: 'timestamp', updatedAt: false } });

  export default mongoose.model('Message', messageSchema);
