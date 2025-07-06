import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  userID: { type: String, required: true, unique: true }, // bạn tự gán
  username: { type: String, required: true, unique: true }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
