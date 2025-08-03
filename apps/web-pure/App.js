import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import MediaWall from './components/MediaWall';
import FileCabinet from './components/FileCabinet';
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import './MessageAnimations.css';
import { API_URL } from './config';

// 調試信息 - 強制清除緩存
console.log('App.js 載入 (v3.0)，API_URL:', API_URL);

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

// 新增高亮函數
function renderContentWithMention(content, username, group) {
  if (!content) return null;
  // 匹配 @用戶名（支援中英文、數字、底線）
  const mentionRegex = /@([\w\u4e00-\u9fa5]+)/g;
  const parts = [];
  let lastIdx = 0;
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    const start = match.index;
    const end = mentionRegex.lastIndex;
    if (start > lastIdx) parts.push(content.slice(lastIdx, start));
    const mentioned = match[1];
    const isMe = mentioned === username;
    parts.push(
      <span key={start} style={{
        background: isMe ? '#ffd54f' : '#bde0fe',
        color: isMe ? '#d84315' : '#1976d2',
        borderRadius: 4,
        padding: '0 2px',
        fontWeight: isMe ? 'bold' : 'normal'
      }}>@{mentioned}</span>
    );
    lastIdx = end;
  }
  if (lastIdx < content.length) parts.push(content.slice(lastIdx));
  return parts;
}

// 新增：取得用戶頭像
function getUserAvatar(username, groupInfo, profile) {
  if (profile && username === profile.username) {
    return profile.avatar ? API_URL + profile.avatar : API_URL + '/uploads/2.jpeg';
  }
  if (groupInfo && groupInfo.members) {
    const user = groupInfo.members.find(u => u.username === username);
    if (user && user.avatar) return API_URL + user.avatar;
  }
  return API_URL + '/uploads/2.jpeg';
}

// 新增：渲染頭像組件
function renderAvatar(username, groupInfo, profile, isMe = false) {
  const avatarUrl = getUserAvatar(username, groupInfo, profile);
  const avatarStyle = {
    width: 36,
    height: 36,
    borderRadius: 18,
    objectFit: 'cover',
    marginLeft: isMe ? 10 : 0,
    marginRight: isMe ? 0 : 10,
    border: isMe ? '1.5px solid #2196f3' : '1.5px solid #bbb',
    background: '#fff'
  };

  if (avatarUrl) {
    return <img src={avatarUrl} alt="頭像" style={avatarStyle} />;
  } else {
    // 顯示用戶名首字母作為頭像
    const initial = username ? username.charAt(0).toUpperCase() : '?';
    return (
      <div style={{
        ...avatarStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        fontWeight: 'bold',
        color: '#666',
        background: isMe ? '#2196f3' : '#e0e0e0'
      }}>
        {initial}
      </div>
    );
  }
}

// 在App組件外部加：
const profileBtnStyle = {
  position: 'fixed',
  top: 12,
  right: 12,
  zIndex: 1001,
  display: 'flex',
  alignItems: 'center',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '8px 20px 8px 12px',
  borderRadius: 32,
  transition: 'background 0.25s',
  boxShadow: '0 2px 8px #0001',
};

// 在App組件外部加：
const globalBtnStyle = {
  padding: '8px 20px',
  borderRadius: 32,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 16,
  fontWeight: 500,
  transition: 'background 0.25s, color 0.2s',
  boxShadow: '0 2px 8px #0001',
};

// 1. 在檔案頂部加上動畫樣式
<style>{`
.avatar-success-fade {
  opacity: 0;
  transition: opacity 0.5s;
}
.avatar-success-fade.show {
  opacity: 1;
}
`}</style>

