export interface Message {
  _id: string;
  roomId: string;
  senderId: string;
  senderName: string; 
  content: string;
  timestamp: string;
  seenBy: string[];
}