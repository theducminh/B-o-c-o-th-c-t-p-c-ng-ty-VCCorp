import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './src/screens/LoginScreen';
import RoomListScreen from './src/screens/RoomListScreen';
import ChatScreen from './src/screens/ChatScreen';
import { RootStackParamList } from './src/types/Navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  console.log(' App rendered. userId:', userId);

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login" id={undefined}>
        <Stack.Screen name="Login">
          {(props) => <LoginScreen {...props} setUserId={setUserId} />}
        </Stack.Screen>
        <Stack.Screen name="Rooms">
          {(props) =>
            userId ? <RoomListScreen {...props} userId={userId} /> : null
          }
        </Stack.Screen>
        <Stack.Screen name="Chat">
          {(props) =>
            userId ? <ChatScreen {...props} userId={userId} /> : null
          }
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
