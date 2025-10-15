import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl } from 'react-native';

const API_URL = 'http://localhost:3001'; // 如需真機測試請改為內網IP

const typeOptions = [
  { label: '圖片', value: 'image' },
  { label: '影片', value: 'video' }
];
const sortOptions = [
  { label: '時間新→舊', value: 'createdAt_desc' },
  { label: '時間舊→新', value: 'createdAt_asc' },
  { label: '檔名A→Z', value: 'filename_asc' },
  { label: '檔名Z→A', value: 'filename_desc' },
  { label: '檔案小→大', value: 'size_asc' },
  { label: '檔案大→小', value: 'size_desc' }
];

type MediaItem = {
  _id: string;
  type: string;
  url: string;
  filename?: string;
};

export default function MediaWallScreen() {
  const groupId = 'demoGroupId'; // TODO: 串接實際群組ID
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [before, setBefore] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [typeFilters, setTypeFilters] = useState(['image', 'video']);
  const [sort, setSort] = useState('createdAt_desc');

  // 載入媒體訊息
  const fetchMedia = async (reset = false) => {
    if (loading || !groupId || (!hasMore && !reset)) return;
    setLoading(true);
    let url = `${API_URL}/api/group/${groupId}/messages?limit=20`;
    if (typeFilters.length > 0) url += `&type=${encodeURIComponent(typeFilters.join(','))}`;
    if (!reset && before) url += `&before=${before}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (sort) url += `&sort=${encodeURIComponent(sort)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (res.ok && data.messages) {
      setMediaList((prev: MediaItem[]) => reset ? data.messages : [...prev, ...data.messages]);
      setHasMore(data.hasMore);
      if (data.messages.length > 0) setBefore(data.messages[data.messages.length - 1]._id);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    setMediaList([]);
    setHasMore(true);
    setBefore('');
    fetchMedia(true);
    // eslint-disable-next-line
  }, [groupId, search, typeFilters, sort]);

  const handleEndReached = () => {
    if (!loading && hasMore) fetchMedia();
  };
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMedia(true);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#fafbfc', padding: 8 }}>
      {/* 搜尋/篩選/排序 UI */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          onSubmitEditing={() => setSearch(searchInput)}
          placeholder="搜尋檔名/關鍵字..."
          style={{ flex: 1, minWidth: 120, backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#ccc', padding: 6, marginRight: 8 }}
        />
        <TouchableOpacity onPress={() => setSearchInput('')}><Text style={{ color: '#1976d2' }}>清除</Text></TouchableOpacity>
        {typeOptions.map(opt => (
          <TouchableOpacity key={opt.value} onPress={() => setTypeFilters(f => f.includes(opt.value) ? f.filter(x => x !== opt.value) : [...f, opt.value])} style={{ backgroundColor: typeFilters.includes(opt.value) ? '#bde0fe' : '#eee', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginRight: 4 }}>
            <Text style={{ color: '#1976d2', fontSize: 13 }}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
        <Text style={{ marginLeft: 8 }}>排序</Text>
        {/* Web only: select，若需支援原生請用 Picker */}
        <select value={sort} onChange={e => setSort(e.target.value)} style={{ minWidth: 100, height: 32, borderRadius: 6, borderColor: '#ccc' }}>
          {sortOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </View>
      {/* 媒體縮圖列表 */}
      <FlatList
        data={mediaList}
        keyExtractor={item => item._id}
        numColumns={3}
        renderItem={({ item }: { item: MediaItem }) => (
          <View style={{ flex: 1 / 3, alignItems: 'center', margin: 4 }}>
            <TouchableOpacity>
              {item.type === 'image' ? (
                <Image source={{ uri: API_URL + item.url }} style={{ width: 100, height: 70, borderRadius: 8, marginBottom: 4 }} />
              ) : item.type === 'video' ? (
                <View style={{ position: 'relative' }}>
                  <Image source={{ uri: API_URL + item.url + '?thumb=1' }} style={{ width: 100, height: 70, borderRadius: 8, marginBottom: 4, backgroundColor: '#ddd' }} />
                  <Text style={{ position: 'absolute', right: 6, top: 6, color: '#fff', backgroundColor: '#0008', borderRadius: 10, paddingHorizontal: 4, fontSize: 12 }}>▶</Text>
                </View>
              ) : null}
              <Text numberOfLines={1} style={{ fontSize: 12, color: '#333', maxWidth: 100 }}>{item.filename}</Text>
            </TouchableOpacity>
          </View>
        )}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.2}
        ListFooterComponent={loading ? <ActivityIndicator style={{ margin: 12 }} /> : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={!loading ? <Text style={{ textAlign: 'center', color: '#888', margin: 24 }}>尚無媒體訊息</Text> : null}
      />
    </View>
  );
} 