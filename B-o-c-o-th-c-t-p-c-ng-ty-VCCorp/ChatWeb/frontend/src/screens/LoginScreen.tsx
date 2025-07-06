import React, { useState } from 'react';
import { View, TextInput, Button, Alert, StyleSheet } from 'react-native';
import api from '../lib/api';

export default function LoginScreen({ navigation, setUserId }: any) {
  const [username, setUsername] = useState('');

  const handleLogin = async () => {
    if (!username.trim()) {
      alert('Vui lòng nhập tên người dùng');
      return;
    }

  try {
  const res = await api.get('/users'); 

  // Assuming the API returns a list of users
  if (!Array.isArray(res.data)) {
  console.log('🚨 Dữ liệu trả về không phải mảng:', res.data);
  alert('Lỗi backend hoặc CORS. Kiểm tra console!');
  return;
}

  if (!res.data || !Array.isArray(res.data)) {
    alert('Đăng nhập thất bại, có lỗi xảy ra 0');
    return;
  }
  const users = res.data;

  const foundUser = users.find((u: any) => u.username === username.trim());

  if (foundUser) {
    setUserId(foundUser.userID); // Assuming userID is the unique identifier
    console.log('Đăng nhập thành công:', foundUser.userID);
    alert(`Đăng nhập thành công với tên người dùng: ${foundUser.username} ${foundUser.userID}`);
    navigation.navigate('Rooms');
  } else {
    alert('Tên người dùng không tồn tại');
  }
} catch (err) {
  console.error('Login failed:', err);
  alert('Đăng nhập thất bại, có lỗi xảy ra 1');
}
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Nhập tên người dùng"
        value={username}
        onChangeText={setUsername}
      />
      <Button title="Đăng nhập" onPress={handleLogin} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
    borderRadius: 6,
  },
});
