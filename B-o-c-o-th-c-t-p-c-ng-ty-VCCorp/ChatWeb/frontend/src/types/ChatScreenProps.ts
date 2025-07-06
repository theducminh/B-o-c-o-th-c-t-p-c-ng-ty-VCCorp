import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from './Navigation';

export type ChatScreenProps = NativeStackScreenProps<RootStackParamList, 'Chat'> & {
  userId: string;
};
