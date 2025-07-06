import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  _id: String,
  name: String,
  type: String,
  members: [String]
});

export default mongoose.model('Room', roomSchema);