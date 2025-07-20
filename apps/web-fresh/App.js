import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import MediaWall from './components/MediaWall';
import FileCabinet from './components/FileCabinet';

const API_URL = 'http://localhost:3001';

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getAvatar(name) {
  return name ? name[0].toUpperCase() : '?';
}

const getFileType = (file) => {
  if (!file) return 'file';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
};

function escapeHTML(str) {
  return str.replace(/[&<>'"`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;','`':'&#96;'}[c]));
}

function formatSize(size) {
  if (!size) return '';
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / 1024 / 1024).toFixed(1) + ' MB';
}

function App() {
  const [page, setPage] = useState('login'); // login | register | chat
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [groups, setGroups] = useState([]);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [socket, setSocket] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [joinGroupId, setJoinGroupId] = useState('');
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const audioRefs = useRef({});
  const [userId, setUserId] = useState('');
  const [editMsgId, setEditMsgId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [theme, setTheme] = useState('light'); // light | dark
  const fileInputRef = useRef();
  const [search, setSearch] = useState('');
  const [messageCache, setMessageCache] = useState({}); // { groupId: [messages] }
  const [registerPwd, setRegisterPwd] = useState('');
  const [pwdStrength, setPwdStrength] = useState('');
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('refreshToken') || '');
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupInfo, setGroupInfo] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null); // {type, url}
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadKey, setUploadKey] = useState(0); // 用於觸發媒體牆/檔案櫃 reload
  const [showPushLog, setShowPushLog] = useState(false);
  const [pushLogs, setPushLogs] = useState([]);
  const [pushLogLoading, setPushLogLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pushLogUserId, setPushLogUserId] = useState('');
  const [pushLogType, setPushLogType] = useState('');
  const [pushLogSkip, setPushLogSkip] = useState(0);
  const [pushLogLimit, setPushLogLimit] = useState(50);
  const [pushLogStart, setPushLogStart] = useState('');
  const [pushLogEnd, setPushLogEnd] = useState('');
  const [pushLogStats, setPushLogStats] = useState({ typeCount: [], statusCount: [], total: [] });
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const messagesEndRef = useRef();
  const messagesBoxRef = useRef();
  const [searchInput, setSearchInput] = useState('');
  const searchDebounceRef = useRef();
  const [activeTab, setActiveTab] = useState('chat'); // chat | media | files
  const [callState, setCallState] = useState({ status: '', from: '', to: '', groupId: '', visible: false });
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peer, setPeer] = useState(null);
  const remoteAudioRef = useRef();
  const [isMuted, setIsMuted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recorder, setRecorder] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState('');

  // WebRTC 配置
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      // TURN server example（請填入你的 coturn 資訊）
      // { urls: 'turn:your.turn.server:3478', username: 'user', credential: 'pass' }
    ]
  };

  // 請求通知權限
  useEffect(() => {
    if (page === 'chat' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, [page]);

  useEffect(() => {
    if (token) {
      // 解析 JWT 取得 userId, isAdmin
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserId(payload.id);
        setIsAdmin(!!payload.isAdmin);
      } catch {}
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      const s = io(API_URL, { auth: { token } });
      s.on('group message', (msg) => {
        if (msg.groupId === currentGroup) setMessages((prev) => [...prev, msg]);
        // 新訊息推播通知
        if (
          'Notification' in window &&
          Notification.permission === 'granted' &&
          msg.sender !== username // 不通知自己發的訊息
        ) {
          if (msg.type === 'voice') {
            new Notification('新語音訊息', { body: `${msg.sender} 發送了一則語音訊息` });
          } else {
            new Notification('新訊息', { body: `${msg.sender}: ${msg.content}` });
          }
        }
      });
      s.on('message read', ({ messageIds, userId: readUserId }) => {
        setMessages((prev) => prev.map(m =>
          messageIds.includes(m._id) && !m.readBy?.includes(readUserId)
            ? { ...m, readBy: [...(m.readBy || []), readUserId] }
            : m
        ));
      });
      s.on('message revoked', ({ messageId }) => {
        setMessages((prev) => prev.map(m =>
          m._id === messageId ? { ...m, isRevoked: true } : m
        ));
      });
      s.on('message edited', ({ messageId, newContent, editedAt }) => {
        setMessages((prev) => prev.map(m =>
          m._id === messageId ? { ...m, content: newContent, editedAt, isRevoked: false } : m
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
        
        // 如果當前顯示的是該群組的資訊，也更新群組資訊
        if (groupInfo && groupInfo._id === groupId) {
          setGroupInfo(prevInfo => ({
            ...prevInfo,
            members: prevInfo.members.map(member => 
              member._id === userId 
                ? { ...member, avatar }
                : member
            )
          }));
        }
      });
      
      setSocket(s);
      setPage('chat');
      fetchGroups(token);
      return () => s.disconnect();
    }
  }, [token, currentGroup, username]);

  // Socket.IO 語音通話信令事件
  useEffect(() => {
    if (!socket) return;
    socket.on('call:invite', ({ from, to, groupId }) => {
      setCallState({ status: 'incoming', from, to, groupId, visible: true });
      console.log('收到語音通話邀請', { from, to, groupId });
    });
    socket.on('call:accept', ({ from, to, groupId }) => {
      setCallState({ status: 'accepted', from, to, groupId, visible: true });
      console.log('對方已接聽', { from, to, groupId });
    });
    socket.on('call:reject', ({ from, to, groupId, reason }) => {
      setCallState({ status: 'rejected', from, to, groupId, visible: false });
      alert('對方已拒絕通話');
      console.log('對方拒絕', { from, to, groupId, reason });
    });
    socket.on('call:end', ({ from, to, groupId, reason }) => {
      setCallState({ status: 'ended', from, to, groupId, visible: false });
      alert('通話已結束');
      console.log('通話結束', { from, to, groupId, reason });
    });
    return () => {
      socket.off('call:invite');
      socket.off('call:accept');
      socket.off('call:reject');
      socket.off('call:end');
    };
  }, [socket]);

  // WebRTC 信令處理
  useEffect(() => {
    if (!socket) return;
    socket.on('call:signal', async ({ from, to, groupId, data }) => {
      if (!peer) return;
      if (data.sdp) {
        if (data.type === 'offer') {
          await peer.setRemoteDescription(new RTCSessionDescription(data));
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit('call:signal', { from: userId, to: from, groupId, data: peer.localDescription });
        } else if (data.type === 'answer') {
          await peer.setRemoteDescription(new RTCSessionDescription(data));
        }
      } else if (data.candidate) {
        await peer.addIceCandidate(new RTCIceCandidate(data));
      }
    });
    return () => socket.off('call:signal');
  }, [socket, peer, userId]);

  // 建立/釋放 WebRTC 連線
  const startCall = async (isCaller) => {
    const pc = new RTCPeerConnection(rtcConfig);
    setPeer(pc);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setLocalStream(stream);
    stream.getAudioTracks()[0].enabled = !isMuted;
    pc.addTrack(stream.getAudioTracks()[0], stream);
    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0];
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('call:signal', { from: userId, to: callState.to || callState.from, groupId: callState.groupId, data: e.candidate });
      }
    };
    if (isCaller) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call:signal', { from: userId, to: callState.to, groupId: callState.groupId, data: offer });
    }
  };
  const endCall = () => {
    if (peer) peer.close();
    setPeer(null);
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
    setIsRecording(false);
    setRecordedUrl('');
    if (recorder) recorder.stop();
    setRecorder(null);
  };
  // 通話狀態變化時自動建立/釋放連線
  useEffect(() => {
    if (callState.status === 'accepted') startCall(false);
    if (callState.status === 'calling') startCall(true);
    if (callState.status === 'ended' || callState.status === 'rejected') endCall();
    // eslint-disable-next-line
  }, [callState.status]);
  // 靜音切換
  const toggleMute = () => {
    if (localStream) {
      const enabled = !isMuted;
      localStream.getAudioTracks()[0].enabled = !enabled;
      setIsMuted(enabled);
    }
  };
  // 錄音
  const startCallRecording = () => {
    if (!localStream) return;
    const rec = new MediaRecorder(localStream);
    let chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      setRecordedUrl(URL.createObjectURL(blob));
    };
    rec.start();
    setRecorder(rec);
    setIsRecording(true);
  };
  const stopCallRecording = () => {
    if (recorder) recorder.stop();
    setIsRecording(false);
  };

  const handleCallInvite = (targetUserId) => {
    if (!socket || !currentGroup) return;
    setCallState({ status: 'calling', from: userId, to: targetUserId, groupId: currentGroup, visible: true });
    socket.emit('call:invite', { from: userId, to: targetUserId, groupId: currentGroup });
    console.log('發送語音通話邀請', { from: userId, to: targetUserId, groupId: currentGroup });
  };
  const handleCallAccept = () => {
    if (!socket) return;
    socket.emit('call:accept', { from: userId, to: callState.from, groupId: callState.groupId });
    setCallState({ ...callState, status: 'accepted' });
    console.log('接聽通話', { from: userId, to: callState.from, groupId: callState.groupId });
  };
  const handleCallReject = () => {
    if (!socket) return;
    socket.emit('call:reject', { from: userId, to: callState.from, groupId: callState.groupId, reason: 'reject' });
    setCallState({ ...callState, status: 'rejected', visible: false });
    console.log('拒絕通話', { from: userId, to: callState.from, groupId: callState.groupId });
  };
  const handleCallEnd = () => {
    if (!socket) return;
    socket.emit('call:end', { from: userId, to: callState.to || callState.from, groupId: callState.groupId, reason: 'end' });
    setCallState({ ...callState, status: 'ended', visible: false });
    console.log('掛斷通話', { from: userId, to: callState.to || callState.from, groupId: callState.groupId });
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
      if (messagesBoxRef.current) messagesBoxRef.current.scrollTop = messagesBoxRef.current.scrollHeight;
    }
  }, [currentGroup, token, search]);

  // 上滑加載更多
  const handleScroll = () => {
    if (!messagesBoxRef.current || loadingMoreMessages || !hasMoreMessages) return;
    if (messagesBoxRef.current.scrollTop < 40) {
      // 取得最早一筆訊息 id
      const firstMsg = messages[0];
      if (firstMsg) fetchMessages(currentGroup, firstMsg._id, true);
    }
  };

  useEffect(() => {
    // 切換群組時自動回報已讀
    if (socket && currentGroup && messages.length > 0) {
      const unreadIds = messages.filter(m => !(m.readBy || []).includes(userId)).map(m => m._id);
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
        localStorage.setItem('token', data.token);
        localStorage.setItem('refreshToken', data.refreshToken);
        setPage('chat');
      } else {
        setPage('login');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (message.trim() && socket && currentGroup) {
      socket.emit('group message', { groupId: currentGroup, content: message });
      setMessage('');
    }
  };

  const logout = async () => {
    // 呼叫 /logout API 移除 refreshToken
    const rt = localStorage.getItem('refreshToken');
    const un = username || localStorage.getItem('username');
    if (rt && un) {
      try {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: un, refreshToken: rt })
        });
      } catch {}
    }
    setToken('');
    setRefreshToken('');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
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
    if (!navigator.mediaDevices) return alert('瀏覽器不支援錄音');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new window.MediaRecorder(stream);
    setAudioChunks([]);
    mr.ondataavailable = (e) => setAudioChunks((prev) => [...prev, e.data]);
    mr.onstop = async () => {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('voice', blob, 'voice.webm');
      formData.append('groupId', currentGroup);
      await fetch(`${API_URL}/api/upload/voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      setAudioChunks([]);
    };
    mr.start();
    setMediaRecorder(mr);
    setRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setRecording(false);
    }
  };

  // 撤回訊息
  const revokeMessage = (messageId) => {
    if (socket && currentGroup) {
      socket.emit('revoke message', { groupId: currentGroup, messageId });
    }
  };

  // 編輯訊息
  const startEditMessage = (msg) => {
    setEditMsgId(msg._id);
    setEditContent(msg.content);
  };
  const submitEditMessage = () => {
    if (socket && currentGroup && editMsgId && editContent.trim()) {
      socket.emit('edit message', { groupId: currentGroup, messageId: editMsgId, newContent: editContent });
      setEditMsgId(null);
      setEditContent('');
    }
  };
  const cancelEdit = () => {
    setEditMsgId(null);
    setEditContent('');
  };

  // 上傳多媒體訊息
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentGroup) return;
    const type = getFileType(file);
    const formData = new FormData();
    formData.append('media', file);
    formData.append('groupId', currentGroup);
    formData.append('type', type);
    setUploadProgress(0);
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
      setUploadKey(k => k + 1); // 觸發媒體牆/檔案櫃 reload
      e.target.value = '';
      // 可選：自動刷新訊息
    };
    xhr.onerror = () => {
      setUploadProgress(0);
      alert('上傳失敗');
    };
    xhr.send(formData);
  };

  // 主題切換
  const themeStyles = theme === 'dark' ? {
    background: '#222', color: '#eee', bubbleMe: '#4f8cff', bubbleOther: '#333', input: '#333', border: '#444'
  } : {
    background: '#fff', color: '#222', bubbleMe: '#e3f0ff', bubbleOther: '#f1f1f1', input: '#fff', border: '#ccc'
  };

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

  // 包裝 fetch，自動登出
  const safeFetch = async (...args) => {
    let res = await fetch(...args);
    if (res.status === 401) {
      // 嘗試用 refreshToken 換新 access token
      const rt = localStorage.getItem('refreshToken');
      const un = username || localStorage.getItem('username');
      if (rt && un) {
        const refreshRes = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: un, refreshToken: rt })
        });
        const refreshData = await refreshRes.json();
        if (refreshRes.ok && refreshData.token) {
          setToken(refreshData.token);
          localStorage.setItem('token', refreshData.token);
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
      alert('登入已過期，請重新登入');
      throw new Error('未授權');
    }
    return res;
  };

  // 取得群組資訊（後續可串接 API）
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
        alert(data.error || '取得群組資訊失敗');
      }
    } catch {
      alert('取得群組資訊失敗');
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
        alert('公告已更新');
      } else {
        alert(data.error || '公告更新失敗');
      }
    } catch {
      alert('公告更新失敗');
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
        alert('邀請成功');
        fetchGroupInfo(groupInfo._id); // 重新取得群組資訊
      } else {
        alert(data.error || '邀請失敗');
      }
    } catch {
      alert('邀請失敗');
    }
  };

  const handleKickMember = async (userId) => {
    if (!window.confirm('確定要踢出該成員嗎？')) return;
    try {
      const res = await fetch(`${API_URL}/api/group/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ groupId: groupInfo._id, userId })
      });
      const data = await res.json();
      if (res.ok) {
        alert('已踢出成員');
        fetchGroupInfo(groupInfo._id);
      } else {
        alert(data.error || '踢人失敗');
      }
    } catch {
      alert('踢人失敗');
    }
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
        alert(set ? '已設為管理員' : '已撤銷管理員');
        fetchGroupInfo(groupInfo._id);
      } else {
        alert(data.error || '操作失敗');
      }
    } catch {
      alert('操作失敗');
    }
  };

  const handleTransferOwner = async (userId) => {
    if (!window.confirm('確定要將群主轉讓給該成員嗎？')) return;
    try {
      const res = await fetch(`${API_URL}/api/group/transfer-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ groupId: groupInfo._id, userId })
      });
      const data = await res.json();
      if (res.ok) {
        alert('已轉讓群主');
        fetchGroupInfo(groupInfo._id);
      } else {
        alert(data.error || '轉讓失敗');
      }
    } catch {
      alert('轉讓失敗');
    }
  };

  // 查詢推播日誌
  const fetchPushLogs = async (userId = '', type = '', skip = 0, limit = 50, start = '', end = '') => {
    setPushLogLoading(true);
    try {
      const params = new URLSearchParams({ userId, type, skip, limit, start, end });
      const res = await fetch(`${API_URL}/api/user/push-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setPushLogs(data);
      // 查詢統計
      const statsRes = await fetch(`${API_URL}/api/user/push-logs/stats?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const stats = await statsRes.json();
      setPushLogStats(stats);
    } catch {}
    setPushLogLoading(false);
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
      <div style={{ maxWidth: 400, margin: '40px auto', fontFamily: 'sans-serif' }}>
        <h2>{page === 'login' ? '登入' : '註冊'}</h2>
        <form onSubmit={e => { e.preventDefault(); handleAuth(page); }}>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="帳號"
            style={{ width: '100%', marginBottom: 8, padding: 8 }}
          />
          <input
            type="password"
            value={page === 'register' ? registerPwd : password}
            onChange={e => page === 'register' ? setRegisterPwd(e.target.value) : setPassword(e.target.value)}
            placeholder="密碼"
            style={{ width: '100%', marginBottom: 8, padding: 8 }}
          />
          {page === 'register' && <div style={{ color: pwdStrength === '強度良好' ? 'green' : 'red', marginBottom: 8 }}>{pwdStrength}</div>}
          <button type="submit" style={{ width: '100%', padding: 8 }}>
            {page === 'login' ? '登入' : '註冊'}
          </button>
        </form>
        <button onClick={() => setPage(page === 'login' ? 'register' : 'login')} style={{ marginTop: 8 }}>
          {page === 'login' ? '沒有帳號？註冊' : '已有帳號？登入'}
        </button>
        {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
      </div>
    );
  }

  // 聊天室頁面
  return (
    <div style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'sans-serif', display: 'flex', background: themeStyles.background, color: themeStyles.color }}>
      {/* 左側群組清單 */}
      <div style={{ width: 180, marginRight: 16 }}>
        <h3>我的群組</h3>
        <ul style={{ padding: 0, listStyle: 'none' }}>
          {groups.map(g => (
            <li key={g._id} style={{ marginBottom: 4 }}>
              <button
                style={{ width: '100%', background: currentGroup === g._id ? '#e0e0e0' : '#fff' }}
                onClick={() => setCurrentGroup(g._id)}
              >
                {g.name}
              </button>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 16 }}>
          <input
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            placeholder="新群組名稱"
            style={{ width: '100%', marginBottom: 4, padding: 4 }}
          />
          <button onClick={createGroup} style={{ width: '100%' }}>建立群組</button>
        </div>
        <div style={{ marginTop: 8 }}>
          <input
            value={joinGroupId}
            onChange={e => setJoinGroupId(e.target.value)}
            placeholder="加入群組ID"
            style={{ width: '100%', marginBottom: 4, padding: 4 }}
          />
          <button onClick={joinGroup} style={{ width: '100%' }}>加入群組</button>
        </div>
        <button onClick={logout} style={{ marginTop: 16, width: '100%' }}>登出</button>
        <button onClick={() => { setShowPushLog(true); fetchPushLogs(); }} style={{ marginTop: 16, width: '100%' }}>推播日誌查詢</button>
      </div>
      {/* 中間聊天區 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>聊天室 {currentGroup && groups.find(g => g._id === currentGroup)?.name}</h2>
          <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} style={{ marginLeft: 8 }}>
            {theme === 'light' ? '🌙 深色' : '☀️ 淺色'}
          </button>
        </div>
        {/* 新增 Tab 切換 */}
        {currentGroup && (
          <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
            <button onClick={() => setActiveTab('chat')} style={{ background: activeTab === 'chat' ? '#bde0fe' : '#eee', padding: '6px 16px', border: 'none', borderRadius: 6 }}>聊天</button>
            <button onClick={() => setActiveTab('media')} style={{ background: activeTab === 'media' ? '#bde0fe' : '#eee', padding: '6px 16px', border: 'none', borderRadius: 6 }}>媒體牆</button>
            <button onClick={() => setActiveTab('files')} style={{ background: activeTab === 'files' ? '#bde0fe' : '#eee', padding: '6px 16px', border: 'none', borderRadius: 6 }}>檔案櫃</button>
          </div>
        )}
        {/* 根據 Tab 顯示內容 */}
        {currentGroup && activeTab === 'media' && <MediaWall groupId={currentGroup} uploadKey={uploadKey} isAdmin={isAdmin} />}
        {currentGroup && activeTab === 'files' && <FileCabinet groupId={currentGroup} uploadKey={uploadKey} isAdmin={isAdmin} />}
        {/* 聊天內容只在 chat tab 顯示 */}
        {activeTab === 'chat' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="搜尋訊息/檔名..."
                style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #ccc', marginRight: 8 }}
              />
              <button onClick={() => setSearchInput('')}>清除</button>
            </div>
            {/* 用戶列表加語音通話按鈕 */}
            {currentGroup && (
              <div style={{ margin: '12px 0', background: '#f8f9fa', borderRadius: 8, padding: 12 }}>
                <b>群組成員：</b>
                {groups.find(g => g._id === currentGroup)?.members?.map(u => (
                  <span key={u._id} style={{ marginRight: 12 }}>
                    <span style={{ background: '#bde0fe', borderRadius: '50%', width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', marginRight: 4 }}>{getAvatar(u.username)}</span>
                    {u.username}
                    {u._id !== userId && (
                      <button style={{ marginLeft: 4, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }} onClick={() => handleCallInvite(u._id)}>語音通話</button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {/* 語音通話彈窗 */}
            {callState.visible && (
              <div style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: '#0005', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 2px 16px #0004', minWidth: 320, maxWidth: 400, padding: 32, position: 'relative', textAlign: 'center' }}>
                  {callState.status === 'calling' && <div>正在呼叫對方...</div>}
                  {callState.status === 'incoming' && <div>來電：{callState.from}</div>}
                  {callState.status === 'accepted' && <div>通話中...</div>}
                  <audio ref={remoteAudioRef} autoPlay style={{ display: remoteStream ? 'block' : 'none', margin: '16px auto' }} />
                  {callState.status === 'accepted' && (
                    <div style={{ margin: '12px 0' }}>
                      <button onClick={toggleMute} style={{ marginRight: 8 }}>{isMuted ? '取消靜音' : '靜音'}</button>
                      {!isRecording ? <button onClick={startCallRecording} style={{ marginRight: 8 }}>開始錄音</button> : <button onClick={stopCallRecording} style={{ marginRight: 8 }}>停止錄音</button>}
                      {recordedUrl && <a href={recordedUrl} download="recording.webm" style={{ marginLeft: 8 }}>下載錄音</a>}
                    </div>
                  )}
                  {callState.status === 'calling' && <button onClick={handleCallEnd} style={{ marginTop: 24, background: '#e53935', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px' }}>掛斷</button>}
                  {callState.status === 'incoming' && (
                    <div style={{ marginTop: 24 }}>
                      <button onClick={handleCallAccept} style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px', marginRight: 12 }}>接聽</button>
                      <button onClick={handleCallReject} style={{ background: '#e53935', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px' }}>拒絕</button>
                    </div>
                  )}
                  {callState.status === 'accepted' && <button onClick={handleCallEnd} style={{ marginTop: 24, background: '#e53935', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px' }}>掛斷</button>}
                </div>
              </div>
            )}
            <div ref={messagesBoxRef} onScroll={handleScroll} style={{ border: `1px solid ${themeStyles.border}`, minHeight: 200, padding: 10, marginBottom: 10, height: 300, overflowY: 'auto', background: theme === 'dark' ? '#181818' : '#fafbfc', position: 'relative' }}>
              {loadingMoreMessages && (
                <div style={{ textAlign: 'center', color: '#888', marginBottom: 8 }}>載入中...</div>
              )}
              {!hasMoreMessages && (
                <div style={{ textAlign: 'center', color: '#888', marginBottom: 8 }}>已無更多歷史訊息</div>
              )}
              {messages.map((msg, idx) => {
                const isMe = msg.sender === username;
                // 高亮搜尋關鍵字
                const highlight = (text) => {
                  if (!search) return escapeHTML(text);
                  const reg = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                  return escapeHTML(text).replace(reg, '<mark>$1</mark>');
                };
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', marginBottom: 10 }}>
                    {/* 頭像 */}
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: isMe ? themeStyles.bubbleMe : themeStyles.bubbleOther, color: isMe ? '#fff' : '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 18, marginLeft: isMe ? 10 : 0, marginRight: isMe ? 0 : 10 }}>
                      {getAvatar(msg.sender)}
                    </div>
                    {/* 氣泡 */}
                    <div style={{ maxWidth: 340, background: isMe ? themeStyles.bubbleMe : themeStyles.bubbleOther, color: isMe ? (theme === 'dark' ? '#fff' : '#222') : '#222', borderRadius: 16, padding: '8px 14px', position: 'relative', boxShadow: '0 1px 2px #0001' }}>
                      {msg.isRevoked ? (
                        <span style={{ color: '#888' }}>（已撤回）</span>
                      ) : editMsgId === msg._id ? (
                        <span>
                          <input
                            value={editContent}
                            onChange={e => setEditContent(e.target.value)}
                            style={{ width: 180, marginRight: 4, background: themeStyles.input, color: themeStyles.color, border: `1px solid ${themeStyles.border}` }}
                          />
                          <button onClick={submitEditMessage}>儲存</button>
                          <button onClick={cancelEdit}>取消</button>
                        </span>
                      ) : (
                        <>
                          {msg.type === 'image' && msg.url ? (
                            <>
                              <img src={API_URL + msg.url} alt="圖片" style={{ maxWidth: 120, maxHeight: 80, borderRadius: 8, marginBottom: 4, cursor: 'pointer' }} onClick={() => setMediaPreview({ type: 'image', url: API_URL + msg.url })} />
                              {msg.filename && <div style={{ fontSize: 12 }}>{highlight(msg.filename)} {formatSize(msg.size)}</div>}
                            </>
                          ) : msg.type === 'video' && msg.url ? (
                            <>
                              <video src={API_URL + msg.url} style={{ maxWidth: 120, maxHeight: 80, borderRadius: 8, marginBottom: 4, cursor: 'pointer' }} onClick={() => setMediaPreview({ type: 'video', url: API_URL + msg.url })} muted />
                              {msg.filename && <div style={{ fontSize: 12 }}>{highlight(msg.filename)} {formatSize(msg.size)}</div>}
                            </>
                          ) : msg.type === 'file' && msg.url ? (
                            <div style={{ fontSize: 13 }}>
                              <a href={API_URL + msg.url} download={msg.filename} style={{ color: '#1976d2' }}>{highlight('下載檔案：' + msg.filename)}</a>
                              {msg.mimetype && <span style={{ marginLeft: 8 }}>{msg.mimetype}</span>}
                              {msg.size && <span style={{ marginLeft: 8 }}>{formatSize(msg.size)}</span>}
                            </div>
                          ) : msg.type === 'voice' ? (
                            <button onClick={() => {
                              if (!audioRefs.current[idx]) {
                                audioRefs.current[idx] = new Audio(API_URL + msg.url);
                              }
                              audioRefs.current[idx].play();
                            }}>▶ 播放語音</button>
                          ) : (
                            <span><b>{highlight(msg.sender)}：</b><span dangerouslySetInnerHTML={{ __html: highlight(msg.content) }} /></span>
                          )}
                          {msg.editedAt && <span style={{ color: '#888', fontSize: 12, marginLeft: 4 }}>(已編輯)</span>}
                          {msg.readBy && msg.readBy.length > 0 && (
                            <span style={{ color: '#2196f3', marginLeft: 8, fontSize: 12 }}>
                              已讀 {msg.readBy.length}
                            </span>
                          )}
                          {msg.sender === username && !msg.isRevoked && (
                            <>
                              <button onClick={() => revokeMessage(msg._id)} style={{ marginLeft: 8 }}>撤回</button>
                              <button onClick={() => startEditMessage(msg)} style={{ marginLeft: 4 }}>編輯</button>
                            </>
                          )}
                        </>
                      )}
                      {/* 時間戳 */}
                      <span style={{ position: 'absolute', right: 10, bottom: -18, fontSize: 11, color: '#aaa' }}>{formatTime(msg.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {currentGroup && (
              <form onSubmit={sendMessage} style={{ display: 'flex', marginBottom: 8 }}>
                <input
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  style={{ flex: 1, marginRight: 8 }}
                  placeholder="輸入訊息..."
                />
                <button type="submit">發送</button>
                <button type="button" onClick={() => fileInputRef.current.click()} style={{ marginLeft: 8 }}>上傳</button>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                  accept="image/*,video/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip,application/x-rar-compressed,application/octet-stream"
                />
              </form>
            )}
            {currentGroup && (
              <div>
                {!recording ? (
                  <button onClick={startRecording} style={{ background: '#bde0fe', padding: 8, border: 'none', borderRadius: 4 }}>
                    🎤 開始錄音
                  </button>
                ) : (
                  <button onClick={stopRecording} style={{ background: '#ffb4a2', padding: 8, border: 'none', borderRadius: 4 }}>
                    ■ 停止並送出語音
                  </button>
                )}
              </div>
            )}
            {currentGroup && (
              <button onClick={() => fetchGroupInfo(currentGroup)} style={{ marginTop: 8, alignSelf: 'flex-end' }}>群組資訊</button>
            )}
          </>
        )}
        {/* 上傳進度條 */}
        {uploadProgress > 0 && (
          <div style={{ margin: '12px 0', width: '100%' }}>
            <div style={{ height: 8, background: '#e0e0e0', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${uploadProgress}%`, height: 8, background: '#4f8cff', transition: 'width 0.2s' }} />
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{uploadProgress}% 上傳中...</div>
          </div>
        )}
      </div>
      {/* 右側群組資訊側欄 */}
      {showGroupInfo && groupInfo && (
        <div style={{ width: 260, background: '#f5f5f5', color: '#222', borderLeft: '1px solid #ccc', padding: 16, position: 'relative' }}>
          <button onClick={() => setShowGroupInfo(false)} style={{ position: 'absolute', top: 8, right: 8 }}>✕</button>
          <h3>群組資訊</h3>
          <div style={{ marginBottom: 12 }}>
            <b>公告：</b>
            <div style={{ background: '#fff', padding: 8, borderRadius: 4, minHeight: 40, marginBottom: 4 }}>{groupInfo.announcement || '（無公告）'}</div>
            {/* 僅 owner/admin 可編輯公告 */}
            {(groupInfo.owner && groupInfo.owner.username === username) || (groupInfo.admins && groupInfo.admins.some(a => a.username === username)) ? (
              <button style={{ marginBottom: 8 }} onClick={() => {
                const newAnn = prompt('請輸入新公告', groupInfo.announcement || '');
                if (newAnn !== null) {
                  handleEditAnnouncement(newAnn);
                }
              }}>編輯公告</button>
            ) : null}
          </div>
          <div>
            <b>成員列表：</b>
            <ul style={{ padding: 0, listStyle: 'none' }}>
              {groupInfo.members.map((m, i) => {
                let role = '';
                if (groupInfo.owner && m._id === groupInfo.owner._id) role = '（群主）';
                else if (groupInfo.admins && groupInfo.admins.some(a => a._id === m._id)) role = '（管理員）';
                else role = '（成員）';
                return (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {m.username} {role}
                    {/* 僅 owner/admin 可踢人，僅 owner 可設/撤管理員、轉讓群主 */}
                    {((groupInfo.owner && groupInfo.owner.username === username) || (groupInfo.admins && groupInfo.admins.some(a => a.username === username))) && role !== '（群主）' && (
                      <button style={{ marginLeft: 8 }} onClick={() => handleKickMember(m._id)}>踢出</button>
                    )}
                    {groupInfo.owner && groupInfo.owner.username === username && role !== '（群主）' && (
                      <button style={{ marginLeft: 4 }} onClick={() => handleSetAdmin(m._id, role !== '（管理員）')}>{role === '（管理員）' ? '撤銷管理員' : '設為管理員'}</button>
                    )}
                    {groupInfo.owner && groupInfo.owner.username === username && role !== '（群主）' && (
                      <button style={{ marginLeft: 4 }} onClick={() => handleTransferOwner(m._id)}>轉讓群主</button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          {/* 僅 owner/admin 可邀請成員 */}
          {(groupInfo.owner && groupInfo.owner.username === username) || (groupInfo.admins && groupInfo.admins.some(a => a.username === username)) ? (
            <button style={{ marginTop: 12 }} onClick={() => {
              const uid = prompt('請輸入要邀請的用戶ID');
              if (uid) handleInviteMember(uid);
            }}>邀請成員</button>
          ) : null}
        </div>
      )}
      {/* 圖片/影片預覽 Modal */}
      {mediaPreview && (
        <div style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: '#000a', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setMediaPreview(null)}>
          {mediaPreview.type === 'image' ? (
            <img src={mediaPreview.url} alt="預覽" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 2px 16px #0008' }} />
          ) : (
            <video src={mediaPreview.url} controls autoPlay style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 2px 16px #0008' }} />
          )}
        </div>
      )}
      {/* 上傳進度條 UI */}
      {uploadProgress > 0 && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#fff', border: '1px solid #2196f3', borderRadius: 8, padding: '8px 24px', zIndex: 1000 }}>
          上傳中... {uploadProgress}%
          <div style={{ width: 200, height: 8, background: '#eee', borderRadius: 4, marginTop: 4 }}>
            <div style={{ width: `${uploadProgress}%`, height: 8, background: '#2196f3', borderRadius: 4 }} />
          </div>
        </div>
      )}
      {/* 推播日誌查詢頁 Modal */}
      {showPushLog && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, maxWidth: 900, width: '90%', maxHeight: '90vh', overflow: 'auto', position: 'relative' }}>
            <h2>推播日誌查詢</h2>
            <button onClick={() => setShowPushLog(false)} style={{ position: 'absolute', right: 32, top: 24 }}>關閉</button>
            {/* 篩選條件 */}
            <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {isAdmin && (
                <input placeholder="userId" style={{ width: 120 }} value={pushLogUserId || ''} onChange={e => setPushLogUserId(e.target.value)} />
              )}
              <select value={pushLogType || ''} onChange={e => setPushLogType(e.target.value)} style={{ width: 120 }}>
                <option value="">全部型別</option>
                <option value="mention">@提及</option>
                <option value="announcement">公告</option>
                <option value="message">一般訊息</option>
                <option value="voice">語音</option>
                <option value="file">檔案</option>
                <option value="system">系統</option>
              </select>
              <input type="date" value={pushLogStart} onChange={e => setPushLogStart(e.target.value)} />
              <input type="date" value={pushLogEnd} onChange={e => setPushLogEnd(e.target.value)} />
              <button onClick={() => { setPushLogSkip(0); fetchPushLogs(pushLogUserId, pushLogType, 0, pushLogLimit, pushLogStart, pushLogEnd); }}>查詢</button>
            </div>
            {/* 分頁按鈕 */}
            <div style={{ marginBottom: 8 }}>
              <button disabled={pushLogSkip === 0} onClick={() => { const newSkip = Math.max(0, pushLogSkip - pushLogLimit); setPushLogSkip(newSkip); fetchPushLogs(pushLogUserId, pushLogType, newSkip, pushLogLimit, pushLogStart, pushLogEnd); }}>上一頁</button>
              <span style={{ margin: '0 12px' }}>第 {pushLogSkip / pushLogLimit + 1} 頁</span>
              <button disabled={pushLogs.length < pushLogLimit} onClick={() => { const newSkip = pushLogSkip + pushLogLimit; setPushLogSkip(newSkip); fetchPushLogs(pushLogUserId, pushLogType, newSkip, pushLogLimit, pushLogStart, pushLogEnd); }}>下一頁</button>
            </div>
            {/* 統計圖表 */}
            <div style={{ display: 'flex', gap: 32, marginBottom: 16 }}>
              {/* 型別分布 Bar Chart */}
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: 4 }}>型別分布</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', height: 80, gap: 8 }}>
                  {pushLogStats.typeCount?.map(t => (
                    <div key={t._id} style={{ textAlign: 'center' }}>
                      <div style={{ background: '#4f8cff', width: 24, height: Math.max(8, t.count * 8), marginBottom: 4, borderRadius: 4 }}></div>
                      <div style={{ fontSize: 12 }}>{t._id}</div>
                      <div style={{ fontSize: 12 }}>{t.count}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* 成功率 Bar Chart */}
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: 4 }}>成功/失敗</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', height: 80, gap: 8 }}>
                  {pushLogStats.statusCount?.map(s => (
                    <div key={s._id} style={{ textAlign: 'center' }}>
                      <div style={{ background: s._id === 'success' ? '#4caf50' : '#e53935', width: 24, height: Math.max(8, s.count * 8), marginBottom: 4, borderRadius: 4 }}></div>
                      <div style={{ fontSize: 12 }}>{s._id}</div>
                      <div style={{ fontSize: 12 }}>{s.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {pushLogLoading ? <div>載入中...</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th>時間</th>
                    <th>型別</th>
                    <th>標題</th>
                    <th>內容</th>
                    <th>狀態</th>
                    <th>錯誤</th>
                    <th>data</th>
                  </tr>
                </thead>
                <tbody>
                  {pushLogs.map(l => (
                    <tr key={l._id} style={{ background: l.status === 'fail' ? '#ffebee' : undefined }}>
                      <td>{new Date(l.createdAt).toLocaleString()}</td>
                      <td>{l.type}</td>
                      <td>{l.title}</td>
                      <td>{l.body}</td>
                      <td style={{ color: l.status === 'fail' ? 'red' : 'green' }}>{l.status}</td>
                      <td>{l.error}</td>
                      <td><pre style={{ maxWidth: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(l.data)}</pre></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App; 