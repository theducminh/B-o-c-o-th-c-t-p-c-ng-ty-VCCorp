import React, { use, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import socket from '../lib/socket';
import { ChatScreenProps } from '../types/ChatScreenProps';
import { Message } from '../types/Message';

export default function ChatScreen({ route, userId }: ChatScreenProps) {
  const { room } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);


  useEffect(() => {
  if (flatListRef.current && messages.length > 0) {
    flatListRef.current.scrollToEnd({ animated: true });
  }
}, [messages]);

  useEffect(() => {
    socket.emit('register', userId);
    socket.emit('joinRoom', room._id);

    socket.on('oldMessages', (oldMessages: Message[]) => {
      setMessages(oldMessages);
    });

    socket.on('receiveMessage', (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.off('oldMessages');
      socket.off('receiveMessage');
      
    };
  }, [room._id, userId]);

  const send = () => {
    if (!input.trim()) return;

   socket.emit('sendMessage', {
      roomId: room._id,
      senderId: userId,
      content: input.trim()
    });
    setInput('');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#f2f2f2' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        renderItem={({ item }) => {
          const isOwn = item.senderId === userId;
          const senderName = isOwn ? 'You' : item.senderName;

          return (
            <View
              style={{
                alignSelf: isOwn ? 'flex-end' : 'flex-start',
                backgroundColor: isOwn ? '#dcf8c6' : '#fff',
                borderRadius: 12,
                padding: 10,
                marginVertical: 4,
                maxWidth: '75%',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 1,
                elevation: 1,
              }}
            >
              <Text
                style={{
                  fontWeight: 'bold',
                  marginBottom: 4,
                  fontSize: 13,
                  color: '#444',
                }}
              >
                {senderName}
              </Text>
              <Text style={{ fontSize: 15 }}>{item.content}</Text>
            </View>
          );
        }}
      />

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          flexDirection: 'row',
          alignItems: 'center',
          padding: 10,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderColor: '#ddd',
        }}
      >
        <TextInput
          placeholder="Type a message..."
          value={input}
          onChangeText={setInput}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: '#f1f1f1',
          }}
        />
        <TouchableOpacity
          onPress={send}
          style={{
            marginLeft: 8,
            backgroundColor: '#007AFF',
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 20,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
