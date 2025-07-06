import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import api from '../lib/api';
import { Room } from '../types/Room';

export default function RoomListScreen({ navigation, userId }: any) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!userId) {
      alert(' Không có userId, quay lại màn hình Login');
      navigation.replace('Login');
      return;
    }

    console.log('Fetching rooms for userId:', userId);

    api.get(`/rooms/${userId}`)
      .then((res) => {
        console.log('Rooms fetched:', res.data);
        setRooms(res.data);
      })
      .catch((err) => {
        console.error(' Fetch rooms error:', err);
        alert( 'Không thể tải danh sách phòng');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userId]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text>Đang tải phòng...</Text>
      </View>
    );
  }

  if (rooms.length === 0) {
    alert('Hãy tạo phòng mới từ backend hoặc thêm thành viên vào!');
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Không có phòng nào. Hãy tạo phòng mới từ backend hoặc thêm thành viên vào!</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <FlatList
        data={rooms}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Chat', { room: item })}
            style={{ padding: 12, borderBottomWidth: 1 }}
          >
            <Text style={{ fontSize: 16 }}>{item.name || item._id}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
