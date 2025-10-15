import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'http://localhost:3001';

type Tag = { name: string; color: string };

export default function TagManagerScreen({ route, navigation }: { route: any; navigation: any }) {
  const { groupId } = route.params;
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState('');
  const [newColor, setNewColor] = useState('#1976d2');
  const [editing, setEditing] = useState<Tag | null>(null); // {name, color}
  const [rename, setRename] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchTags = async () => {
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/group/${groupId}/tags`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setTags(data.tags || []);
    setLoading(false);
  };
  useEffect(() => { fetchTags(); }, [groupId]);

  const addTag = async () => {
    if (!newTag) return;
    setLoading(true);
    setError('');
    const token = await AsyncStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/group/${groupId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newTag, color: newColor })
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || '新增失敗');
    setNewTag('');
    setNewColor('#1976d2');
    fetchTags();
    setLoading(false);
  };
  const deleteTag = async (name: string) => {
    Alert.alert('刪除標籤', `確定刪除標籤「${name}」？`, [
      { text: '取消', style: 'cancel' },
      { text: '確定', style: 'destructive', onPress: async () => {
        setLoading(true);
        const token = await AsyncStorage.getItem('token');
        await fetch(`${API_URL}/api/group/${groupId}/tags/${encodeURIComponent(name)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        fetchTags();
        setLoading(false);
      }}
    ]);
  };
  const startEdit = (tag: Tag) => {
    setEditing(tag);
    setRename(tag.name);
  };
  const saveRename = async (oldName: string) => {
    if (!rename || rename === oldName) { setEditing(null); return; }
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    await fetch(`${API_URL}/api/group/${groupId}/tags/${encodeURIComponent(oldName)}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ newName: rename })
    });
    setEditing(null);
    fetchTags();
    setLoading(false);
  };
  const saveColor = async (name: string, color: string) => {
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    await fetch(`${API_URL}/api/group/${groupId}/tags/${encodeURIComponent(name)}/color`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ color })
    });
    fetchTags();
    setLoading(false);
  };
  const TagCount = ({ name }: { name: string }) => {
    const [count, setCount] = useState(0);
    useEffect(() => {
      AsyncStorage.getItem('token').then(token => {
        fetch(`${API_URL}/api/group/${groupId}/tags/${encodeURIComponent(name)}/count`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(res => res.json())
          .then(data => setCount(data.count || 0));
      });
    }, [name]);
    return <Text>{count}</Text>;
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 16 }}>標籤管理</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <TextInput value={newTag} onChangeText={setNewTag} placeholder="標籤名稱" style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, marginRight: 8 }} />
        <Text>顏色：</Text>
        <TextInput value={newColor} onChangeText={setNewColor} style={{ width: 60, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, marginRight: 8 }} />
        <TouchableOpacity onPress={addTag} disabled={loading} style={{ backgroundColor: '#1976d2', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 16 }}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>新增</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={{ color: 'red', marginBottom: 8 }}>{error}</Text> : null}
      {loading && <ActivityIndicator style={{ marginBottom: 8 }} />}
      <FlatList
        data={tags}
        keyExtractor={(item: Tag) => item.name}
        renderItem={({ item: tag }: { item: Tag }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee' }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: tag.color, borderWidth: 1, borderColor: '#ccc', marginRight: 12 }} />
            {editing && editing.name === tag.name ? (
              <TextInput value={rename} onChangeText={setRename} onBlur={() => saveRename(tag.name)} onSubmitEditing={() => saveRename(tag.name)} style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 6, marginRight: 8 }} autoFocus />
            ) : (
              <Text style={{ flex: 1, fontSize: 16 }} onLongPress={() => startEdit(tag)}>{tag.name}</Text>
            )}
            <TagCount name={tag.name} />
            <Text style={{ marginHorizontal: 8, color: '#888' }}>次</Text>
            <TextInput value={tag.color} onChangeText={c => saveColor(tag.name, c)} style={{ width: 60, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 6, marginRight: 8 }} />
            <TouchableOpacity onPress={() => startEdit(tag)} style={{ marginRight: 8 }}>
              <Text style={{ color: '#1976d2' }}>重命名</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deleteTag(tag.name)}>
              <Text style={{ color: '#e53935' }}>刪除</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: '#888', textAlign: 'center', marginTop: 32 }}>尚無標籤</Text>}
      />
    </View>
  );
} 