import { Room } from './Room';

export type RootStackParamList = {
  Login: undefined;
  Rooms: undefined;
  Chat: { room: Room };
};