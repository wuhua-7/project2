import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl, StyleSheet, Pressable, Animated, Alert, Switch, Modal, TouchableWithoutFeedback } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

const API_URL = 'http://localhost:3001'; // 如需真機測試請改為內網IP

const typeOptions = [
  { label: 'PDF', value: 'pdf' },
  { label: 'Word', value: 'word' },
  { label: 'Excel', value: 'excel' },
  { label: '壓縮檔', value: 'zip' },
  { label: '圖片', value: 'image' },
  { label: '影片', value: 'video' },
  { label: '音訊', value: 'audio' },
  { label: '純文字', value: 'text' },
  { label: '其他', value: 'file' }
];
const sortOptions = [
  { label: '時間新→舊', value: 'createdAt_desc' },
  { label: '時間舊→新', value: 'createdAt_asc' },
  { label: '檔名A→Z', value: 'filename_asc' },
  { label: '檔名Z→A', value: 'filename_desc' },
  { label: '檔案小→大', value: 'size_asc' },
  { label: '檔案大→小', value: 'size_desc' }
];

type FileItem = {
  _id: string;
  filename: string;
  mimetype?: string;
  size?: number;
  url: string;
  tags?: string[]; // 新增 tags 屬性
  archived?: boolean; // 新增 archived 屬性
};

function formatSize(size?: number) {
  if (!size) return '';
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / 1024 / 1024).toFixed(1) + ' MB';
}