function App() {
  const [page, setPage] = useState('login'); // login | register | chat
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
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
  const [playingVoiceId, setPlayingVoiceId] = useState(null);
  const [mentionList, setMentionList] = useState([]); // @建議清單
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showMention, setShowMention] = useState(false);
  const messageInputRef = useRef();
  const messageRefs = useRef({});
  const [editLoadingId, setEditLoadingId] = useState(null);
  const [editOriginalContent, setEditOriginalContent] = useState('');
  const currentGroupObj = groups.find(g => g._id === currentGroup);
  console.log('群組成員', currentGroupObj?.members);
  const [rememberMe, setRememberMe] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profile, setProfile] = useState({ username: '', email: '', avatar: '', createdAt: '' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [crop, setCrop] = useState({
    unit: '%',
    width: 100,
    height: 100,
    x: 0,
    y: 0
  });
  const [avatarSuccess, setAvatarSuccess] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const [contextMenuPos, setContextMenuPos] = useState(null);
  // 在 App 組件 state 區域加：
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [openReadByMsgId, setOpenReadByMsgId] = useState(null);
  const readByRefs = useRef({});
  const [readByPopupPos, setReadByPopupPos] = useState(null);
  const [showGroupMemberList, setShowGroupMemberList] = useState(false);
  // 群組通話狀態
  const [groupCallState, setGroupCallState] = useState({ type: '', members: [], streams: {}, visible: false, isCaller: false });

  // WebRTC 配置
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      // TURN server example（請填入你的 coturn 資訊）
      // { urls: 'turn:your.turn.server:3478', username: 'user', credential: 'pass' }
    ]
  };

  const audioChunksRef = useRef([]);

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
        console.log('收到 group message', msg.optimisticId, msg._id, msg);
          setMessages((prev) => {
          // 1. 用 optimisticId 覆蓋樂觀訊息
            if (msg.optimisticId) {
            // 直接移除所有 optimisticId 相同的 optimistic message，只保留正式訊息
                return [
              ...prev.filter(m => m.optimisticId !== msg.optimisticId),
              msg
            ];
          }
          // 2. 其他情況，不做 filter，直接 append
            return [...prev, msg];
          });
        // 新訊息推播通知（這裡 msg 有定義）
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
        console.log('收到 message edited', { messageId, newContent, editedAt });
        setMessages((prev) => prev.map(m =>
          m._id === messageId ? { ...m, content: newContent, editedAt, loading: false, error: undefined } : m
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
    const isVideo = callState.type === 'video';
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
    setLocalStream(stream);
    if (isVideo) {
      stream.getVideoTracks()[0].enabled = true;
      pc.addTrack(stream.getVideoTracks()[0], stream);
    }
    stream.getAudioTracks()[0].enabled = !isMuted;
    pc.addTrack(stream.getAudioTracks()[0], stream);
    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
      if (isVideo) {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      } else {
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0];
      }
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
    let prevHeight = 0;
    if (append && messagesBoxRef.current) {
      prevHeight = messagesBoxRef.current.scrollHeight;
    }
    let url = `${API_URL}/api/group/${groupId}/messages?limit=30`;
    if (before) url += `&before=${before}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (res.ok && data.messages) {
      setHasMoreMessages(data.hasMore);
      setMessages(prev => append ? [...data.messages, ...prev] : data.messages);
      // 保持滾動位置不跳動
      setTimeout(() => {
        if (append && messagesBoxRef.current) {
          messagesBoxRef.current.scrollTop = messagesBoxRef.current.scrollHeight - prevHeight;
        }
      }, 0);
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

  // 1. 發送訊息失敗5秒未覆蓋則標記失敗並顯示重試
  useEffect(() => {
    messages.forEach(msg => {
      if (msg.optimistic && !msg.failed && !msg.loading) {
        setTimeout(() => {
          setMessages(prev => prev.map(m =>
            m._id === msg._id && m.optimistic && !m.failed && !m.loading ? { ...m, failed: true, loading: false } : m
          ));
        }, 5000);
      }
    });
  }, [messages]);

  // 2. 樂觀語音/圖片/檔案訊息上傳中顯示loading，失敗可重試（略，需在上傳時加 optimisticId、loading 狀態，失敗時設 failed: true，UI 顯示重試）

  // 3. 撤回/編輯訊息時顯示loading，後端確認後移除
  const revokeMessage = (messageId) => {
    if (socket && currentGroup) {
      setMessages(prev => prev.map(m =>
        m._id === messageId || m.optimisticId === messageId ? { ...m, isRevoked: true, loading: true } : m
      ));
      socket.emit('revoke message', { groupId: currentGroup, messageId });
    }
  };
  // 在 group message/revoked/edited 推播時移除 loading 標記（略）

  // 4. 新訊息自動滾動到底部
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // 5. 401自動跳回登入頁
  // 保留優化後的 safeFetch，移除舊的 safeFetch 宣告（約在 551 行）
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

  const fetchGroups = (tk) => {
    fetch(`${API_URL}/api/group/my`, {
      headers: { Authorization: `Bearer ${tk}` }
    })
      .then(res => res.json())
      .then(data => setGroups(Array.isArray(data) ? data : []))
      .catch(() => setGroups([]));
  };

  const handleAuth = async (type) => {
    setError('');
    try {
      let body;
      if (type === 'register') {
        body = JSON.stringify({ username, password: registerPwd, email });
      } else {
        body = JSON.stringify({ username, password });
      }
      const res = await fetch(`${API_URL}/api/auth/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '發生錯誤');
      if (type === 'login' || type === 'register') {
        setToken(data.token);
        setRefreshToken(data.refreshToken);
        setUsername(data.username);
        if (rememberMe) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('refreshToken', data.refreshToken);
          localStorage.setItem('username', data.username);
        } else {
          sessionStorage.setItem('token', data.token);
          sessionStorage.setItem('refreshToken', data.refreshToken);
          sessionStorage.setItem('username', data.username);
        }
        setPage('chat');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (message.trim() && socket && currentGroup) {
      // 樂觀更新
      const optimisticId = 'optimistic-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      setMessages(prev => [
        ...prev,
        {
          _id: optimisticId,
          optimisticId,
          sender: username,
          content: message,
          createdAt: new Date(),
          type: 'text',
          isRevoked: false,
          readBy: [],
          optimistic: true,
          loading: true // 新增
        }
      ]);
      socket.emit('group message', { groupId: currentGroup, content: message, optimisticId });
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
    localStorage.removeItem('username');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('username');
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
  const startRecording = async (retryBlob, retryOptimisticId) => {
    console.log('開始錄音');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('瀏覽器不支援錄音');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('getUserMedia 成功', stream);
      const mr = new window.MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        console.log('ondataavailable', e.data, e.data.size);
        audioChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        console.log('onstop', audioChunksRef.current);
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        uploadVoiceBlob(blob);
      };
      setMediaRecorder(mr);
      setRecording(true);
      mr.start();
    } catch (err) {
      console.log('getUserMedia 失敗', err);
      alert('無法取得麥克風權限，請檢查瀏覽器設定');
    }
  };

  // 上傳語音 blob，帶進度、樂觀訊息、重試
  const uploadVoiceBlob = (blob, retryOptimisticId) => {
    console.log('上傳語音', blob, typeof blob);
    if (!(blob instanceof Blob)) {
      alert('錄音資料異常，請重試或檢查麥克風權限');
      return;
    }
    const optimisticId = retryOptimisticId || (
      'optimistic-' +
      Date.now() +
      '-' +
      Math.random().toString(36).slice(2, 10) +
      '-' +
      (window.crypto?.getRandomValues?.(new Uint32Array(1))[0] || Math.random())
    );
    setMessages(prev => {
      const optimisticMsg = {
        _id: optimisticId,
        optimisticId,
        sender: username,
        type: 'voice',
        loading: true,
        progress: 0,
        optimistic: true,
        blob
      };
      console.log('插入樂觀語音訊息', optimisticMsg);
      const next = [...prev, optimisticMsg];
      console.log('插入後 messages:', next);
      return next;
    });
    const formData = new FormData();
    formData.append('voice', blob, 'voice.webm');
    formData.append('groupId', currentGroup);
    formData.append('optimisticId', optimisticId); // 新增
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/upload/voice`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setMessages(prev => prev.map(m => m._id === optimisticId ? { ...m, progress: percent } : m));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // 成功，等待後端推播覆蓋
      } else {
        setMessages(prev => prev.map(m => m._id === optimisticId ? { ...m, loading: false, failed: true, error: '上傳失敗', progress: 0, blob } : m));
      }
    };
    xhr.onerror = () => {
      setMessages(prev => prev.map(m => m._id === optimisticId ? { ...m, loading: false, failed: true, error: '上傳失敗', progress: 0, blob } : m));
    };
    xhr.send(formData);
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setRecording(false);
    }
  };

  // 編輯訊息
  const startEditMessage = (msg) => {
    setEditMsgId(msg._id);
    setEditContent(msg.content);
    setEditOriginalContent(msg.content);
  };
  // 1. 發送失敗訊息旁顯示重試按鈕
  const retrySendMessage = (msg) => {
    if (socket && currentGroup) {
      setMessages(prev => prev.map(m => m._id === msg._id ? { ...m, failed: false, loading: true } : m));
      socket.emit('group message', { groupId: currentGroup, content: msg.content, optimisticId: msg.optimisticId });
    }
  };
  // 3. 編輯訊息時樂觀更新，失敗自動回復原內容並提示
  const submitEditMessage = async (customId, customContent) => {
    const id = customId || editMsgId;
    const content = typeof customContent === 'string' ? customContent : editContent;
    console.log('編輯送出', { id, content });
    if (!id || !content.trim()) return;
    setEditLoadingId(id);
    setMessages(prev => prev.map(m =>
      m._id === id ? { ...m, content, editedAt: new Date(), loading: true, error: undefined } : m
    ));
    setEditMsgId(null);
    try {
      if (socket && currentGroup) {
        socket.emit('edit message', { groupId: currentGroup, messageId: id, newContent: content });
      }
    } catch (e) {
      setMessages(prev => prev.map(m =>
        m._id === id ? { ...m, content: editOriginalContent, error: '編輯失敗', loading: false } : m
      ));
    }
  };
  const cancelEdit = () => {
    setEditMsgId(null);
    setEditContent('');
  };

  // 上傳多媒體訊息
  const handleFileChange = async (e, retryFile, retryType, retryOptimisticId) => {
    const file = retryFile || e.target.files[0];
    if (!file || !currentGroup) return;
    const type = retryType || getFileType(file);
    const optimisticId = retryOptimisticId || ('optimistic-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    // 樂觀訊息
    setMessages(prev => [
      ...prev,
      {
        _id: optimisticId,
        optimisticId,
        sender: username,
        type,
        filename: file.name,
        size: file.size,
        url: URL.createObjectURL(file), // 新增本地預覽 url
        loading: true,
        progress: 0,
        optimistic: true,
        createdAt: Date.now() // 避免 Invalid Date
      }
    ]);
    const formData = new FormData();
    formData.append('media', file);
    formData.append('groupId', currentGroup);
    formData.append('type', type);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/upload/media`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setMessages(prev => prev.map(m => m._id === optimisticId ? { ...m, progress: percent } : m));
      }
    };
    xhr.onload = () => {
      setUploadProgress(0);
      setUploadKey(k => k + 1);
      if (e && e.target) e.target.value = '';
      if (xhr.status >= 200 && xhr.status < 300) {
        // 成功，等待後端推播覆蓋
      } else {
        // 失敗，設 failed
        setMessages(prev => prev.map(m => m._id === optimisticId ? { ...m, loading: false, failed: true, error: '上傳失敗', progress: 0, file, type } : m));
      }
    };
    xhr.onerror = () => {
      setUploadProgress(0);
      setMessages(prev => prev.map(m => m._id === optimisticId ? { ...m, loading: false, failed: true, error: '上傳失敗', progress: 0, file, type } : m));
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

  // 同步 playingVoiceId，確保當 messages 更新時，如果 playingVoiceId 指向的消息不存在了，就重置為 null
  useEffect(() => {
    if (playingVoiceId && !messages.some(m => m._id === playingVoiceId)) setPlayingVoiceId(null);
  }, [messages, playingVoiceId]);

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

  // 處理輸入框變化，偵測@自動補全
  const handleMessageInput = (e) => {
    const val = e.target.value;
    setMessage(val);
    const cursor = e.target.selectionStart;
    const beforeCursor = val.slice(0, cursor);
    const match = beforeCursor.match(/@([\w\u4e00-\u9fa5]*)$/);
    if (match && currentGroup) {
      const group = groups.find(g => g._id === currentGroup);
      if (group && group.members) {
        const keyword = match[1].toLowerCase();
        const filtered = group.members.filter(u => u.username.toLowerCase().includes(keyword));
        setMentionList(filtered);
        setMentionIndex(0);
        setShowMention(filtered.length > 0);
      }
    } else {
      setShowMention(false);
    }
  };
  // 處理鍵盤事件
  const handleMessageKeyDown = (e) => {
    if (showMention && mentionList.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % mentionList.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + mentionList.length) % mentionList.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        insertMention(mentionList[mentionIndex]);
      }
    }
  };
  // 插入@用戶名
  const insertMention = (user) => {
    if (!user) return;
    const input = messageInputRef.current;
    if (!input) return;
    const cursor = input.selectionStart;
    const val = message;
    const before = val.slice(0, cursor).replace(/@([\w\u4e00-\u9fa5]*)$/, '@' + user.username + ' ');
    const after = val.slice(cursor);
    const newVal = before + after;
    setMessage(newVal);
    setShowMention(false);
    setTimeout(() => {
      input.focus();
      input.selectionStart = input.selectionEnd = before.length;
    }, 0);
  };

  // 新增 retryEditMessage 函數
  const retryEditMessage = (msg) => {
    setEditMsgId(msg._id);
    setEditContent(msg.content);
    setEditOriginalContent(msg.content);
    setTimeout(() => submitEditMessage(msg._id, msg.content), 0);
  };

  // 頁面刷新時自動還原 username
  useEffect(() => {
    let un = localStorage.getItem('username') || sessionStorage.getItem('username');
    if (un) setUsername(un);
    let tk = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (tk) setToken(tk);
    let rt = localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken');
    if (rt) setRefreshToken(rt);
    // 解析 userId
    if (tk) {
      try {
        const payload = JSON.parse(atob(tk.split('.')[1]));
        setUserId(payload.id);
      } catch {}
    }
  }, []);

  // 頁面初始化時自動檢查 token，無效則跳轉登入
  useEffect(() => {
    let tk = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!tk) {
      setPage('login');
      setToken('');
      setRefreshToken('');
      setUsername('');
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('username');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('refreshToken');
      sessionStorage.removeItem('username');
    }
  }, []);

  // 每次 token 變更時自動檢查有效性，401 時自動登出
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/group/my`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      if (res.status === 401) {
        setPage('login');
        setToken('');
        setRefreshToken('');
        setUsername('');
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('username');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('refreshToken');
        sessionStorage.removeItem('username');
      }
    }).catch(() => {});
  }, [token]);

  // 當 groups 變化且 socket 存在時，自動加入所有群組房間
  useEffect(() => {
    if (socket && groups.length > 0) {
      const groupIds = groups.map(g => g._id);
      socket.emit('join group', { groupIds });
      console.log('已發送 join group', groupIds);
    }
  }, [socket, groups]);

  // 取得個人資料
  const fetchProfile = async () => {
    const res = await fetch(`${API_URL}/api/user/profile`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      alert('登入已過期，請重新登入');
      setPage('login');
      setToken('');
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setProfile(data);
    }
  };
  useEffect(() => {
    if (page === 'chat' && token) fetchProfile();
  }, [page, token]);
  // 上傳頭像
  const handleAvatarUpload = async () => {
    if (!avatarFile) return;
    const formData = new FormData();
    formData.append('avatar', avatarFile);
    try {
      const res = await fetch(`${API_URL}/api/user/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        await fetchProfile();
        // 上傳頭像成功後自動刷新群組資訊和群組列表
        if (currentGroup) {
          await fetchGroupInfo(currentGroup);
        }
        // 刷新群組列表以更新成員頭像
        await fetchGroups(token);
        setAvatarFile(null);
        setAvatarPreview(null);
        setShowCropModal(false);
        setAvatarSuccess(true);
        setTimeout(() => setAvatarSuccess(false), 2000);
      } else {
        alert('上傳失敗');
      }
    } catch (error) {
      console.error('上傳頭像失敗:', error);
      alert('上傳失敗');
    }
  };

  const handleCropComplete = async () => {
    console.log('開始裁切處理...');
    if (!avatarFile || !avatarPreview) {
      console.log('缺少文件或預覽');
      return;
    }
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      console.log('圖片載入完成，開始裁切...');
      console.log('裁切參數:', crop);
      console.log('圖片尺寸:', img.naturalWidth, 'x', img.naturalHeight);
      
      // 使用更可靠的方法獲取圖片元素
      const imgElements = document.querySelectorAll('img');
      const cropImg = Array.from(imgElements).find(img => img.src === avatarPreview);
      
      if (!cropImg) {
        console.log('找不到裁切圖片元素');
        return;
      }
      
      const imgRect = cropImg.getBoundingClientRect();
      console.log('圖片元素尺寸:', imgRect.width, 'x', imgRect.height);
      
      const scaleX = img.naturalWidth / imgRect.width;
      const scaleY = img.naturalHeight / imgRect.height;
      console.log('縮放比例:', scaleX, scaleY);
      
      // 設置畫布大小為裁切區域大小
      canvas.width = crop.width;
      canvas.height = crop.height;
      
      // 繪製裁切後的圖片
      ctx.drawImage(
        img,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        crop.width,
        crop.height
      );
      
      console.log('裁切完成，轉換為 blob...');
      
      // 轉換為 blob 並創建新文件
      canvas.toBlob((blob) => {
        console.log('Blob 創建成功，大小:', blob.size);
        const croppedFile = new File([blob], avatarFile.name, { type: avatarFile.type });
        setAvatarFile(croppedFile);
        // 更新預覽為裁切後的圖片
        const croppedPreview = URL.createObjectURL(blob);
        setAvatarPreview(croppedPreview);
        setShowCropModal(false);
        console.log('裁切處理完成');
      }, 'image/jpeg', 0.9);
    };
    
    img.onerror = (error) => {
      console.error('圖片載入失敗:', error);
    };
    
    img.src = avatarPreview;
  };

  // 修改 Email
  const handleEmailSave = async () => {
    if (!newEmail) return;
    const res = await fetch(`${API_URL}/api/user/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: newEmail })
    });
    if (res.ok) {
      await fetchProfile();
      setEditingEmail(false);
      setEmailSuccess(true);
      setTimeout(() => setEmailSuccess(false), 2000);
    } else {
      alert('Email 更新失敗');
    }
  };

  // 在App組件內部 useEffect 加全域樣式覆蓋
  React.useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      button, .global-btn {
        padding: 8px 20px !important;
        border-radius: 32px !important;
        border: none !important;
        background: #f5f5f5 !important;
        color: #222 !important;
        cursor: pointer !important;
        font-size: 16px !important;
        font-weight: 500 !important;
        transition: background 0.25s, color 0.2s !important;
        box-shadow: 0 2px 8px #0001 !important;
      }
      button:hover, .global-btn:hover {
        background: #e0e0e0 !important;
      }
      button:active, .global-btn:active {
        background: #e0e0e0 !important;
      }
      .button-primary {
        background: #2196f3 !important;
        color: #fff !important;
      }
      .button-primary:hover {
        background: #1976d2 !important;
      }
      .button-secondary {
        background: #f5f5f5 !important;
        color: #222 !important;
      }
      .button-secondary:hover {
        background: #e0e0e0 !important;
      }
      .button-danger {
        background: #e53935 !important;
        color: #fff !important;
      }
      .button-danger:hover {
        background: #b71c1c !important;
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // 點擊其他地方時自動關閉選單
  useEffect(() => {
    const closeMenu = () => setOpenActionMenuId(null);
    if (openActionMenuId !== null) {
      window.addEventListener('click', closeMenu);
      return () => window.removeEventListener('click', closeMenu);
    }
  }, [openActionMenuId]);

  // 點擊外部自動關閉已讀名單
  useEffect(() => {
    const closeReadBy = () => setOpenReadByMsgId(null);
    if (openReadByMsgId !== null) {
      window.addEventListener('click', closeReadBy);
      return () => window.removeEventListener('click', closeReadBy);
    }
  }, [openReadByMsgId]);

  // 在 function App() 內、return 之前加上：
  const filteredMessages = messages.filter(
    m =>
      // 不是 optimistic 文字、圖片、影片、檔案(載入中)
      !((['text', 'image', 'video', 'file'].includes(m.type)) && m.optimistic && m.loading) &&
      // 不是 optimisticId 被正式訊息覆蓋
      !messages.some(
        real =>
          real._id !== m._id &&
          real.optimisticId &&
          m.optimisticId &&
          String(real.optimisticId) === String(m.optimisticId)
      )
  );

  // 檔案下載函數
  const downloadFile = async (msg) => {
    const res = await fetch(`${API_URL}/api/download/${msg._id}`);
    if (!res.ok) {
      alert('下載失敗');
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = msg.filename || 'file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleVideoCallInvite = (targetUserId) => {
    if (!socket || !currentGroup) return;
    setCallState({ status: 'calling', from: userId, to: targetUserId, groupId: currentGroup, visible: true, type: 'video' });
    socket.emit('call:invite', { from: userId, to: targetUserId, groupId: currentGroup, type: 'video' });
    console.log('發送視訊通話邀請', { from: userId, to: targetUserId, groupId: currentGroup });
  };

  // 處理群組語音/視訊通話按鈕
  const handleGroupAudioCall = () => {
    if (!socket || !currentGroup) return;
    socket.emit('group-call:invite', { groupId: currentGroup, type: 'audio' });
    setGroupCallState({ type: 'audio', members: [], streams: {}, visible: true, isCaller: true });
  };
  const handleGroupVideoCall = () => {
    if (!socket || !currentGroup) return;
    socket.emit('group-call:invite', { groupId: currentGroup, type: 'video' });
    setGroupCallState({ type: 'video', members: [], streams: {}, visible: true, isCaller: true });
  };

  // 處理收到群組通話邀請
  useEffect(() => {
    if (!socket) return;
    socket.on('group-call:invite', ({ groupId, type }) => {
      if (groupId === currentGroup) {
        setGroupCallState({ type, members: [], streams: {}, visible: true, isCaller: false });
      }
    });
    return () => socket.off('group-call:invite');
  }, [socket, currentGroup]);

  // 錄音支援性偵測
  function isRecordingSupported() {
    return (
      typeof window !== 'undefined' &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
      typeof window.MediaRecorder !== 'undefined'
    );
  }

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
          {page === 'register' && (
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              style={{ width: '100%', marginBottom: 8, padding: 8 }}
            />
          )}
          <input
            type="password"
            value={page === 'register' ? registerPwd : password}
            onChange={e => page === 'register' ? setRegisterPwd(e.target.value) : setPassword(e.target.value)}
            placeholder="密碼"
            style={{ width: '100%', marginBottom: 8, padding: 8 }}
          />
          {page === 'register' && <div style={{ color: pwdStrength === '強度良好' ? 'green' : 'red', marginBottom: 8 }}>{pwdStrength}</div>}
          <div style={{ margin: '8px 0' }}>
            <label>
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} /> 記得這個裝置？
            </label>
          </div>
          <button type="submit" className="button-primary" style={{ width: '100%', padding: 8 }}>
            {page === 'login' ? '登入' : '註冊'}
          </button>
        </form>
        <button onClick={() => setPage(page === 'login' ? 'register' : 'login')} className="button-secondary" style={{ marginTop: 8 }}>
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
          {(Array.isArray(groups) ? groups : []).map((g, idx) => (
            <li key={g._id || idx} style={{ marginBottom: 4 }}>
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
          <button onClick={createGroup} className="button-primary" style={{ width: '100%' }}>建立群組</button>
        </div>
        <div style={{ marginTop: 8 }}>
          <input
            value={joinGroupId}
            onChange={e => setJoinGroupId(e.target.value)}
            placeholder="加入群組ID"
            style={{ width: '100%', marginBottom: 4, padding: 4 }}
          />
          <button onClick={joinGroup} className="button-primary" style={{ width: '100%' }}>加入群組</button>
        </div>
        <button onClick={logout} className="button-danger" style={{ marginTop: 16, width: '100%' }}>登出</button>
        <button onClick={() => {
          setShowPushLog(true);
          fetchPushLogs();
        }} className="button-secondary" style={{ marginTop: 16, width: '100%' }}>推播日誌查詢</button>
      </div>
      {/* 中間聊天區 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>聊天室 {currentGroup && groups.find(g => g._id === currentGroup)?.name}</h2>
          <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} className="button-secondary" style={{ marginLeft: 8 }}>
            {theme === 'light' ? '🌙 深色' : '☀️ 淺色'}
          </button>
        </div>
        {/* 新增 Tab 切換 */}
        {currentGroup && (
          <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
            <button onClick={() => setActiveTab('chat')} className="button-secondary" style={{ background: activeTab === 'chat' ? '#bde0fe' : '#eee' }}>聊天</button>
            <button onClick={() => setActiveTab('media')} className="button-secondary" style={{ background: activeTab === 'media' ? '#bde0fe' : '#eee' }}>媒體牆</button>
            <button onClick={() => setActiveTab('files')} className="button-secondary" style={{ background: activeTab === 'files' ? '#bde0fe' : '#eee' }}>檔案櫃</button>
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
            {/* 群組成員按鈕區塊，永遠顯示在搜尋框下方、訊息區上方 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {currentGroupObj && Array.isArray(currentGroupObj.members) && (
                <div style={{ margin: '12px 0', background: '#f8f9fa', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center' }}>
                  <b style={{ marginRight: 8 }}>群組成員：</b>
                  <button
                    onClick={() => setShowGroupMemberList(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0
                    }}
                  >
                    {currentGroupObj.members.slice(0, 3).map((u, idx) => (
                      <span key={u._id || idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 48 }}>
                        <img
                          src={u.avatar ? API_URL + u.avatar : API_URL + '/uploads/2.jpeg'}
                          alt={u.username}
                          style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid #bbb', background: '#fff', marginBottom: 2 }}
                        />
                        <span style={{ fontSize: 12, color: '#222', textAlign: 'center', wordBreak: 'break-all' }}>{u.username}</span>
                  </span>
                ))}
                    {currentGroupObj.members.length > 3 && (
                      <span style={{ fontSize: 24, color: '#888', marginLeft: 4 }}>...</span>
                    )}
                  </button>
              </div>
            )}
              {/* 群組語音/視訊通話按鈕 */}
              <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
                <button style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }} onClick={handleGroupAudioCall}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.72 19.72 0 0 1 3 5.18 2 2 0 0 1 5 3h2.09a2 2 0 0 1 2 1.72c.13 1.05.37 2.07.72 3.06a2 2 0 0 1-.45 2.11l-.27.27a16 16 0 0 0 6.29 6.29l.27-.27a2 2 0 0 1 2.11-.45c.99.35 2.01.59 3.06.72A2 2 0 0 1 22 16.92z"></path></svg>
                  群組語音
                </button>
                <button style={{ background: '#43a047', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }} onClick={handleGroupVideoCall}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="15" height="10" rx="2" ry="2"></rect><polygon points="23 7 16 12 23 17 23 7"></polygon></svg>
                  群組視訊
                </button>
              </div>
            </div>
            {/* 語音通話彈窗 */}
            {callState.visible && (
              <div style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: '#0005', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 2px 16px #0004', minWidth: 320, maxWidth: 400, padding: 32, position: 'relative', textAlign: 'center' }}>
                  {callState.status === 'calling' && <div>正在呼叫對方...</div>}
                  {callState.status === 'incoming' && <div>來電：{callState.from}</div>}
                  {callState.status === 'accepted' && <div>通話中...</div>}
                  {/* 視訊通話顯示 video */}
                  {callState.type === 'video' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '12px 0' }}>
                      <video ref={remoteVideoRef} autoPlay playsInline style={{ width: 220, height: 160, background: '#000', borderRadius: 8, marginBottom: 8 }} />
                      <video ref={localVideoRef} autoPlay playsInline muted style={{ width: 100, height: 72, background: '#222', borderRadius: 8, position: 'absolute', right: 16, bottom: 16, border: '2px solid #fff' }} />
                    </div>
                  )}
                  {/* 語音通話顯示 audio */}
                  {callState.type !== 'video' && (
                  <audio ref={remoteAudioRef} autoPlay style={{ display: remoteStream ? 'block' : 'none', margin: '16px auto' }} />
                  )}
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
            <div ref={messagesBoxRef} onScroll={handleScroll} style={{ border: `1px solid ${themeStyles.border}`, minHeight: 200, padding: 10, marginBottom: 10, height: 450, overflowY: 'auto', background: theme === 'dark' ? '#181818' : '#fafbfc', position: 'relative', width: '50vw', maxWidth: 700, minWidth: 320 }}>
              {loadingMoreMessages && (
                <div style={{ textAlign: 'center', color: '#888', marginBottom: 8 }}>載入中...</div>
              )}
              {!hasMoreMessages && (
                <div style={{ textAlign: 'center', color: '#888', marginBottom: 8 }}>已無更多歷史訊息</div>
              )}
              {/* 在渲染區塊前加上： */}
              <TransitionGroup>
                {filteredMessages.map((msg, idx) => {
                  if (msg.type === 'voice') {
                    console.log('渲染語音訊息', msg._id, 'playingVoiceId:', playingVoiceId);
                  }
                  // 在渲染已讀頭像前 log 出自己 username 與 msg.readBy
                  console.log('自己 username:', username, 'msg.readBy:', msg.readBy);
                  // 統一處理 readBy，只顯示有 username 且不是自己的 user
                  const readByUsers = (msg.readBy || []).filter(user => typeof user === 'object' && user.username && user.username !== username);
                  if (!messageRefs.current[msg._id]) {
                    messageRefs.current[msg._id] = React.createRef();
                  }
                  const isMe = msg.sender === username;
                  return (
                    <CSSTransition
                      key={msg._id}
                      timeout={300}
                      classNames="msg-anim"
                      nodeRef={messageRefs.current[msg._id]}
                    >
                      <div ref={messageRefs.current[msg._id]} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', marginBottom: 10 }}>
                        {/* 頭像 */}
                        {renderAvatar(msg.sender, groupInfo, profile, isMe)}
                        {/* 泡泡+已讀同一 flex row，順序根據 isMe 調整 */}
                        <div style={{ display: 'flex', flexDirection: isMe ? 'row' : 'row-reverse', alignItems: 'flex-end' }}>
                          {/* 已讀標籤（泡泡內側） */}
                          {readByUsers.length > 0 && (
                            <div
                              ref={el => { if (el) readByRefs.current[msg._id] = el; }}
                              style={{ display: 'flex', alignItems: 'flex-end', gap: 6, margin: isMe ? '0 8px 0 0' : '0 0 0 8px', alignSelf: 'flex-end', minWidth: 24, cursor: 'pointer' }}
                              onClick={e => {
                                e.stopPropagation();
                                setOpenReadByMsgId(msg._id === openReadByMsgId ? null : msg._id);
                                if (msg._id !== openReadByMsgId && readByRefs.current[msg._id]) {
                                  const rect = readByRefs.current[msg._id].getBoundingClientRect();
                                  setReadByPopupPos({ x: rect.right + 6, y: rect.top });
                                }
                              }}
                            >
                              {readByUsers.slice(0, 3).map(user => (
                                <div key={user._id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32 }}>
                                  {user.avatar ? (
                                    <img
                                      src={API_URL + user.avatar}
                                      alt={user.username}
                                      title={user.username}
                                      style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', border: '1px solid #fff', boxShadow: '0 1px 2px #0001', marginBottom: 2 }}
                                    />
                                  ) : (
                                    <div style={{ 
                                      width: 22, 
                                      height: 22, 
                                      borderRadius: '50%', 
                                      background: '#e0e0e0',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 10,
                                      fontWeight: 'bold',
                                      color: '#666',
                                      border: '1px solid #fff', 
                                      boxShadow: '0 1px 2px #0001', 
                                      marginBottom: 2 
                                    }}>
                                      {user.username ? user.username.charAt(0).toUpperCase() : '?'}
                                    </div>
                                  )}
                                  <span style={{ fontSize: 11, color: '#222', textAlign: 'center', wordBreak: 'break-all' }}>{user.username}</span>
                        </div>
                              ))}
                              {readByUsers.length > 3 && (
                                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#e0e3eb', color: '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>...</div>
                              )}
                              {/* 已讀名單彈窗 */}
                              {openReadByMsgId === msg._id && (
                                <div style={{ position: 'fixed', left: readByPopupPos?.x || 120, top: readByPopupPos?.y || 120, background: '#fff', border: '1px solid #ccc', borderRadius: 8, boxShadow: '0 2px 12px #0003', zIndex: 10001, minWidth: 160, padding: 12 }}>
                                  <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15, color: '#1976d2', textAlign: 'center' }}>已讀名單</div>
                                  {readByUsers.length === 0 ? (
                                    <div style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>無其他人已讀</div>
                                  ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
                                      {readByUsers.map(user => (
                                        <div key={user._id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 56 }}>
                                          {user.avatar ? (
                                            <img src={API_URL + user.avatar} alt={user.username} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee', marginBottom: 4 }} />
                                          ) : (
                                            <div style={{ 
                                              width: 36, 
                                              height: 36, 
                                              borderRadius: '50%', 
                                              background: '#e0e0e0',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              fontSize: 16,
                                              fontWeight: 'bold',
                                              color: '#666',
                                              border: '1px solid #eee', 
                                              marginBottom: 4 
                                            }}>
                                              {user.username ? user.username.charAt(0).toUpperCase() : '?'}
                                            </div>
                                          )}
                                          <span style={{ fontSize: 13, color: '#222', textAlign: 'center', wordBreak: 'break-all' }}>{user.username}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {/* 泡泡本體 */}
                          <div
                            style={{
                              maxWidth: 340,
                              background: isMe
                                ? themeStyles.bubbleMe
                                : themeStyles.bubbleOther,
                              color: isMe ? (theme === 'dark' ? '#fff' : '#222') : '#222',
                              borderRadius: 16,
                              padding: '8px 14px 22px 14px',
                              position: 'relative',
                              boxShadow: hoveredMsgId === msg._id ? '0 4px 16px #2196f355' : '0 1px 2px #0001',
                              marginLeft: isMe ? 0 : 8,
                              marginRight: isMe ? 8 : 0,
                              transform: hoveredMsgId === msg._id ? 'scale(1.04)' : 'scale(1)',
                              transition: 'box-shadow 0.2s, transform 0.18s',
                              cursor: 'pointer',
                            }}
                            onContextMenu={e => {
                              e.preventDefault();
                              setOpenActionMenuId(msg._id === openActionMenuId ? null : msg._id);
                              setContextMenuPos({ x: e.clientX, y: e.clientY });
                            }}
                            onMouseEnter={() => setHoveredMsgId(msg._id)}
                            onMouseLeave={() => setHoveredMsgId(null)}
                          >
                          {msg.isRevoked ? (
                            <span style={{ color: '#888' }}>（已撤回）</span>
                          ) : editMsgId === msg._id ? (
                            <span>
                              <input
                                value={editContent}
                                onChange={e => setEditContent(e.target.value)}
                                style={{ width: 180, marginRight: 4, background: themeStyles.input, color: themeStyles.color, border: `1px solid ${themeStyles.border}` }}
                              />
                                <button onClick={() => submitEditMessage()} className="button-primary" style={{ marginRight: 4 }}>儲存</button>
                                <button onClick={cancelEdit} className="button-secondary">取消</button>
                            </span>
                          ) : (
                            <>
                              {msg.type === 'image' && msg.url ? (
                                  <img
                                    src={msg.url.startsWith('blob:') ? msg.url : API_URL + msg.url}
                                    alt="圖片"
                                    style={{ maxWidth: 220, maxHeight: 180, borderRadius: 8, marginBottom: 4, cursor: 'pointer', display: 'block', objectFit: 'cover' }}
                                    onClick={() => setMediaPreview({ type: 'image', url: msg.url.startsWith('blob:') ? msg.url : API_URL + msg.url })}
                                  />
                              ) : msg.type === 'video' && msg.url ? (
                                  <div style={{ position: 'relative', width: 220, height: 180, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
                                    <video
                                      src={msg.url.startsWith('blob:') ? msg.url : API_URL + msg.url}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                      poster={msg.poster || ''}
                                      controls
                                      preload="metadata"
                                    />
                                  </div>
                              ) : msg.type === 'file' && msg.url ? (
                                <div style={{ fontSize: 13 }}>
                                    <a
                                      href="#"
                                      onClick={e => { e.preventDefault(); downloadFile(msg); }}
                                      style={{ color: '#1976d2' }}
                                    >
                                      {escapeHTML('下載檔案：' + (msg.filename || 'file'))}
                                    </a>
                                  {msg.mimetype && <span style={{ marginLeft: 8 }}>{msg.mimetype}</span>}
                                  {msg.size && <span style={{ marginLeft: 8 }}>{formatSize(msg.size)}</span>}
                                </div>
                              ) : msg.type === 'voice' ? (
                                <button
                                  onClick={async () => {
                                      console.log('=== 語音播放按鈕被點擊 ===');
                                    if (!msg.url) {
                                      alert('找不到語音檔案');
                                      return;
                                    }
                                      console.log('點擊語音播放按鈕:', { 
                                        msgId: msg._id, 
                                        optimisticId: msg.optimisticId, 
                                        currentPlaying: playingVoiceId 
                                      });
                                    const audioUrl = API_URL + msg.url;
                                    try {
                                        if (!audioRefs.current[msg._id]) {
                                          audioRefs.current[msg._id] = new Audio(audioUrl);
                                      } else {
                                          audioRefs.current[msg._id].src = audioUrl;
                                      }
                                        console.log('設置 playingVoiceId 為:', msg._id);
                                      setPlayingVoiceId(msg._id);
                                        audioRefs.current[msg._id].onended = () => {
                                          console.log('語音播放結束，重置 playingVoiceId');
                                          setPlayingVoiceId(null);
                                        };
                                        await audioRefs.current[msg._id].play();
                                    } catch (e) {
                                        console.log('播放失敗，重置 playingVoiceId');
                                      setPlayingVoiceId(null);
                                      alert('無法播放語音：' + (e.message || e));
                                    }
                                  }}
                                  style={{ position: 'relative' }}
                                >
                                  {playingVoiceId === msg._id ? (
                                    <span className="voice-wave">
                                      <span className="bar bar1" />
                                      <span className="bar bar2" />
                                      <span className="bar bar3" />
                                    </span>
                                  ) : (
                                    '▶ 播放語音'
                                  )}
                                </button>
                              ) : (
                                  <span>{renderContentWithMention(msg.content, username, groups.find(g => g._id === currentGroup))}</span>
                              )}
                              {msg.editedAt && <span style={{ color: '#888', fontSize: 12, marginLeft: 4 }}>(已編輯)</span>}
                              {msg.failed && (
                                  <button onClick={() => retrySendMessage(msg)} className="button-danger" style={{ marginLeft: 8 }}>重試</button>
                              )}
                              {msg.loading && (
                                <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>（載入中）</span>
                              )}
                              {msg.error && (
                                <span style={{ color: 'red', fontSize: 12, marginLeft: 8 }}>{msg.error}</span>
                              )}
                              {msg.error === '編輯失敗' && (
                                  <button onClick={() => retryEditMessage(msg)} className="button-danger" style={{ marginLeft: 8 }}>重試</button>
                              )}
                            </>
                          )}
                          {/* 時間戳 */}
                          <span style={{ position: 'absolute', right: 10, bottom: 2, fontSize: 11, color: '#aaa' }}>{formatTime(msg.createdAt)}</span>
                        </div>
                        </div>
                        {/* 操作選單（右鍵觸發） */}
                        {openActionMenuId === msg._id && (
                          <div className="menu-anim" style={{ position: 'fixed', left: contextMenuPos?.x, top: contextMenuPos?.y, background: '#fff', border: '1px solid #ccc', borderRadius: 6, boxShadow: '0 2px 8px #0002', zIndex: 10000, minWidth: 80 }}>
                            {isMe && <button onClick={() => { startEditMessage(msg); setOpenActionMenuId(null); }} className="button-secondary" style={{ width: '100%', borderRadius: 0, borderBottom: '1px solid #eee' }}>編輯</button>}
                            {(msg.type === 'image' || msg.type === 'video') && (
                              <button onClick={() => { downloadFile(msg); setOpenActionMenuId(null); }} className="button-secondary" style={{ width: '100%', borderRadius: 0, borderBottom: '1px solid #eee' }}>下載</button>
                            )}
                            {isMe && <button onClick={() => { revokeMessage(msg._id); setOpenActionMenuId(null); }} className="button-danger" style={{ width: '100%', borderRadius: 0 }}>撤回</button>}
                          </div>
                        )}
                      </div>
                    </CSSTransition>
                  );
                })}
              </TransitionGroup>
            </div>
            {currentGroup && (
              <form onSubmit={sendMessage} style={{ display: 'flex', marginBottom: 8 }}>
                <input
                  ref={messageInputRef}
                  value={message}
                  onChange={handleMessageInput}
                  onKeyDown={handleMessageKeyDown}
                  style={{ flex: 1, marginRight: 8 }}
                  placeholder="輸入訊息..."
                />
                <button type="submit" className="button-primary">發送</button>
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
              <>
                <div style={{ marginBottom: 4 }}>
                  {isRecordingSupported() ? (
                    <span style={{ color: 'green', fontWeight: 500 }}>
                      您的瀏覽器支援語音錄音
                    </span>
                  ) : (
                    <span style={{ color: 'red', fontWeight: 500 }}>
                      ⚠️ 本功能僅支援最新版 Chrome、Edge、Firefox、Safari，請確認已允許麥克風權限，並使用 HTTPS 網址訪問。
                    </span>
                  )}
                </div>
                {!recording ? (
                  <button
                    onClick={startRecording}
                    style={{ background: '#bde0fe', padding: 8, border: 'none', borderRadius: 4 }}
                    disabled={!isRecordingSupported()}
                  >
                    🎤 開始錄音
                  </button>
                ) : (
                  <button onClick={stopRecording} style={{ background: '#ffb4a2', padding: 8, border: 'none', borderRadius: 4 }}>
                    ■ 停止並送出語音
                  </button>
                )}
              </>
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
                  <li key={i} style={{ marginBottom: 4, display: 'flex', alignItems: 'center' }}>
                    <img
                      src={m.avatar ? API_URL + m.avatar : API_URL + '/uploads/2.jpeg'}
                      alt={m.username}
                      style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid #bbb', background: '#fff', marginRight: 8 }}
                    />
                    <span>{m.username} {role}</span>
                    {m._id !== userId && (
                      <>
                        <button style={{ marginLeft: 8, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }} onClick={() => handleCallInvite(m._id)}>語音</button>
                        <button style={{ marginLeft: 4, background: '#43a047', color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }} onClick={() => handleVideoCallInvite(m._id)}>視訊</button>
                      </>
                    )}
                    {/* 管理員操作按鈕... */}
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
      {showMention && mentionList.length > 0 && (
        <div style={{ position: 'absolute', background: '#fff', border: '1px solid #ccc', borderRadius: 6, zIndex: 100, left: 0, top: -40, minWidth: 120, boxShadow: '0 2px 8px #0002' }}>
          {mentionList.map((u, i) => (
            <div
              key={u._id}
              style={{ padding: '4px 12px', background: i === mentionIndex ? '#bde0fe' : 'transparent', cursor: 'pointer' }}
              onMouseDown={e => { e.preventDefault(); insertMention(u); }}
            >
              @{u.username}
            </div>
          ))}
        </div>
      )}
      {/* 會員中心按鈕 */}
      {page === 'chat' && (
        <button
          style={profileBtnStyle}
          onClick={() => { setShowProfile(true); fetchProfile(); }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,200,200,0.72)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
                        {renderAvatar(profile.username, groupInfo, profile, true)}
          <span style={{ fontWeight: 'bold', fontSize: 18, color: '#222', marginRight: 8 }}>{profile.username}</span>
        </button>
      )}
      {/* 會員中心 Modal */}
      {showProfile && (
        <div style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: '#0008', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 360, position: 'relative' }}>
            <button onClick={() => setShowProfile(false)} style={{ position: 'absolute', top: 16, right: 16, fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            <h2>會員中心</h2>
            {avatarSuccess && (
              <div className={`avatar-success-fade${avatarSuccess ? ' show' : ''}`}
                style={{
                  position: 'absolute',
                  top: 24,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#e8f5e9',
                  color: '#388e3c',
                  borderRadius: 8,
                  padding: '8px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  fontWeight: 'bold',
                  fontSize: 16,
                  boxShadow: '0 2px 8px #0002',
                  zIndex: 10
                }}>
                頭像設定成功
                <span style={{ display: 'inline-block', marginLeft: 8, fontSize: 22, color: '#43a047' }}>✔</span>
              </div>
            )}
            {emailSuccess && (
              <div style={{
                position: 'absolute',
                top: 64,
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#e8f5e9',
                color: '#388e3c',
                borderRadius: 8,
                padding: '8px 24px',
                display: 'flex',
                alignItems: 'center',
                fontWeight: 'bold',
                fontSize: 16,
                boxShadow: '0 2px 8px #0002',
                zIndex: 10
              }}>
                Email 更新成功
                <span style={{ display: 'inline-block', marginLeft: 8, fontSize: 22, color: '#43a047' }}>✔</span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
              <img src={profile.avatar ? API_URL + profile.avatar : API_URL + '/uploads/2.jpeg'} alt="頭像" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', marginBottom: 8, border: '2px solid #2196f3' }} />
              <button style={{ marginBottom: 8, background: '#2196f3', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', cursor: 'pointer' }} onClick={() => document.getElementById('avatar-file-input').click()}>選擇頭像</button>
              {avatarFile && (
                <button style={{ marginBottom: 8, background: '#4caf50', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', cursor: 'pointer' }} onClick={handleAvatarUpload}>上傳頭像</button>
              )}
              {!avatarFile && (
                <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>請先選擇頭像文件</div>
              )}
              <input id="avatar-file-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                const file = e.target.files && e.target.files[0];
                if (file) {
                  setAvatarFile(file);
                  setAvatarPreview(URL.createObjectURL(file));
                  setShowCropModal(true);
                  // 允許重複選同一張圖也能觸發 onChange
                  e.target.value = '';
                }
              }} />
              <div style={{ marginBottom: 8 }}>帳號：{profile.username}</div>
              <div style={{ marginBottom: 8 }}>
                Email：
                {editingEmail ? (
                  <>
                    <input
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      style={{ marginLeft: 8, padding: 4, borderRadius: 4, border: '1px solid #ccc', width: 180 }}
                    />
                    <button className="button-primary" style={{ marginLeft: 8 }} onClick={handleEmailSave}>儲存</button>
                    <button style={{ marginLeft: 4 }} onClick={() => setEditingEmail(false)}>取消</button>
                  </>
                ) : (
                  <>
                    {profile.email || '（未設定）'}
                    <button style={{ marginLeft: 8 }} onClick={() => { setEditingEmail(true); setNewEmail(profile.email || ''); }}>修改</button>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
      {/* 頭像裁切模態框 */}
      {showCropModal && avatarPreview && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: '90vw', maxHeight: '90vh', position: 'relative' }}>
            <button onClick={() => setShowCropModal(false)} style={{ position: 'absolute', top: 12, right: 12, fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', zIndex: 1 }}>✕</button>
            <h3 style={{ marginBottom: 16 }}>裁切頭像</h3>
            <div style={{ marginBottom: 16 }}>
              <ReactCrop
                crop={crop}
                onChange={c => setCrop(c)}
                aspect={1}
                circularCrop
              >
                <img src={avatarPreview} alt="裁切預覽" style={{ maxWidth: '100%', maxHeight: '60vh' }} />
              </ReactCrop>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => setShowCropModal(false)} style={{ padding: '8px 16px', background: '#f5f5f5', border: 'none', borderRadius: 4, cursor: 'pointer' }}>取消</button>
              <button onClick={handleCropComplete} style={{ padding: '8px 16px', background: '#2196f3', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>確認裁切</button>
            </div>
          </div>
        </div>
      )}
      {/* 群組成員完整列表彈窗 */}
      {showGroupMemberList && currentGroupObj && Array.isArray(currentGroupObj.members) && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.25)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowGroupMemberList(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, minWidth: 320, maxHeight: '80vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowGroupMemberList(false)} style={{ position: 'absolute', top: 12, right: 12, fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            <h3>群組成員</h3>
            <ul style={{ padding: 0, listStyle: 'none' }}>
              {currentGroupObj.members.map((u, idx) => (
                <li key={u._id || idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <img
                    src={u.avatar ? API_URL + u.avatar : API_URL + '/uploads/2.jpeg'}
                    alt={u.username}
                    style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid #bbb', background: '#fff', marginRight: 8 }}
                  />
                  <span style={{ fontSize: 15, color: '#222', wordBreak: 'break-all' }}>{u.username}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {/* 群組通話彈窗 MVP */}
      {groupCallState.visible && (
        <div style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.25)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 360, minHeight: 240, position: 'relative' }}>
            <button onClick={() => setGroupCallState(s => ({ ...s, visible: false }))} style={{ position: 'absolute', top: 12, right: 12, fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            <h3>群組{groupCallState.type === 'video' ? '視訊' : '語音'}通話</h3>
            <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
              {/* 這裡未來會顯示所有成員的 audio/video，目前先用假資料 */}
              {groupCallState.members.length === 0 && <div style={{ color: '#888' }}>暫無成員加入</div>}
              {/* 之後這裡會 map groupCallState.members 顯示 audio/video 元素 */}
            </div>
            {!groupCallState.isCaller && (
              <button style={{ marginTop: 24, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px' }} onClick={() => alert('TODO: 加入群組通話')}>加入通話</button>
            )}
            <button style={{ marginTop: 24, background: '#e53935', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px', marginLeft: 12 }} onClick={() => setGroupCallState(s => ({ ...s, visible: false }))}>離開</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App; 