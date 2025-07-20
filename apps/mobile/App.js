import React, { useEffect, useState, useRef } from 'react';
import { SafeAreaView, View, Text, TextInput, Button, FlatList, StyleSheet, TouchableOpacity, Alert, ScrollView, Platform, Modal, Switch, Image, Linking } from 'react-native';
import io from 'socket.io-client';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as jwtDecode from 'jwt-decode';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

const API_URL = 'http://localhost:3001'; // 若手機測試請改為電腦區網IP

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function getAvatar(name) {
  return name ? name[0].toUpperCase() : '?';
}
function escapeHTML(str) {
  return str.replace(/[&<>'"`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;','`':'&#96;'}[c]));
}
function formatSize(size) {
  if (!size) return '';
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / 1024 / 1024).toFixed(1) + ' MB';
}

export default function App() {
  const [page, setPage] = useState('login'); // login | register | chat
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [groups, setGroups] = useState([]);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const [error, setError] = useState('');
  const [groupName, setGroupName] = useState('');
  const [joinGroupId, setJoinGroupId] = useState('');
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const audioRefs = useRef({});
  const [userId, setUserId] = useState('');
  const [theme, setTheme] = useState('light'); // light | dark
  const [search, setSearch] = useState('');
  const [messageCache, setMessageCache] = useState({}); // { groupId: [messages] }
  const [registerPwd, setRegisterPwd] = useState('');
  const [pwdStrength, setPwdStrength] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupInfo, setGroupInfo] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null); // {type, url}
  const [uploadProgress, setUploadProgress] = useState(0);
  const notificationResponseListener = useRef();
  const notificationReceivedListener = useRef(); // 新增
  const [scrollToMsgId, setScrollToMsgId] = useState(null); // 新增
  const flatListRef = useRef(); // FlatList ref
  const [showPushPref, setShowPushPref] = useState(false);
  const [pushPreferences, setPushPreferences] = useState({ mention: true, announcement: true, message: true, voice: true, file: true, system: true });
  const [pushPrefLoading, setPushPrefLoading] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const searchDebounceRef = useRef();

  // 解析 JWT 取得 userId
  useEffect(() => {
    if (token) {
      try {
        const payload = jwtDecode.default(token);
        setUserId(payload.id);
      } catch {}
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      const s = io(API_URL, { auth: { token } });
      s.on('group message', (msg) => {
        if (msg.groupId === currentGroup) setMessages((prev) => [...prev, msg]);
      });
      s.on('message read', ({ messageIds, userId: readUserId }) => {
        setMessages((prev) => prev.map(m =>
          messageIds.includes(m._id) && !m.readBy?.includes(readUserId)
            ? { ...m, readBy: [...(m.readBy || []), readUserId] }
            : m
        ));
      });
      
      // 監聽頭像更新事件
      s.on('avatar updated', ({ userId, username: updatedUsername, avatar, groupId }) => {
        console.log('收到頭像更新通知:', { userId, username: updatedUsername, avatar, groupId });
        
        // 更新群組列表中的成員頭像
        setGroups(prevGroups => 
          prevGroups.map(group => {
            if (group._id === groupId) {
              return {
                ...group,
                members: group.members.map(member => 
                  member._id === userId 
                    ? { ...member, avatar }
                    : member
                )
              };
            }
            return group;
          })
        );
      });
      
      setSocket(s);
      setPage('chat');
      fetchGroups(token);
      return () => s.disconnect();
    }
  }, [token, currentGroup]);

  // 取得訊息（支援快取與搜尋）
  useEffect(() => {
    if (currentGroup && token) {
      if (search.trim() === '' && messageCache[currentGroup]) {
        setMessages(messageCache[currentGroup]);
        return;
      }
      fetch(`${API_URL}/api/group/${currentGroup}/messages${search ? `?search=${encodeURIComponent(search)}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          setMessages(data.map(m => ({
            sender: m.sender.username,
            content: m.content,
            createdAt: m.createdAt,
            groupId: currentGroup,
            type: m.type,
            url: m.url,
            filename: m.filename,
            _id: m._id,
            readBy: m.readBy,
            isRevoked: m.isRevoked,
            editedAt: m.editedAt,
            size: m.size, // 新增 size 欄位
            mimetype: m.mimetype // 新增 mimetype 欄位
          })));
          if (search.trim() === '') {
            setMessageCache(prev => ({ ...prev, [currentGroup]: data.map(m => ({
              sender: m.sender.username,
              content: m.content,
              createdAt: m.createdAt,
              groupId: currentGroup,
              type: m.type,
              url: m.url,
              filename: m.filename,
              _id: m._id,
              readBy: m.readBy,
              isRevoked: m.isRevoked,
              editedAt: m.editedAt,
              size: m.size,
              mimetype: m.mimetype
            })) }));
          }
        })
        .catch(() => setMessages([]));
    }
  }, [currentGroup, token, search]);

  // Expo 推播註冊
  useEffect(() => {
    if (token && page === 'chat') {
      registerForPushNotificationsAsync().then(async expoPushToken => {
        if (expoPushToken) {
          await fetch(`${API_URL}/api/user/push-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ expoPushToken })
          });
        }
      });
    }
  }, [token, page]);

  // Expo 推播點擊事件監聽
  useEffect(() => {
    notificationResponseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      try {
        const data = response.notification.request.content.data;
        if (data && data.groupId) {
          setCurrentGroup(data.groupId);
          if (data.messageId) {
            setScrollToMsgId(data.messageId); // 設定滾動目標
          }
          // --- 新增公告推播點擊提示 ---
          if (data.type === 'announcement' && data.announcement) {
            setTimeout(() => {
              Alert.alert('新公告', data.announcement);
            }, 500);
          }
        }
      } catch (e) {
        // 可加上錯誤提示
      }
    });
    // --- 新增前景推播監聽 ---
    notificationReceivedListener.current = Notifications.addNotificationReceivedListener(notification => {
      try {
        const data = notification.request.content.data;
        if (data && data.type === 'mention') {
          Alert.alert('你被提及', notification.request.content.body || '你在群組中被提及');
        }
        // --- 新增公告推播前景提示 ---
        if (data && data.type === 'announcement' && data.announcement) {
          Alert.alert('新公告', data.announcement);
        }
      } catch {}
    });
    return () => {
      if (notificationResponseListener.current) {
        notificationResponseListener.current.remove();
      }
      if (notificationReceivedListener.current) {
        notificationReceivedListener.current.remove();
      }
    };
  }, []);

  // FlatList 渲染後自動滾動到特定訊息
  useEffect(() => {
    if (scrollToMsgId && messages.length > 0 && flatListRef.current) {
      const idx = messages.findIndex(m => m._id === scrollToMsgId);
      if (idx >= 0) {
        setTimeout(() => {
          flatListRef.current.scrollToIndex({ index: idx, animated: true });
        }, 300); // 等待 FlatList 資料渲染
      }
      setScrollToMsgId(null); // 滾動後清除
    }
  }, [scrollToMsgId, messages]);

  // 密碼強度提示
  useEffect(() => {
    if (page === 'register') {
      if (registerPwd.length < 8) setPwdStrength('密碼需至少8碼');
      else if (!/[a-zA-Z]/.test(registerPwd) || !/\d/.test(registerPwd)) setPwdStrength('需包含字母與數字');
      else setPwdStrength('強度良好');
    } else {
      setPwdStrength('');
    }
  }, [registerPwd, page]);

  // 自動上報已讀訊息
  useEffect(() => {
    if (socket && currentGroup && messages.length > 0 && userId) {
      const unreadIds = messages.filter(m => Array.isArray(m.readBy) && !m.readBy.includes(userId) && m._id).map(m => m._id);
      if (unreadIds.length > 0) {
        socket.emit('message read', { groupId: currentGroup, messageIds: unreadIds });
      }
    }
  }, [currentGroup, messages, socket, userId]);

  const fetchGroups = (tk) => {
    fetch(`${API_URL}/api/group/my`, {
      headers: { Authorization: `Bearer ${tk}` }
    })
      .then(res => res.json())
      .then(setGroups)
      .catch(() => setGroups([]));
  };

  const handleAuth = async (type) => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '發生錯誤');
      if (type === 'login') {
        setToken(data.token);
        setRefreshToken(data.refreshToken);
        setPage('chat');
      } else {
        setPage('login');
        Alert.alert('註冊成功', '請登入');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const sendMessage = () => {
    if (message.trim() && socket && currentGroup) {
      socket.emit('group message', { groupId: currentGroup, content: message });
      setMessage('');
    }
  };

  const logout = async () => {
    // 呼叫 /logout API 移除 refreshToken
    if (refreshToken && username) {
      try {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, refreshToken })
        });
      } catch {}
    }
    setToken('');
    setRefreshToken('');
    setPage('login');
    setMessages([]);
    setGroups([]);
    setCurrentGroup(null);
    if (socket) socket.disconnect();
  };

  const createGroup = async () => {
    if (!groupName.trim()) return;
    const res = await fetch(`${API_URL}/api/group/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: groupName })
    });
    if (res.ok) {
      setGroupName('');
      fetchGroups(token);
    }
  };

  const joinGroup = async () => {
    if (!joinGroupId.trim()) return;
    const res = await fetch(`${API_URL}/api/group/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ groupId: joinGroupId })
    });
    if (res.ok) {
      setJoinGroupId('');
      fetchGroups(token);
    }
  };

  // 語音訊息錄製與上傳
  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
      setIsRecording(true);
    } catch (e) {
      Alert.alert('錄音失敗', e.message);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    if (!uri) return;
    // 上傳語音
    const fileInfo = await FileSystem.getInfoAsync(uri);
    const formData = new FormData();
    formData.append('voice', {
      uri,
      name: 'voice.m4a',
      type: 'audio/m4a',
    });
    formData.append('groupId', currentGroup);
    await fetch(`${API_URL}/api/upload/voice`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
  };

  const playVoice = async (url, idx) => {
    if (!audioRefs.current[idx]) {
      const { sound } = await Audio.Sound.createAsync({ uri: API_URL + url });
      audioRefs.current[idx] = sound;
      await sound.playAsync();
    } else {
      await audioRefs.current[idx].replayAsync();
    }
  };

  // 上傳多媒體訊息
  const handlePickMedia = async () => {
    Alert.alert('選擇檔案', '', [
      { text: '圖片/影片', onPress: pickImageOrVideo },
      { text: '檔案', onPress: pickFile },
      { text: '取消', style: 'cancel' }
    ]);
  };
  const pickImageOrVideo = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.7 });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const type = asset.type === 'video' ? 'video' : 'image';
      await uploadMedia(asset.uri, type, asset.fileName || 'media');
    }
  };
  const pickFile = async () => {
    let result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.type === 'success') {
      await uploadMedia(result.uri, 'file', result.name);
    }
  };
  const uploadMedia = async (uri, type, filename) => {
    if (!currentGroup) return;
    const formData = new FormData();
    formData.append('media', { uri, name: filename, type: type === 'image' ? 'image/jpeg' : type === 'video' ? 'video/mp4' : 'application/octet-stream' });
    formData.append('groupId', currentGroup);
    formData.append('type', type);
    setUploadProgress(0);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/api/upload/media`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        setUploadProgress(0);
        resolve();
      };
      xhr.onerror = () => {
        setUploadProgress(0);
        Alert.alert('上傳失敗');
        reject();
      };
      xhr.send(formData);
    });
  };

  // 包裝 fetch，自動登出
  const safeFetch = async (...args) => {
    let res = await fetch(...args);
    if (res.status === 401) {
      // 嘗試用 refreshToken 換新 access token
      if (refreshToken && username) {
        const refreshRes = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, refreshToken })
        });
        const refreshData = await refreshRes.json();
        if (refreshRes.ok && refreshData.token) {
          setToken(refreshData.token);
          // 重試原請求
          args[1] = args[1] || {};
          args[1].headers = args[1].headers || {};
          args[1].headers['Authorization'] = `Bearer ${refreshData.token}`;
          res = await fetch(...args);
          if (res.status !== 401) return res;
        }
      }
      // refresh 失敗才登出
      logout();
      Alert.alert('登入已過期，請重新登入');
      throw new Error('未授權');
    }
    return res;
  };

  const fetchGroupInfo = async (groupId) => {
    try {
      const res = await fetch(`${API_URL}/api/group/info/${groupId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setGroupInfo(data);
        setShowGroupInfo(true);
      } else {
        Alert.alert('錯誤', data.error || '取得群組資訊失敗');
      }
    } catch {
      Alert.alert('錯誤', '取得群組資訊失敗');
    }
  };

  const handleEditAnnouncement = async (newAnn) => {
    try {
      const res = await fetch(`${API_URL}/api/group/set-announcement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ groupId: groupInfo._id, announcement: newAnn })
      });
      const data = await res.json();
      if (res.ok) {
        setGroupInfo({ ...groupInfo, announcement: newAnn });
        Alert.alert('成功', '公告已更新');
      } else {
        Alert.alert('錯誤', data.error || '公告更新失敗');
      }
    } catch {
      Alert.alert('錯誤', '公告更新失敗');
    }
  };

  const handleInviteMember = async (userId) => {
    try {
      const res = await fetch(`${API_URL}/api/group/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ groupId: groupInfo._id, userId })
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('成功', '邀請成功');
        fetchGroupInfo(groupInfo._id); // 重新取得群組資訊
      } else {
        Alert.alert('錯誤', data.error || '邀請失敗');
      }
    } catch {
      Alert.alert('錯誤', '邀請失敗');
    }
  };

  const handleKickMember = async (userId) => {
    Alert.alert('確認', '確定要踢出該成員嗎？', [
      { text: '取消', style: 'cancel' },
      { text: '確定', onPress: async () => {
        try {
          const res = await fetch(`${API_URL}/api/group/kick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ groupId: groupInfo._id, userId })
          });
          const data = await res.json();
          if (res.ok) {
            Alert.alert('成功', '已踢出成員');
            fetchGroupInfo(groupInfo._id);
          } else {
            Alert.alert('錯誤', data.error || '踢人失敗');
          }
        } catch {
          Alert.alert('錯誤', '踢人失敗');
        }
      }}
    ]);
  };

  const handleSetAdmin = async (userId, set) => {
    try {
      const res = await fetch(`${API_URL}/api/group/set-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ groupId: groupInfo._id, userId, set })
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('成功', set ? '已設為管理員' : '已撤銷管理員');
        fetchGroupInfo(groupInfo._id);
      } else {
        Alert.alert('錯誤', data.error || '操作失敗');
      }
    } catch {
      Alert.alert('錯誤', '操作失敗');
    }
  };

  const handleTransferOwner = async (userId) => {
    Alert.alert('確認', '確定要將群主轉讓給該成員嗎？', [
      { text: '取消', style: 'cancel' },
      { text: '確定', onPress: async () => {
        try {
          const res = await fetch(`${API_URL}/api/group/transfer-owner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ groupId: groupInfo._id, userId })
          });
          const data = await res.json();
          if (res.ok) {
            Alert.alert('成功', '已轉讓群主');
            fetchGroupInfo(groupInfo._id);
          } else {
            Alert.alert('錯誤', data.error || '轉讓失敗');
          }
        } catch {
          Alert.alert('錯誤', '轉讓失敗');
        }
      }}
    ]);
  };

  // 取得推播偏好
  const fetchPushPreferences = async () => {
    setPushPrefLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/user/push-preferences`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setPushPreferences({ ...pushPreferences, ...data });
    } catch {}
    setPushPrefLoading(false);
  };
  // 更新推播偏好
  const updatePushPreference = async (key, value) => {
    setPushPreferences(prev => ({ ...prev, [key]: value }));
    try {
      await fetch(`${API_URL}/api/user/push-preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pushPreferences: { [key]: value } })
      });
    } catch {}
  };

  // 分頁查詢訊息
  const fetchMessages = async (groupId, before = '', append = false) => {
    if (!groupId || loadingMoreMessages) return;
    setLoadingMoreMessages(true);
    let url = `${API_URL}/api/group/${groupId}/messages?limit=30`;
    if (before) url += `&before=${before}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (res.ok && data.messages) {
      setHasMoreMessages(data.hasMore);
      setMessages(prev => append ? [...data.messages, ...prev] : data.messages);
    }
    setLoadingMoreMessages(false);
  };

  // 初次載入/切換群組/搜尋時載入最新訊息
  useEffect(() => {
    if (currentGroup && token) {
      setMessages([]);
      setHasMoreMessages(true);
      fetchMessages(currentGroup);
    }
  }, [currentGroup, token, search]);

  // 上滑加載更多
  const handleLoadMore = () => {
    if (loadingMoreMessages || !hasMoreMessages || messages.length === 0) return;
    const firstMsg = messages[0];
    if (firstMsg) fetchMessages(currentGroup, firstMsg._id, true);
  };

  // 搜尋框 debounce 查詢
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearch(searchInput);
    }, 400);
    return () => clearTimeout(searchDebounceRef.current);
  }, [searchInput]);

  if (page === 'login' || page === 'register') {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>{page === 'login' ? '登入' : '註冊'}</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="帳號"
        />
        <TextInput
          style={styles.input}
          value={page === 'register' ? registerPwd : password}
          onChangeText={v => page === 'register' ? setRegisterPwd(v) : setPassword(v)}
          placeholder="密碼"
          secureTextEntry
        />
        {page === 'register' && <Text style={{ color: pwdStrength === '強度良好' ? 'green' : 'red', marginBottom: 8 }}>{pwdStrength}</Text>}
        <Button title={page === 'login' ? '登入' : '註冊'} onPress={() => handleAuth(page)} />
        <TouchableOpacity onPress={() => setPage(page === 'login' ? 'register' : 'login')}>
          <Text style={{ color: 'blue', marginTop: 12 }}>
            {page === 'login' ? '沒有帳號？註冊' : '已有帳號？登入'}
          </Text>
        </TouchableOpacity>
        {!!error && <Text style={{ color: 'red', marginTop: 8 }}>{error}</Text>}
      </SafeAreaView>
    );
  }

  // 群組聊天室頁面
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.groupPanel}>
        <Text style={styles.subtitle}>我的群組</Text>
        <ScrollView style={{ maxHeight: 120 }}>
          {groups.map(g => (
            <TouchableOpacity
              key={g._id}
              style={[styles.groupBtn, currentGroup === g._id && styles.groupBtnActive]}
              onPress={() => setCurrentGroup(g._id)}
            >
              <Text>{g.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TextInput
          style={styles.input}
          value={groupName}
          onChangeText={setGroupName}
          placeholder="新群組名稱"
        />
        <Button title="建立群組" onPress={createGroup} />
        <TextInput
          style={styles.input}
          value={joinGroupId}
          onChangeText={setJoinGroupId}
          placeholder="加入群組ID"
        />
        <Button title="加入群組" onPress={joinGroup} />
        <Button title="登出" onPress={logout} color="red" />
        <Button title="推播偏好設定" onPress={() => { setShowPushPref(true); fetchPushPreferences(); }} />
      </View>
      <View style={styles.chatPanel}>
        <Text style={styles.subtitle}>聊天室 {currentGroup && groups.find(g => g._id === currentGroup)?.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="搜尋訊息/檔名..."
            style={{ flex: 1, padding: 6, borderRadius: 6, borderWidth: 1, borderColor: '#ccc', marginRight: 8, backgroundColor: theme === 'dark' ? '#222' : '#fff', color: theme === 'dark' ? '#fff' : '#222' }}
          />
          <Button title="清除" onPress={() => setSearchInput('')} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: themeStyles.color, marginRight: 8 }}>主題</Text>
          <Switch value={theme === 'dark'} onValueChange={v => setTheme(v ? 'dark' : 'light')} />
          <Text style={{ color: themeStyles.color, marginLeft: 8 }}>{theme === 'dark' ? '🌙' : '☀️'}</Text>
        </View>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={({ item, index }) => {
            const isMe = item.sender === userId;
            const highlight = (text) => {
              if (!search) return text;
              const reg = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
              return String(text).split(reg).map((part, i) =>
                reg.test(part) ? <Text key={i} style={{ backgroundColor: '#ffe082' }}>{part}</Text> : <Text key={i}>{part}</Text>
              );
            };
            if (item.isRevoked) {
              return <View style={[styles.msgRow, { justifyContent: isMe ? 'flex-end' : 'flex-start', backgroundColor: item._id === scrollToMsgId ? '#ffe082' : undefined }]}><Text style={{ color: '#888' }}>（已撤回）</Text></View>;
            }
            return (
              <View style={[styles.msgRow, { flexDirection: isMe ? 'row-reverse' : 'row', justifyContent: isMe ? 'flex-end' : 'flex-start', backgroundColor: item._id === scrollToMsgId ? '#ffe082' : undefined }]}>
                {/* 頭像 */}
                <View style={[styles.avatar, { backgroundColor: isMe ? themeStyles.bubbleMe : themeStyles.bubbleOther }]}>
                  <Text style={{ color: isMe ? '#fff' : '#555', fontWeight: 'bold', fontSize: 18 }}>{highlight(getAvatar(item.sender))}</Text>
                </View>
                {/* 氣泡 */}
                <View style={[styles.bubble, { backgroundColor: isMe ? themeStyles.bubbleMe : themeStyles.bubbleOther }]}>
                  {item.type === 'image' && item.url ? (
                    <TouchableOpacity onPress={() => setMediaPreview({ type: 'image', url: API_URL + item.url })}>
                      <Image source={{ uri: API_URL + item.url }} style={{ width: 120, height: 80, borderRadius: 8, marginBottom: 4 }} resizeMode="cover" />
                      {item.filename && <Text style={{ fontSize: 12 }}>{highlight(item.filename)} {formatSize(item.size)}</Text>}
                    </TouchableOpacity>
                  ) : item.type === 'video' && item.url ? (
                    <TouchableOpacity onPress={() => setMediaPreview({ type: 'video', url: API_URL + item.url })}>
                      <Video source={{ uri: API_URL + item.url }} style={{ width: 120, height: 80, borderRadius: 8, marginBottom: 4 }} useNativeControls resizeMode="cover" />
                      {item.filename && <Text style={{ fontSize: 12 }}>{highlight(item.filename)} {formatSize(item.size)}</Text>}
                    </TouchableOpacity>
                  ) : item.type === 'file' && item.url ? (
                    <TouchableOpacity onPress={() => Linking.openURL(API_URL + item.url)}>
                      <Text style={{ color: '#1976d2' }}>{highlight('下載檔案：' + item.filename)}</Text>
                      {item.mimetype && <Text style={{ marginLeft: 8 }}>{item.mimetype}</Text>}
                      {item.size && <Text style={{ marginLeft: 8 }}>{formatSize(item.size)}</Text>}
                    </TouchableOpacity>
                  ) : item.type === 'voice' ? (
                    <TouchableOpacity onPress={() => playVoice(item.url, index)}><Text>▶ 播放語音</Text></TouchableOpacity>
                  ) : (
                    <Text style={{ color: isMe ? (theme === 'dark' ? '#fff' : '#222') : '#222' }}><Text style={{ fontWeight: 'bold' }}>{highlight(item.sender)}：</Text>{highlight(item.content)}</Text>
                  )}
                  {item.editedAt && <Text style={{ color: '#888', fontSize: 12 }}>(已編輯)</Text>}
                  {item.readBy && item.readBy.length > 0 && (
                    <Text style={{ color: '#2196f3', fontSize: 12 }}>已讀 {item.readBy.length}</Text>
                  )}
                  {/* 時間戳 */}
                  <Text style={{ position: 'absolute', right: 10, bottom: -18, fontSize: 11, color: '#aaa' }}>{formatTime(item.createdAt)}</Text>
                  {isMe && !item.isRevoked && (
                    <Button title="撤回" onPress={() => {
                      if (socket && currentGroup) {
                        socket.emit('revoke message', { groupId: currentGroup, messageId: item._id });
                      }
                    }} color="#ff7043" />
                  )}
                </View>
              </View>
            );
          }}
          keyExtractor={(_, idx) => idx.toString()}
          style={styles.list}
          inverted
          ListHeaderComponent={
            loadingMoreMessages ? <Text style={{ textAlign: 'center', color: '#888', marginVertical: 8 }}>載入中...</Text>
            : !hasMoreMessages ? <Text style={{ textAlign: 'center', color: '#888', marginVertical: 8 }}>已無更多歷史訊息</Text>
            : null
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.05}
        />
        {currentGroup && (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={message}
              onChangeText={setMessage}
              placeholder="輸入訊息..."
            />
            <Button title="發送" onPress={sendMessage} />
            <Button title="上傳" onPress={handlePickMedia} color="#1976d2" />
          </View>
        )}
        {currentGroup && (
          <View style={{ marginTop: 8 }}>
            {!isRecording ? (
              <Button title="🎤 開始錄音" onPress={startRecording} color="#2196f3" />
            ) : (
              <Button title="■ 停止並送出語音" onPress={stopRecording} color="#ff7043" />
            )}
          </View>
        )}
        {currentGroup && (
          <Button title="群組資訊" onPress={() => fetchGroupInfo(currentGroup)} />
        )}
      </View>
      {/* 群組資訊彈窗 */}
      <Modal visible={showGroupInfo} animationType="slide" onRequestClose={() => setShowGroupInfo(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', padding: 20 }}>
          <Button title="關閉" onPress={() => setShowGroupInfo(false)} />
          {groupInfo && (
            <ScrollView>
              <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>群組資訊</Text>
              <Text style={{ fontWeight: 'bold' }}>公告：</Text>
              <Text style={{ backgroundColor: '#f5f5f5', padding: 8, borderRadius: 4, minHeight: 40, marginBottom: 12 }}>{groupInfo.announcement || '（無公告）'}</Text>
              {/* 僅 owner/admin 可編輯公告 */}
              {(groupInfo.owner && groupInfo.owner.username === username) || (groupInfo.admins && groupInfo.admins.some(a => a.username === username)) ? (
                <Button title="編輯公告" onPress={() => {
                  Alert.prompt('請輸入新公告', groupInfo.announcement || '', (newAnn) => {
                    if (newAnn !== null && newAnn !== undefined) {
                      handleEditAnnouncement(newAnn);
                    }
                  });
                }} />
              ) : null}
              <Text style={{ fontWeight: 'bold', marginTop: 16 }}>成員列表：</Text>
              {groupInfo.members.map((m, i) => {
                let role = '';
                if (groupInfo.owner && m._id === groupInfo.owner._id) role = '（群主）';
                else if (groupInfo.admins && groupInfo.admins.some(a => a._id === m._id)) role = '（管理員）';
                else role = '（成員）';
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Text>{m.username} {role}</Text>
                    {/* 僅 owner/admin 可踢人，僅 owner 可設/撤管理員、轉讓群主 */}
                    {((groupInfo.owner && groupInfo.owner.username === username) || (groupInfo.admins && groupInfo.admins.some(a => a.username === username))) && role !== '（群主）' && (
                      <Button title="踢出" onPress={() => handleKickMember(m._id)} />
                    )}
                    {groupInfo.owner && groupInfo.owner.username === username && role !== '（群主）' && (
                      <Button title={role === '（管理員）' ? '撤銷管理員' : '設為管理員'} onPress={() => handleSetAdmin(m._id, role !== '（管理員）')} />
                    )}
                    {groupInfo.owner && groupInfo.owner.username === username && role !== '（群主）' && (
                      <Button title="轉讓群主" onPress={() => handleTransferOwner(m._id)} />
                    )}
                  </View>
                );
              })}
              {/* 僅 owner/admin 可邀請成員 */}
              {(groupInfo.owner && groupInfo.owner.username === username) || (groupInfo.admins && groupInfo.admins.some(a => a.username === username)) ? (
                <Button title="邀請成員" onPress={() => {
                  Alert.prompt('請輸入要邀請的用戶ID', '', (uid) => {
                    if (uid) handleInviteMember(uid);
                  });
                }} />
              ) : null}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
      {/* 圖片/影片全螢幕預覽 Modal */}
      {mediaPreview && (
        <Modal visible={!!mediaPreview} transparent animationType="fade" onRequestClose={() => setMediaPreview(null)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center' }} activeOpacity={1} onPress={() => setMediaPreview(null)}>
            {mediaPreview.type === 'image' ? (
              <Image source={{ uri: mediaPreview.url }} style={{ width: '90%', height: '70%', borderRadius: 8 }} resizeMode="contain" />
            ) : (
              <Video source={{ uri: mediaPreview.url }} style={{ width: '90%', height: 300, borderRadius: 8 }} useNativeControls resizeMode="contain" />
            )}
          </TouchableOpacity>
        </Modal>
      )}
      {/* 上傳進度條 UI */}
      {uploadProgress > 0 && (
        <View style={{ position: 'absolute', top: 40, left: 0, right: 0, alignItems: 'center', zIndex: 1000 }}>
          <View style={{ backgroundColor: '#fff', borderColor: '#2196f3', borderWidth: 1, borderRadius: 8, padding: 12, width: 220, alignItems: 'center' }}>
            <Text>上傳中... {uploadProgress}%</Text>
            <View style={{ width: 180, height: 8, backgroundColor: '#eee', borderRadius: 4, marginTop: 6 }}>
              <View style={{ width: `${uploadProgress}%`, height: 8, backgroundColor: '#2196f3', borderRadius: 4 }} />
            </View>
          </View>
        </View>
      )}
      {/* 推播偏好設定 Modal */}
      <Modal visible={showPushPref} animationType="slide" onRequestClose={() => setShowPushPref(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', padding: 20 }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>推播偏好設定</Text>
          {pushPrefLoading ? <Text>載入中...</Text> : (
            <>
              {Object.entries({ mention: '被@提及', announcement: '群組公告', message: '一般訊息', voice: '語音訊息', file: '檔案訊息', system: '系統通知' }).map(([key, label]) => (
                <View key={key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ flex: 1 }}>{label}</Text>
                  <Switch value={!!pushPreferences[key]} onValueChange={v => updatePushPreference(key, v)} />
                </View>
              ))}
            </>
          )}
          <Button title="關閉" onPress={() => setShowPushPref(false)} />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff', flexDirection: 'row' },
  groupPanel: { width: 160, marginRight: 16 },
  chatPanel: { flex: 1 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10, alignSelf: 'center' },
  subtitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  list: { flex: 1, marginBottom: 10 },
  msg: { fontSize: 16, marginVertical: 2 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },
  bubble: { maxWidth: 240, borderRadius: 16, padding: 10, marginHorizontal: 2, position: 'relative' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, marginRight: 8, marginBottom: 8 },
  groupBtn: { padding: 8, backgroundColor: '#eee', marginBottom: 4, borderRadius: 4 },
  groupBtnActive: { backgroundColor: '#bde0fe' },
  voiceBtn: { padding: 8, backgroundColor: '#bde0fe', borderRadius: 4, marginBottom: 4 },
  revokedMsg: { marginVertical: 6, alignItems: 'center' },
});

// 取得 Expo 推播 token
async function registerForPushNotificationsAsync() {
  let token;
  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      Alert.alert('推播權限未開啟');
      return;
    }
    token = (await Notifications.getExpoPushTokenAsync()).data;
  } else {
    Alert.alert('必須在實體裝置上使用推播通知');
  }
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }
  return token;
} 