export default function FileCabinetScreen() {
  const groupId = 'demoGroupId'; // TODO: 串接實際群組ID
  const isAdmin = true; // TODO: 串接實際權限
  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [before, setBefore] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [sort, setSort] = useState('createdAt_desc');
  // 多選狀態
  const [multiSelect, setMultiSelect] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const allChecked = fileList.length > 0 && selected.length === fileList.length;
  // 勾選動畫 state
  const [checkboxScale] = useState(() => new Map<string, Animated.Value>());
  const [tagFilters, setTagFilters] = useState<string[]>([]); // 標籤篩選
  const [showArchived, setShowArchived] = useState(false); // 歸檔篩選
  const [allTags, setAllTags] = useState<string[]>([]); // 所有標籤
  const [tagSuggestVisible, setTagSuggestVisible] = useState(false);
  const [tagInputFocus, setTagInputFocus] = useState(false);
  const tagInputRef = useRef<TextInput>(null);
  const [showTagModal, setShowTagModal] = useState(false);
  const [tagModalType, setTagModalType] = useState(''); // 'add' | 'remove'
  const [tagInput, setTagInput] = useState('');
  const [tagColors, setTagColors] = useState<{[k:string]:string}>({});

  const navigation = useNavigation();

  const animateCheckbox = (id: string) => {
    if (!checkboxScale.has(id)) checkboxScale.set(id, new Animated.Value(1));
    const anim = checkboxScale.get(id)!;
    anim.setValue(0.8);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true }).start();
  };

  const toggleSelect = (id: string) => {
    setSelected(sel => {
      const next = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id];
      animateCheckbox(id);
      return next;
    });
  };
  const toggleSelectAll = () => setSelected(allChecked ? [] : fileList.map(f => f._id));
  const clearSelect = () => { setSelected([]); setMultiSelect(false); };

  // 載入檔案訊息
  const fetchFiles = async (reset = false) => {
    if (loading || !groupId || (!hasMore && !reset)) return;
    setLoading(true);
    let url = `${API_URL}/api/group/${groupId}/messages?type=file&limit=20`;
    if (!reset && before) url += `&before=${before}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (sort) url += `&sort=${encodeURIComponent(sort)}`;
    if (typeFilters.length > 0) url += `&mimetype=${encodeURIComponent(typeFilters.join(','))}`;
    if (tagFilters.length > 0) url += `&tags=${encodeURIComponent(tagFilters.join(','))}`;
    if (showArchived) url += `&archived=true`;
    const res = await fetch(url);
    const data = await res.json();
    if (res.ok && data.messages) {
      setFileList((prev: FileItem[]) => reset ? data.messages : [...prev, ...data.messages]);
      setHasMore(data.hasMore);
      if (data.messages.length > 0) setBefore(data.messages[data.messages.length - 1]._id);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    setFileList([]);
    setHasMore(true);
    setBefore('');
    fetchFiles(true);
    // eslint-disable-next-line
  }, [groupId, search, typeFilters, sort, tagFilters, showArchived]);

  // 進入頁面自動查詢所有標籤
  useEffect(() => {
    fetch(`${API_URL}/api/group/${groupId}/tags`)
      .then(res => res.json())
      .then(data => {
        setAllTags(((data.tags || []) as any[]).map((t: any) => t.name));
        setTagColors(Object.fromEntries(((data.tags || []) as any[]).map((t: any) => [t.name, t.color])));
      });
  }, [groupId]);

  const handleEndReached = () => {
    if (!loading && hasMore) fetchFiles();
  };
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFiles(true);
  }, []);

  // 批次下載
  const handleBatchDownload = async () => {
    if (!selected.length) return;
    try {
      setLoading(true); // 顯示 loading
      const url = `${API_URL}/api/group/${groupId}/messages/zip`;
      const token = await AsyncStorage.getItem('token'); // 取得 JWT token
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: selected }),
      });
      if (!res.ok) throw new Error('下載失敗');
      const blob = await res.blob();
      // 產生本地檔案路徑
      const fileUri = FileSystem.cacheDirectory + `group_${groupId}_files.zip`;
      // blob 轉 arrayBuffer
      const buffer = await blob.arrayBuffer();
      // arrayBuffer 寫入本地檔案
      await FileSystem.writeAsStringAsync(
        fileUri,
        Buffer.from(buffer).toString('base64'),
        { encoding: FileSystem.EncodingType.Base64 }
      );
      // 分享或打開 zip
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        alert('檔案已下載：' + fileUri);
      }
      // 操作完成自動退出多選
      setSelected([]);
      setMultiSelect(false);
    } catch (e: any) {
      alert('批次下載失敗：' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };
  // 批次刪除
  const handleBatchDelete = async () => {
    if (!isAdmin) return;
    if (!selected.length) return;
    try {
      setLoading(true); // 顯示 loading
      if (!window.confirm('確定要刪除選取的檔案嗎？')) return;
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/group/${groupId}/messages/batch-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ids: selected })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '刪除失敗');
      setSelected([]);
      setMultiSelect(false);
      fetchFiles(true);
      alert('批次刪除完成');
    } catch (e: any) {
      alert('批次刪除失敗：' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const handleBatchTag = () => {
    setTagModalType('add');
    setTagInput('');
    setShowTagModal(true);
  };
  const handleBatchUntag = () => {
    setTagModalType('remove');
    setTagInput('');
    setShowTagModal(true);
  };
  const submitTagModal = async () => {
    if (!tagInput || !allTags.includes(tagInput)) {
      Alert.alert('請選擇現有標籤');
      return;
    }
    if (!tagInput) return;
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      let url = `${API_URL}/api/group/${groupId}/messages/` + (tagModalType === 'add' ? 'batch-tag' : 'batch-untag');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ids: selected, tag: tagInput })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (tagModalType === 'add' ? '標籤失敗' : '移除標籤失敗'));
      setSelected([]);
      setMultiSelect(false);
      fetchFiles(true);
      Alert.alert(tagModalType === 'add' ? '批次標籤完成' : '批次移除標籤完成');
    } catch (e: any) {
      Alert.alert((tagModalType === 'add' ? '批次標籤失敗：' : '批次移除標籤失敗：') + (e.message || e));
    } finally {
      setLoading(false);
      setShowTagModal(false);
    }
  };
  const handleBatchArchive = async () => {
    Alert.alert('批次歸檔', '確定要歸檔選取的檔案嗎？', [
      { text: '取消', style: 'cancel' },
      { text: '確定', onPress: async () => {
        try {
          setLoading(true);
          const token = await AsyncStorage.getItem('token');
          const res = await fetch(`${API_URL}/api/group/${groupId}/messages/batch-archive`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ ids: selected })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '歸檔失敗');
          setSelected([]);
          setMultiSelect(false);
          fetchFiles(true);
          Alert.alert('批次歸檔完成');
        } catch (e: any) {
          Alert.alert('批次歸檔失敗', e.message || String(e));
        } finally {
          setLoading(false);
        }
      } }
    ]);
  };

  const handleBatchUnarchive = async () => {
    Alert.alert('批次取消歸檔', '確定要取消歸檔選取的檔案嗎？', [
      { text: '取消', style: 'cancel' },
      { text: '確定', onPress: async () => {
        try {
          setLoading(true);
          const token = await AsyncStorage.getItem('token');
          const res = await fetch(`${API_URL}/api/group/${groupId}/messages/batch-unarchive`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ ids: selected })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '取消歸檔失敗');
          setSelected([]);
          setMultiSelect(false);
          fetchFiles(true);
          Alert.alert('批次取消歸檔完成');
        } catch (e: any) {
          Alert.alert('批次取消歸檔失敗', e.message || String(e));
        } finally {
          setLoading(false);
        }
      } }
    ]);
  };

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
        <select value={sort} onChange={e => setSort(e.target.value)} style={{ minWidth: 100, height: 32, borderRadius: 6, borderColor: '#ccc' }}>
          {sortOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <TouchableOpacity onPress={toggleSelectAll} style={{ marginLeft: 8 }}>
          <Text style={{ color: allChecked ? '#1976d2' : '#888' }}>{allChecked ? '取消全選' : '全選'}</Text>
        </TouchableOpacity>
        <View style={{ position: 'relative' }}>
          <TextInput
            value={tagFilters.join(',')}
            onChangeText={txt => setTagFilters(txt.split(',').map(t => t.trim()).filter(Boolean))}
            placeholder="標籤（逗號分隔）"
            style={{ minWidth: 100, backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#ccc', padding: 6, marginRight: 8 }}
            onFocus={() => { setTagInputFocus(true); setTagSuggestVisible(true); }}
            onBlur={() => setTimeout(() => { setTagInputFocus(false); setTagSuggestVisible(false); }, 200)}
            ref={tagInputRef}
          />
          {tagSuggestVisible && allTags.length > 0 && tagInputFocus && (
            <View style={{ position: 'absolute', top: 38, left: 0, backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#ccc', zIndex: 20, minWidth: 100, maxHeight: 120 }}>
              <FlatList
                data={allTags.filter(t => t && !tagFilters.includes(t) && (tagFilters.length === 0 || t.includes(tagFilters[tagFilters.length-1])))}
                keyExtractor={item => item}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => {
                    const arr = [...tagFilters];
                    arr[arr.length-1] = item;
                    setTagFilters(arr.filter(Boolean));
                    setTagSuggestVisible(false);
                    tagInputRef.current?.blur();
                  }} style={{ padding: 8 }}>
                    <Text style={{ color: '#1976d2', fontSize: 13 }}>{item}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ color: '#888', padding: 8 }}>無建議</Text>}
                style={{ maxHeight: 120 }}
                keyboardShouldPersistTaps="handled"
              />
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
          <Switch value={showArchived} onValueChange={setShowArchived} />
          <Text style={{ marginLeft: 4 }}>僅顯示已歸檔</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity onPress={() => (navigation as any).navigate('TagManager', { groupId })} style={{ marginLeft: 8, backgroundColor: '#1976d2', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 16 }}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>標籤管理</Text>
          </TouchableOpacity>
        )}
      </View>
      {/* 檔案列表 */}
      <FlatList
        data={fileList}
        keyExtractor={item => item._id}
        renderItem={({ item }: { item: FileItem }) => {
          const isChecked = selected.includes(item._id);
          const badgeNum = isChecked ? selected.indexOf(item._id) + 1 : undefined;
          if (!checkboxScale.has(item._id)) checkboxScale.set(item._id, new Animated.Value(1));
          return (
            <Pressable
              onLongPress={() => { setMultiSelect(true); toggleSelect(item._id); }}
              onPress={() => multiSelect ? toggleSelect(item._id) : window.open(API_URL + item.url, '_blank') }
              style={{ flexDirection: 'row', alignItems: 'center', padding: 8, borderBottomWidth: 1, borderColor: '#eee', backgroundColor: isChecked ? '#e3f2fd' : undefined }}
            >
              {multiSelect && (
                <Animated.View style={[styles.checkbox, { transform: [{ scale: checkboxScale.get(item._id) || 1 }] }]}>
                  <Text style={{ color: isChecked ? '#1976d2' : '#ccc', fontWeight: 'bold' }}>{isChecked ? '✔' : ''}</Text>
                  {isChecked && (
                    <View style={styles.badge}><Text style={styles.badgeText}>{badgeNum}</Text></View>
                  )}
                </Animated.View>
              )}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: 'bold', color: '#333' }}>{item.filename}</Text>
                <Text style={{ fontSize: 12, color: '#888' }}>{item.mimetype || '-'}  {formatSize(item.size)}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
                  {item.tags && item.tags.map((tag: string, i: number) => (
                    <Text key={i} style={{ backgroundColor: tagColors[tag] || '#bde0fe', color: '#1976d2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, fontSize: 11, marginLeft: 4 }}>{tag}</Text>
                  ))}
                  {item.archived && (
                    <View style={{ backgroundColor: '#eee', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4, marginBottom: 2 }}>
                      <Text style={{ color: '#888', fontSize: 11 }}>已歸檔</Text>
                    </View>
                  )}
                </View>
              </View>
              {!multiSelect && (
                <TouchableOpacity onPress={() => window.open(API_URL + item.url, '_blank')} style={{ marginLeft: 8 }}>
                  <Text style={{ color: '#1976d2', fontSize: 15 }}>下載</Text>
                </TouchableOpacity>
              )}
            </Pressable>
          );
        }}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.2}
        ListFooterComponent={loading ? <ActivityIndicator style={{ margin: 12 }} /> : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={!loading ? <Text style={{ textAlign: 'center', color: '#888', margin: 24 }}>尚無檔案訊息</Text> : null}
        // 多選狀態下點擊空白區不退出多選
        scrollEnabled={true}
      />
      {/* 批次操作列 */}
      {multiSelect && selected.length > 0 && (
        <View style={styles.batchBar}>
          <Text style={{ fontWeight: 'bold', color: '#1976d2' }}>已選 {selected.length} / {fileList.length} 項</Text>
          <TouchableOpacity onPress={toggleSelectAll} style={{ marginLeft: 16 }}>
            <Text style={{ color: allChecked ? '#1976d2' : '#888' }}>{allChecked ? '取消全選' : '全選本頁'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBatchDownload} style={{ marginLeft: 16 }}>
            <Text style={{ color: '#1976d2' }}>批次下載</Text>
          </TouchableOpacity>
          {isAdmin && (
            <>
              <TouchableOpacity onPress={handleBatchTag} style={{ marginLeft: 16 }}>
                <Text style={{ color: '#1976d2' }}>批次標籤</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleBatchArchive} style={{ marginLeft: 16 }}>
                <Text style={{ color: '#1976d2' }}>批次歸檔</Text>
              </TouchableOpacity>
            </>
          )}
          {isAdmin && (
            <TouchableOpacity onPress={handleBatchUntag} style={{ marginLeft: 16 }}>
              <Text style={{ color: '#1976d2' }}>批次移除標籤</Text>
            </TouchableOpacity>
          )}
          {isAdmin && (
            <TouchableOpacity onPress={handleBatchUnarchive} style={{ marginLeft: 16 }}>
              <Text style={{ color: '#1976d2' }}>批次取消歸檔</Text>
            </TouchableOpacity>
          )}
          {isAdmin && (
            <TouchableOpacity onPress={handleBatchDelete} style={{ marginLeft: 16 }}>
              <Text style={{ color: '#e53935' }}>批次刪除</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={clearSelect} style={{ marginLeft: 16 }}>
            <Text style={{ color: '#888' }}>取消</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* 批次標籤/移除標籤 Modal */}
      <Modal
        visible={showTagModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTagModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowTagModal(false)}>
          <View style={{ flex: 1, backgroundColor: '#0005', justifyContent: 'center', alignItems: 'center' }}>
            <TouchableWithoutFeedback>
              <View style={{ backgroundColor: '#fff', borderRadius: 10, padding: 24, minWidth: 280, maxWidth: 340, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>{tagModalType === 'add' ? '批次標籤' : '批次移除標籤'}</Text>
                <TextInput
                  value={tagInput}
                  onChangeText={setTagInput}
                  placeholder="請輸入標籤"
                  style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, marginBottom: 8, fontSize: 16 }}
                  autoFocus
                  onFocus={() => setTagInputFocus(true)}
                  onBlur={() => setTimeout(() => setTagInputFocus(false), 200)}
                />
                {tagInputFocus && allTags.length > 0 && (
                  <View style={{ position: 'absolute', left: 24, top: 90, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 6, zIndex: 20, minWidth: 120, maxHeight: 160, overflow: 'scroll', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 }}>
                    <FlatList
                      data={allTags.filter(t => t && t.includes(tagInput))}
                      keyExtractor={item => item}
                      renderItem={({ item }) => (
                        <TouchableOpacity onPress={() => { setTagInput(item); setTagInputFocus(false); }} style={{ padding: 8 }}>
                          <Text style={{ color: '#1976d2', fontSize: 15 }}>{item}</Text>
                        </TouchableOpacity>
                      )}
                      ListEmptyComponent={<Text style={{ color: '#888', padding: 8 }}>無建議</Text>}
                      style={{ maxHeight: 120 }}
                      keyboardShouldPersistTaps="handled"
                    />
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
                  <TouchableOpacity onPress={submitTagModal} style={{ backgroundColor: '#1976d2', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 24 }}>
                    <Text style={{ color: '#fff', fontSize: 16 }}>確定</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowTagModal(false)} style={{ borderRadius: 6, paddingVertical: 8, paddingHorizontal: 24 }}>
                    <Text style={{ color: '#1976d2', fontSize: 16 }}>取消</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1976d2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: '#fff',
  },
  batchBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f5faff',
    borderTopWidth: 1,
    borderColor: '#b3e5fc',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    zIndex: 10,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#1976d2',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
}); 