import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import MediaWall from './components/MediaWall';
import FileCabinet from './components/FileCabinet';
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import './MessageAnimations.css';
import { API_URL } from './config';
import { checkServerStatus, waitForServer } from './utils/serverCheck.js';

// 調試信息 - 強制清除緩存

console.log('App.js 載入 (v5.0)，API_URL:', API_URL);

// 強制清除任何可能的 localhost 緩存
if (typeof window !== 'undefined') {
  // 清除所有可能的 API URL 緩存
  const keysToRemove = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.toLowerCase().includes('api')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => window.localStorage.removeItem(key));

  // 清除 sessionStorage
  window.sessionStorage.clear();

  console.log('已清除所有 API 相關緩存');
}

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
  return str.replace(/[&<>'"`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\'': '&#39;', '"': '&quot;', '`': '&#96;' }[c]));
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

// 新增：取得用戶頭像（優化版）
function getUserAvatar(username, groupInfo, profile, senderInfo = null) {
  const defaultAvatar = 'https://res.cloudinary.com/dvnuhsvtd/image/upload/v1754576538/chat-app/default-avatar.jpg';

  // 輔助函數：處理頭像URL
  const processAvatarUrl = (avatar) => {
    if (!avatar || avatar === '' || avatar === '/uploads/2.jpeg') return null;
    if (avatar.startsWith('http')) return avatar;
    return API_URL + avatar;
  };

  // 1. 優先使用 senderInfo（訊息發送者信息）
  if (senderInfo && senderInfo.username === username && senderInfo.avatar) {
    const avatarUrl = processAvatarUrl(senderInfo.avatar);
    if (avatarUrl) {
      console.log('使用 senderInfo 頭像:', username, avatarUrl);
      return avatarUrl;
    }
  }

  // 2. 使用 profile 中的頭像（當前用戶）
  if (profile && username === profile.username) {
    const avatarUrl = processAvatarUrl(profile.avatar);
    if (avatarUrl) return avatarUrl;
  }

  // 3. 從群組信息中查找用戶頭像
  if (groupInfo && Array.isArray(groupInfo.members)) {
    const user = groupInfo.members.find(u => u && u.username === username);
    if (user) {
      const avatarUrl = processAvatarUrl(user.avatar);
      if (avatarUrl) return avatarUrl;
    }
  }

  // 4. 返回預設頭像
  console.log('使用默認頭像:', username);
  return defaultAvatar;
}

// 新增：渲染頭像組件
function renderAvatar(username, groupInfo, profile, isMe = false, senderInfo = null, theme = 'light') {
  const avatarUrl = getUserAvatar(username, groupInfo, profile, senderInfo);
  const avatarStyle = {
    width: 36,
    height: 36,
    borderRadius: 18,
    objectFit: 'cover',
    marginLeft: isMe ? 10 : 0,
    marginRight: isMe ? 0 : 10,
    border: isMe ? (theme === 'dark' ? '1.5px solid #1f6feb' : '1.5px solid #0969da') : (theme === 'dark' ? '1.5px solid #30363d' : '1.5px solid #d0d7de'),
    background: theme === 'dark' ? '#161b22' : '#ffffff'
  };

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt="頭像"
        style={avatarStyle}
        onError={(e) => {
          // 如果載入失敗，自動切換到預設頭像
          const defaultAvatar = 'https://res.cloudinary.com/dvnuhsvtd/image/upload/v1754576538/chat-app/default-avatar.jpg';
          if (e.target.src !== defaultAvatar) {
            // Only log once per avatar
            if (!e.target.dataset.errorLogged) {
              console.log('聊天頭像載入失敗，切換到預設頭像:', e.target.src);
              e.target.dataset.errorLogged = 'true';
            }
            e.target.src = defaultAvatar;
          }
        }}
      />
    );
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
@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.5;
  }
  100% {
    transform: scale(1.4);
    opacity: 0;
  }
}
@keyframes slideInRight {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
`}</style>

function App() {
  const [page, setPage] = useState('login'); // login | register | chat
  const [username, setUsername] = useState('');
  const [discriminator, setDiscriminator] = useState('');
  const [fullUsername, setFullUsername] = useState('');
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
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light'); // light | dark
  const fileInputRef = useRef();
  const [search, setSearch] = useState('');
  const [messageCache, setMessageCache] = useState({}); // { groupId: [messages] }
  const [registerPwd, setRegisterPwd] = useState('');
  const [pwdStrength, setPwdStrength] = useState('');
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('refreshToken') || '');
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupInfo, setGroupInfo] = useState(null);
  const [isLoadingGroupInfo, setIsLoadingGroupInfo] = useState(false);
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
  const remoteVideoRef = useRef();
  const localVideoRef = useRef();
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
  // 確保群組成員數據存在
  const groupMembers = currentGroupObj?.members || [];
  const hasGroupMembers = Array.isArray(groupMembers) && groupMembers.length > 0;

  // Debug logging only when currentGroup changes
  useEffect(() => {
    if (currentGroup && currentGroupObj) {
      console.log('切換到群組:', currentGroupObj.name, '成員數:', groupMembers.length);
      // 檢查群組成員數據完整性
      if (groupMembers.length === 0) {
        console.warn('群組成員數據為空，可能需要重新獲取群組信息');
      }
    }
  }, [currentGroup, currentGroupObj, groupMembers.length]);
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
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [editingDiscriminator, setEditingDiscriminator] = useState(false);
  const [newDiscriminator, setNewDiscriminator] = useState('');
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
  const [speakingUsers, setSpeakingUsers] = useState(new Set());
  const [ongoingGroupCalls, setOngoingGroupCalls] = useState(new Map()); // 記錄正在進行的群組通話
  const [callNotification, setCallNotification] = useState(null); // 通話通知 { groupId, type, from, fromUsername }
  const [peerConnections, setPeerConnections] = useState(new Map()); // WebRTC peer 連接管理 Map<userId, RTCPeerConnection>

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
      } catch { }
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
      s.on('message read', ({ messageIds, userId: readUserId, user }) => {
        setMessages((prev) => prev.map(m => {
          if (messageIds.includes(m._id)) {
            // 檢查是否已經在 readBy 中
            const isAlreadyRead = (m.readBy || []).some(u =>
              (typeof u === 'string' ? u : u._id) === readUserId
            );

            if (!isAlreadyRead) {
              // 添加完整的用戶信息到 readBy
              return {
                ...m,
                readBy: [...(m.readBy || []), user || { _id: readUserId, username: readUserId }]
              };
            }
          }
          return m;
        }));
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

    // 群組邀請事件
    socket.on('group:invited', ({ group }) => {
      console.log('收到群組邀請:', group);
      // 自動添加到群組列表
      setGroups(prev => {
        const exists = prev.find(g => g._id === group._id);
        if (!exists) {
          return [...prev, group];
        }
        return prev;
      });
      // 顯示通知
      alert(`您已被邀請加入群組：${group.name}`);
    });

    // 訊息已讀事件
    socket.on('message read', ({ messageIds, userId, user }) => {
      console.log('收到訊息已讀通知:', { messageIds, userId, user });
      // 更新訊息的 readBy 狀態
      setMessages(prev => prev.map(msg => {
        if (messageIds.includes(msg._id)) {
          // 檢查是否已經在 readBy 中
          const alreadyRead = msg.readBy?.some(u => 
            (typeof u === 'object' ? u._id : u) === userId
          );
          if (!alreadyRead) {
            return {
              ...msg,
              readBy: [...(msg.readBy || []), user]
            };
          }
        }
        return msg;
      }));
    });

    return () => {
      socket.off('call:invite');
      socket.off('call:accept');
      socket.off('call:reject');
      socket.off('call:end');
      socket.off('group:invited');
      socket.off('message read');
    };
  }, [socket]);

  // 群組通話信令事件
  useEffect(() => {
    if (!socket) return;

    socket.on('group-call:invite', ({ groupId, type, from, fromUsername }) => {
      if (groupId === currentGroup && from !== userId) {
        // 顯示通話通知，而不是直接打開視窗
        setCallNotification({ groupId, type, from, fromUsername });

        // 設置通話狀態但不顯示視窗
        setGroupCallState({
          type,
          members: [{ userId: from, username: fromUsername }],
          streams: {},
          visible: false, // 不自動打開視窗
          isCaller: false,
          groupId
        });
        console.log('收到群組通話邀請', { groupId, type, from, fromUsername });
      }
    });

    socket.on('group-call:member-joined', ({ groupId, userId: joinedUserId, username: joinedUsername }) => {
      if (groupId === currentGroup) {
        setGroupCallState(prev => {
          console.log('收到 member-joined 事件', {
            joinedUserId,
            joinedUsername,
            currentMembers: prev.members.map(m => ({ userId: m.userId, username: m.username }))
          });

          // 檢查成員是否已存在，避免重複添加
          const isAlreadyInCall = prev.members.some(m => m.userId === joinedUserId);
          if (isAlreadyInCall) {
            console.log('⚠️ 成員已在通話中，跳過添加', { joinedUserId, joinedUsername });
            return prev;
          }

          console.log('✅ 添加新成員到通話', { joinedUserId, joinedUsername });

          // 不為新成員創建連接（他們會作為發起者創建連接）
          // 我們只需等待他們的 offer

          return {
            ...prev,
            members: [...prev.members, { userId: joinedUserId, username: joinedUsername }]
          };
        });
      }
    });

    socket.on('group-call:member-left', ({ groupId, userId: leftUserId }) => {
      if (groupId === currentGroup) {
        setGroupCallState(prev => ({
          ...prev,
          members: prev.members.filter(m => m.userId !== leftUserId),
          streams: Object.fromEntries(
            Object.entries(prev.streams).filter(([uid]) => uid !== leftUserId)
          )
        }));
        console.log('成員離開群組通話', { groupId, leftUserId });
      }
    });

    // 接收現有成員列表（當加入通話時）
    socket.on('group-call:existing-members', async ({ groupId, members }) => {
      if (groupId === currentGroup) {
        console.log('收到現有成員列表:', members);
        setGroupCallState(prev => {
          // 合併現有成員，避免重複
          const existingIds = new Set(prev.members.map(m => m.userId));
          const newMembers = members.filter(m => !existingIds.has(m.userId));

          // 為每個現有成員創建 WebRTC 連接（作為發起者）
          if (prev.localStream) {
            members.forEach(member => {
              if (member.userId !== userId) {
                createPeerConnection(member.userId, true, prev.localStream);
              }
            });
          }

          return {
            ...prev,
            members: [...prev.members, ...newMembers]
          };
        });
      }
    });

    socket.on('group-call:signal', async ({ groupId, fromUserId, fromUsername, signal }) => {
      if (groupId === currentGroup && groupCallState.visible) {
        console.log('收到群組通話信令', { groupId, fromUserId, signal });
        await handleWebRTCSignal(fromUserId, signal);
      }
    });

    socket.on('group-call:ended', ({ groupId }) => {
      if (groupId === currentGroup) {
        setGroupCallState({ type: '', members: [], streams: {}, visible: false, isCaller: false });
        alert('群組通話已結束');
        console.log('群組通話結束', { groupId });
      }
    });

    // 通話狀態更新
    socket.on('group-call:status', ({ groupId, status, type, memberCount }) => {
      setOngoingGroupCalls(prev => {
        const newMap = new Map(prev);
        if (status === 'active') {
          newMap.set(groupId, { type, memberCount, startTime: Date.now() });
        } else {
          newMap.delete(groupId);
        }
        return newMap;
      });
    });

    return () => {
      socket.off('group-call:invite');
      socket.off('group-call:member-joined');
      socket.off('group-call:member-left');
      socket.off('group-call:existing-members');
      socket.off('group-call:signal');
      socket.off('group-call:ended');
      socket.off('group-call:status');
    };
  }, [socket, currentGroup, userId, groupCallState.visible]);

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

    // 設置本地視訊預覽
    if (isVideo && localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

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

    // 如果不是追加載入，且群組信息不存在，則自動獲取群組信息
    if (!append && !groupInfo) {
      try {
        const groupRes = await fetch(`${API_URL}/api/group/info/${groupId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const groupData = await groupRes.json();
        if (groupRes.ok) {
          setGroupInfo(groupData);
        }
      } catch (error) {
        console.warn('獲取群組信息失敗:', error);
      }
    }

    setLoadingMoreMessages(false);
  };

  // 初次載入/切換群組/搜尋時載入最新訊息
  useEffect(() => {
    if (currentGroup && token) {
      setMessages([]);
      setHasMoreMessages(true);
      fetchMessages(currentGroup).then(() => {
        // 使用 Promise 確保訊息載入完成後再滾動
        setTimeout(() => {
          if (messagesBoxRef.current) {
            messagesBoxRef.current.scrollTop = messagesBoxRef.current.scrollHeight;
            console.log('滾動到底部:', messagesBoxRef.current.scrollHeight);
          }
        }, 500);
      });
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
      const unreadIds = messages.filter(m => {
        const readBy = m.readBy || [];
        // 檢查 readBy 是否包含當前用戶（支持對象和ID兩種格式）
        const isRead = readBy.some(u => 
          (typeof u === 'object' ? u._id : u) === userId
        );
        return !isRead;
      }).map(m => m._id);
      
      if (unreadIds.length > 0) {
        console.log('發送已讀通知:', { groupId: currentGroup, messageIds: unreadIds });
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
    // 只在有新訊息時滾動
    if (messages.length > 0 && messagesBoxRef.current) {
      const isNearBottom = messagesBoxRef.current.scrollHeight - messagesBoxRef.current.scrollTop - messagesBoxRef.current.clientHeight < 150;
      // 如果用戶在底部附近，自動滾動到底部
      if (isNearBottom) {
        setTimeout(() => {
          if (messagesBoxRef.current) {
            messagesBoxRef.current.scrollTop = messagesBoxRef.current.scrollHeight;
          }
        }, 50);
      }
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

  const fetchGroups = async (tk) => {
    try {
      const res = await safeFetch(`${API_URL}/api/group/my`, {
        headers: { Authorization: `Bearer ${tk}` }
      });
      const data = await res.json();
      console.log('獲取到群組數據:', data);

      if (Array.isArray(data) && data.length > 0) {
        // 驗證群組數據完整性
        const validGroups = data.filter(group => {
          if (!group || !group._id || !group.name) {
            console.warn('發現無效群組數據:', group);
            return false;
          }
          if (!Array.isArray(group.members)) {
            console.warn('群組成員數據無效:', group.name, group.members);
            group.members = []; // 設置為空數組避免錯誤
          }
          return true;
        });

        console.log('有效群組數量:', validGroups.length);
        setGroups(validGroups);
        setCurrentGroup(prev => prev || (validGroups[0] && validGroups[0]._id)); // 自動選第一個群組
      } else {
        console.log('沒有群組數據或數據格式錯誤');
        setGroups([]);
        setCurrentGroup(null);
      }
    } catch (error) {
      console.error('獲取群組錯誤:', error);
      setGroups([]);
      setCurrentGroup(null);
    }
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

      console.log('嘗試認證:', type, 'API_URL:', API_URL);

      const res = await fetch(`${API_URL}/api/auth/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body,
        mode: 'cors',
        credentials: 'include'
      });

      console.log('認證響應狀態:', res.status);

      if (!res.ok) {
        let errorMessage = '發生錯誤';
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `HTTP ${res.status}: ${res.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();
      console.log('認證成功:', data.username);
      if (type === 'login' || type === 'register') {
        setToken(data.token);
        setRefreshToken(data.refreshToken);
        setUsername(data.username);
        setDiscriminator(data.discriminator || '0000');
        setFullUsername(data.fullUsername || `${data.username}#0000`);
        if (rememberMe) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('refreshToken', data.refreshToken);
          localStorage.setItem('username', data.username);
          localStorage.setItem('discriminator', data.discriminator || '0000');
          localStorage.setItem('fullUsername', data.fullUsername || `${data.username}#0000`);
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
      } catch { }
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

  // 切換深色模式
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // 完整的主題系統
  const isDarkMode = theme === 'dark';
  const themeStyles = theme === 'dark' ? {
    // 深色模式 - 完全適應深色主題
    background: '#0d1117',
    color: '#e6edf3',
    bubbleMe: '#1f6feb',
    bubbleOther: '#21262d',
    input: '#0d1117',
    border: '#30363d',
    sidebarBg: '#010409',
    sidebarHover: '#161b22',
    buttonPrimary: '#238636',
    buttonSecondary: '#30363d',
    buttonDanger: '#da3633',
    buttonSuccess: '#238636',
    buttonInfo: '#1f6feb',
    buttonWarning: '#bb8009',
    buttonText: '#ffffff',
    cardBg: '#161b22',
    headerBg: '#010409',
    textSecondary: '#8b949e',
    divider: '#21262d',
    scrollbar: '#30363d',
    scrollbarThumb: '#484f58',
    messageBg: '#0d1117',
    inputBorder: '#30363d',
    groupItemBg: '#161b22',
    groupItemHover: '#21262d',
    groupItemActive: '#1f6feb',
    tabActive: '#388bfd',
    tabInactive: '#21262d',
  } : {
    // 淺色模式
    background: '#ffffff',
    color: '#24292f',
    bubbleMe: '#0969da',
    bubbleOther: '#f6f8fa',
    input: '#ffffff',
    border: '#d0d7de',
    sidebarBg: '#f6f8fa',
    sidebarHover: '#eaeef2',
    buttonPrimary: '#1f883d',
    buttonSecondary: '#f6f8fa',
    buttonDanger: '#cf222e',
    buttonSuccess: '#1f883d',
    buttonInfo: '#0969da',
    buttonWarning: '#bf8700',
    buttonText: '#ffffff',
    cardBg: '#ffffff',
    headerBg: '#f6f8fa',
    textSecondary: '#57606a',
    divider: '#d0d7de',
    scrollbar: '#d0d7de',
    scrollbarThumb: '#959da5',
    messageBg: '#ffffff',
    inputBorder: '#d0d7de',
    groupItemBg: '#ffffff',
    groupItemHover: '#f6f8fa',
    groupItemActive: '#ddf4ff',
    tabActive: '#0969da',
    tabInactive: '#f6f8fa',
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
    setIsLoadingGroupInfo(true);
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
    } catch (error) {
      console.error('取得群組資訊失敗:', error);
      alert('取得群組資訊失敗');
    } finally {
      setIsLoadingGroupInfo(false);
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
    } catch { }
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
      } catch { }
    }
  }, []);

  // 頁面初始化時檢查服務器狀態和 token
  useEffect(() => {
    const initializeApp = async () => {
      // 首先檢查服務器狀態
      console.log('初始化應用，檢查服務器狀態...');
      const serverStatus = await checkServerStatus();

      if (serverStatus.status !== 'ok') {
        console.warn('服務器未就緒，嘗試等待...');
        setError('正在連接服務器，請稍候...');

        const isReady = await waitForServer(3, 5000);
        if (!isReady) {
          setError('無法連接到服務器，請檢查網絡連接或稍後再試');
          return;
        }
        setError(''); // 清除錯誤信息
      }

      // 檢查 token
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
      } else {
        setToken(tk);
      }
    };

    initializeApp();
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
    }).catch(() => { });
  }, [token]);

  // 當 groups 變化且 socket 存在時，自動加入所有群組房間
  useEffect(() => {
    if (socket && groups.length > 0) {
      const groupIds = groups.map(g => g._id);
      socket.emit('join group', { groupIds });
      console.log('已發送 join group', groupIds.length, '個群組');
    }
  }, [socket, groups]);

  // 取得個人資料
  const fetchProfile = async () => {
    try {
      const res = await safeFetch(`${API_URL}/api/user/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      console.log('用戶資料已更新:', data.username);
      setProfile(data);
      // 將用戶資料保存到 localStorage 以備緩存
      localStorage.setItem('userProfile', JSON.stringify(data));
    } catch (error) {
      console.error('獲取用戶資料失敗:', error);
    }
  };
  useEffect(() => {
    if (page === 'chat' && token) {
      // 先嘗試從 localStorage 讀取緩存的用戶資料
      const cachedProfile = localStorage.getItem('userProfile');
      if (cachedProfile) {
        try {
          const profileData = JSON.parse(cachedProfile);
          console.log('載入緩存用戶資料:', profileData.username);
          setProfile(profileData);
        } catch (e) {
          console.error('解析緩存用戶資料失敗:', e);
        }
      }
      // 然後從服務器獲取最新資料
      fetchProfile();
    }
  }, [page, token]);
  // 上傳頭像
  const handleAvatarUpload = async () => {
    if (!avatarFile) return;
    const formData = new FormData();
    formData.append('avatar', avatarFile);
    try {
      const res = await safeFetch(`${API_URL}/api/user/avatar`, {
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
    // 設置 body 背景色
    document.body.style.background = themeStyles.background;
    document.body.style.color = themeStyles.color;
    document.body.style.minHeight = '100vh';
    
    const style = document.createElement('style');
    style.innerHTML = `
      html, body {
        background: ${themeStyles.background} !important;
        color: ${themeStyles.color} !important;
        margin: 0;
        padding: 0;
      }
      button, .global-btn {
        padding: 8px 20px !important;
        border-radius: 32px !important;
        border: none !important;
        background: ${themeStyles.buttonSecondary} !important;
        color: ${themeStyles.color} !important;
        cursor: pointer !important;
        font-size: 16px !important;
        font-weight: 500 !important;
        transition: background 0.25s, color 0.2s !important;
        box-shadow: ${isDarkMode ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)'} !important;
      }
      button:hover, .global-btn:hover {
        background: ${isDarkMode ? '#616161' : '#e0e0e0'} !important;
      }
      button:active, .global-btn:active {
        opacity: 0.8;
      }
      .button-primary {
        background: ${themeStyles.buttonPrimary} !important;
        color: #fff !important;
      }
      .button-primary:hover {
        background: ${isDarkMode ? '#1a6e29' : '#1a7f37'} !important;
      }
      .button-secondary {
        background: ${themeStyles.buttonSecondary} !important;
        color: ${themeStyles.color} !important;
      }
      .button-secondary:hover {
        background: ${isDarkMode ? '#616161' : '#e0e0e0'} !important;
      }
      .button-danger {
        background: ${themeStyles.buttonDanger} !important;
        color: #fff !important;
      }
      .button-danger:hover {
        background: ${isDarkMode ? '#b71c1c' : '#c62828'} !important;
      }
      input, textarea, select {
        background: ${themeStyles.input} !important;
        color: ${themeStyles.color} !important;
        border: 1px solid ${themeStyles.border} !important;
      }
    `;
    document.head.appendChild(style);
    return () => { 
      document.head.removeChild(style);
      document.body.style.background = '';
      document.body.style.color = '';
    };
  }, [theme, themeStyles, isDarkMode]);

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
  const handleGroupAudioCall = async () => {
    if (!socket || !currentGroup) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      // 設置音頻檢測
      setupAudioDetection(stream, userId);

      setGroupCallState({
        type: 'audio',
        members: [{ userId, username }],
        streams: { [userId]: stream },
        visible: true,
        isCaller: true,
        groupId: currentGroup,
        localStream: stream
      });
      socket.emit('group-call:invite', { groupId: currentGroup, type: 'audio' });
      console.log('發起群組語音通話', { groupId: currentGroup });
    } catch (error) {
      console.error('無法獲取音頻設備:', error);
      alert('無法訪問麥克風，請檢查權限設置');
    }
  };

  const handleGroupVideoCall = async () => {
    if (!socket || !currentGroup) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

      // 設置音頻檢測
      setupAudioDetection(stream, userId);

      setGroupCallState({
        type: 'video',
        members: [{ userId, username }],
        streams: { [userId]: stream },
        visible: true,
        isCaller: true,
        groupId: currentGroup,
        localStream: stream
      });
      socket.emit('group-call:invite', { groupId: currentGroup, type: 'video' });
      console.log('發起群組視訊通話', { groupId: currentGroup });
    } catch (error) {
      console.error('無法獲取音視頻設備:', error);
      alert('無法訪問攝像頭或麥克風，請檢查權限設置');
    }
  };

  const handleJoinGroupCall = async () => {
    if (!socket || !currentGroup) return;
    try {
      const isVideo = groupCallState.type === 'video';
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo
      });

      // 設置音頻檢測
      setupAudioDetection(stream, userId);

      setGroupCallState(prev => {
        // 檢查用戶是否已在成員列表中
        const isAlreadyInCall = prev.members.some(m => m.userId === userId);
        return {
          ...prev,
          members: isAlreadyInCall ? prev.members : [...prev.members, { userId, username }],
          streams: { ...prev.streams, [userId]: stream },
          localStream: stream,
          visible: true, // 顯示通話視窗
          groupId: currentGroup
        };
      });

      socket.emit('group-call:join', { groupId: currentGroup, userId, type: groupCallState.type });
      console.log('加入群組通話', { groupId: currentGroup, type: groupCallState.type });
    } catch (error) {
      console.error('無法獲取媒體設備:', error);
      alert('無法訪問麥克風或攝像頭，請檢查權限設置');
    }
  };

  // WebRTC: 創建與特定用戶的 peer 連接
  const createPeerConnection = async (remoteUserId, isInitiator, localStream) => {
    console.log(`創建 WebRTC 連接: ${remoteUserId}, isInitiator: ${isInitiator}`);

    const pc = new RTCPeerConnection(rtcConfig);

    // 添加本地流到連接
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
        console.log(`添加本地軌道: ${track.kind}`);
      });
    }

    // 監聽遠程流
    pc.ontrack = (event) => {
      console.log(`收到遠程流: ${remoteUserId}`, event.streams[0]);
      setGroupCallState(prev => ({
        ...prev,
        streams: {
          ...prev.streams,
          [remoteUserId]: event.streams[0]
        }
      }));
    };

    // 監聽 ICE candidate
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`發送 ICE candidate 給: ${remoteUserId}`);
        socket.emit('group-call:signal', {
          groupId: currentGroup,
          targetUserId: remoteUserId,
          signal: {
            type: 'ice-candidate',
            candidate: event.candidate
          }
        });
      }
    };

    // 監聽連接狀態
    pc.onconnectionstatechange = () => {
      console.log(`連接狀態 ${remoteUserId}:`, pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        console.log(`連接失敗，嘗試重新連接: ${remoteUserId}`);
      }
    };

    // 保存連接
    setPeerConnections(prev => {
      const newMap = new Map(prev);
      newMap.set(remoteUserId, pc);
      return newMap;
    });

    // 如果是發起者，創建 offer
    if (isInitiator) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: groupCallState.type === 'video'
        });
        await pc.setLocalDescription(offer);

        console.log(`發送 offer 給: ${remoteUserId}`);
        socket.emit('group-call:signal', {
          groupId: currentGroup,
          targetUserId: remoteUserId,
          signal: {
            type: 'offer',
            sdp: offer
          }
        });
      } catch (error) {
        console.error(`創建 offer 失敗: ${remoteUserId}`, error);
      }
    }

    return pc;
  };

  // WebRTC: 處理收到的信令
  const handleWebRTCSignal = async (fromUserId, signal) => {
    console.log(`收到信令從 ${fromUserId}:`, signal.type);

    let pc = peerConnections.get(fromUserId);

    // 如果還沒有連接，創建一個
    if (!pc && signal.type === 'offer') {
      pc = await createPeerConnection(fromUserId, false, groupCallState.localStream);
    }

    if (!pc) {
      console.error(`找不到 peer 連接: ${fromUserId}`);
      return;
    }

    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        console.log(`發送 answer 給: ${fromUserId}`);
        socket.emit('group-call:signal', {
          groupId: currentGroup,
          targetUserId: fromUserId,
          signal: {
            type: 'answer',
            sdp: answer
          }
        });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        console.log(`設置遠程描述成功: ${fromUserId}`);
      } else if (signal.type === 'ice-candidate') {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        console.log(`添加 ICE candidate 成功: ${fromUserId}`);
      }
    } catch (error) {
      console.error(`處理信令失敗 ${fromUserId}:`, error);
    }
  };

  // 音頻檢測函數
  const setupAudioDetection = (stream, targetUserId) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      microphone.connect(analyser);
      analyser.fftSize = 256;

      const detectSound = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

        if (average > 20) { // 音量閾值
          setSpeakingUsers(prev => new Set(prev).add(targetUserId));
        } else {
          setSpeakingUsers(prev => {
            const newSet = new Set(prev);
            newSet.delete(targetUserId);
            return newSet;
          });
        }

        requestAnimationFrame(detectSound);
      };

      detectSound();
    } catch (error) {
      console.error('音頻檢測設置失敗:', error);
    }
  };

  const handleLeaveGroupCall = () => {
    if (!socket || !currentGroup) return;

    // 停止本地流
    if (groupCallState.localStream) {
      groupCallState.localStream.getTracks().forEach(track => track.stop());
    }

    // 停止所有遠程流
    Object.values(groupCallState.streams).forEach(stream => {
      if (stream && stream.getTracks) {
        stream.getTracks().forEach(track => track.stop());
      }
    });

    // 關閉所有 WebRTC 連接
    peerConnections.forEach((pc, peerId) => {
      console.log(`關閉 WebRTC 連接: ${peerId}`);
      pc.close();
    });
    setPeerConnections(new Map());

    // 檢查是否是最後一人，如果是則結束通話
    const isLastPerson = groupCallState.members.length <= 1;

    if (isLastPerson) {
      socket.emit('group-call:end', { groupId: currentGroup });
      console.log('最後一人離開，結束通話', { groupId: currentGroup });
    } else {
      socket.emit('group-call:leave', { groupId: currentGroup, userId });
      console.log('離開群組通話', { groupId: currentGroup, remainingMembers: groupCallState.members.length - 1 });
    }

    setGroupCallState({ type: '', members: [], streams: {}, visible: false, isCaller: false });
  };

  const handleEndGroupCall = () => {
    if (!socket || !currentGroup) return;

    if (groupCallState.localStream) {
      groupCallState.localStream.getTracks().forEach(track => track.stop());
    }

    socket.emit('group-call:end', { groupId: currentGroup });
    setGroupCallState({ type: '', members: [], streams: {}, visible: false, isCaller: false });
    console.log('結束群組通話', { groupId: currentGroup });
  };

  const toggleGroupCallMute = () => {
    if (groupCallState.localStream) {
      const audioTrack = groupCallState.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setGroupCallState(prev => ({ ...prev, isMuted: !audioTrack.enabled }));
      }
    }
  };

  const toggleGroupCallVideo = () => {
    if (groupCallState.localStream && groupCallState.type === 'video') {
      const videoTrack = groupCallState.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setGroupCallState(prev => ({ ...prev, isVideoOff: !videoTrack.enabled }));
      }
    }
  };

  // 已移除重複的 group-call:invite 監聽器（已在上方統一處理）

  // 錄音支援性偵測
  function isRecordingSupported() {
    return (
      typeof window !== 'undefined' &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
      typeof window.MediaRecorder !== 'undefined'
    );
  }

  useEffect(() => {
    if (groups.length > 0 && !currentGroup) {
      setCurrentGroup(groups[0]._id);
    }
  }, [groups, currentGroup]);

  if (page === 'login' || page === 'register') {
    return (
      <div style={{ maxWidth: 400, margin: '40px auto', fontFamily: 'sans-serif', background: themeStyles.background, color: themeStyles.color, minHeight: '100vh', padding: '20px' }}>
        {/* 深色模式切換按鈕 */}
        <button
          onClick={toggleTheme}
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            padding: '10px 20px',
            borderRadius: 25,
            border: 'none',
            background: themeStyles.buttonSecondary,
            color: themeStyles.color,
            cursor: 'pointer',
            fontSize: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.3s'
          }}
          title={theme === 'light' ? '切換到深色模式' : '切換到淺色模式'}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
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
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px', fontFamily: 'sans-serif', display: 'flex', minHeight: '100vh', background: themeStyles.background, color: themeStyles.color }}>
      {/* 左側群組清單 */}
      <div style={{ width: 240, marginRight: 20 }}>
        <h3>我的群組</h3>
        <ul style={{ padding: 0, listStyle: 'none' }}>
          {(Array.isArray(groups) ? groups : []).map((g, idx) => (
            <li key={g._id || idx} style={{ marginBottom: 4 }}>
              <button
                style={{
                  width: '100%',
                  background: currentGroup === g._id ? themeStyles.groupItemActive : themeStyles.groupItemBg,
                  color: themeStyles.color,
                  border: `1px solid ${themeStyles.border}`,
                  borderRadius: 6,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer'
                }}
                onClick={() => setCurrentGroup(g._id)}
              >
                <span>{g.name}</span>
                {ongoingGroupCalls.has(g._id) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#4caf50',
                      animation: 'pulse 2s infinite'
                    }} />
                    <span style={{ fontSize: 11, color: '#4caf50', fontWeight: 600 }}>
                      {ongoingGroupCalls.get(g._id)?.type === 'video' ? '視訊中' : '語音中'}
                    </span>
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 16 }}>
          <input
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            placeholder="新群組名稱"
            style={{ width: '100%', marginBottom: 4, padding: 8, borderRadius: 6, background: themeStyles.input, color: themeStyles.color, border: `1px solid ${themeStyles.border}` }}
          />
          <button onClick={createGroup} className="button-primary" style={{ width: '100%' }}>建立群組</button>
        </div>
        <div style={{ marginTop: 8 }}>
          <input
            value={joinGroupId}
            onChange={e => setJoinGroupId(e.target.value)}
            placeholder="加入群組ID"
            style={{ width: '100%', marginBottom: 4, padding: 8, borderRadius: 6, background: themeStyles.input, color: themeStyles.color, border: `1px solid ${themeStyles.border}` }}
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
            <button onClick={() => setActiveTab('chat')} className="button-secondary" style={{ background: activeTab === 'chat' ? themeStyles.tabActive : themeStyles.tabInactive, color: themeStyles.color, border: `1px solid ${themeStyles.border}` }}>💬 聊天</button>
            <button onClick={() => setActiveTab('media')} className="button-secondary" style={{ background: activeTab === 'media' ? themeStyles.tabActive : themeStyles.tabInactive, color: themeStyles.color, border: `1px solid ${themeStyles.border}` }}>🖼️ 圖片/影片</button>
            <button onClick={() => setActiveTab('files')} className="button-secondary" style={{ background: activeTab === 'files' ? themeStyles.tabActive : themeStyles.tabInactive, color: themeStyles.color, border: `1px solid ${themeStyles.border}` }}>📁 文件</button>
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
                style={{ flex: 1, padding: 6, borderRadius: 6, border: `1px solid ${themeStyles.border}`, marginRight: 8, background: themeStyles.input, color: themeStyles.color }}
              />
              <button onClick={() => setSearchInput('')}>清除</button>
            </div>
            {/* 群組成員按鈕區塊，永遠顯示在搜尋框下方、訊息區上方 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {currentGroupObj && hasGroupMembers && (
                <button
                  onClick={() => setShowGroupMemberList(true)}
                  style={{
                    marginTop: 12,
                    width: '100%',
                    padding: '12px',
                    background: theme === 'dark' ? '#2a2a2a' : '#f5f5f5',
                    border: `1px solid ${theme === 'dark' ? '#444' : '#ddd'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme === 'dark' ? '#333' : '#e8e8e8';
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = theme === 'dark' ? '#2a2a2a' : '#f5f5f5';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme === 'dark' ? '#aaa' : '#666'} strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <span style={{ fontSize: 14, color: theme === 'dark' ? '#ddd' : '#333', fontWeight: 500 }}>
                      群組成員 ({groupMembers.length})
                    </span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme === 'dark' ? '#aaa' : '#666'} strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              )}
              {currentGroupObj && hasGroupMembers && (
                <div style={{ display: 'none' }}>
                  <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>群組成員 ({groupMembers.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {groupMembers.slice(0, 3).map((u, idx) => (
                      <div key={u._id || idx} style={{ display: 'flex', alignItems: 'center', fontSize: 12 }}>
                        <img
                          src={u.avatar ?
                            (u.avatar.startsWith('http') ? u.avatar : API_URL + u.avatar) :
                            'https://res.cloudinary.com/dvnuhsvtd/image/upload/v1754576538/chat-app/default-avatar.jpg'}
                          alt={u.username}
                          style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', marginRight: 4 }}
                        />
                        <span>{u.username}</span>
                      </div>
                    ))}
                    {groupMembers.length > 3 && (
                      <div style={{ fontSize: 12, color: '#666' }}>+{groupMembers.length - 3} 更多</div>
                    )}
                  </div>
                </div>
              )}
              {/* 群組功能按鈕 */}
              <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
                {currentGroup && (
                  <button
                    onClick={() => fetchGroupInfo(currentGroup)}
                    style={{
                      background: themeStyles.buttonSecondary,
                      color: themeStyles.color,
                      border: `1px solid ${themeStyles.border}`,
                      borderRadius: 6,
                      padding: '6px 16px',
                      cursor: 'pointer',
                      fontSize: 14,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    群組資訊
                  </button>
                )}
                {currentGroup && hasGroupMembers && groupMembers.length > 1 && (
                  <>
                    {/* 如果有進行中的通話，顯示加入按鈕 */}
                    {ongoingGroupCalls.has(currentGroup) && !groupCallState.visible ? (
                      <button
                        style={{
                          background: '#4caf50',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          padding: '8px 16px',
                          cursor: 'pointer',
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontWeight: 600,
                          animation: 'pulse 2s infinite'
                        }}
                        onClick={handleJoinGroupCall}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.72 19.72 0 0 1 3 5.18 2 2 0 0 1 5 3h2.09a2 2 0 0 1 2 1.72c.13 1.05.37 2.07.72 3.06a2 2 0 0 1-.45 2.11l-.27.27a16 16 0 0 0 6.29 6.29l.27-.27a2 2 0 0 1 2.11-.45c.99.35 2.01.59 3.06.72A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                        加入進行中的{ongoingGroupCalls.get(currentGroup)?.type === 'video' ? '視訊' : '語音'}通話
                      </button>
                    ) : (
                      <>
                        <button style={{ background: themeStyles.buttonInfo, color: themeStyles.buttonText, border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }} onClick={handleGroupAudioCall}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.72 19.72 0 0 1 3 5.18 2 2 0 0 1 5 3h2.09a2 2 0 0 1 2 1.72c.13 1.05.37 2.07.72 3.06a2 2 0 0 1-.45 2.11l-.27.27a16 16 0 0 0 6.29 6.29l.27-.27a2 2 0 0 1 2.11-.45c.99.35 2.01.59 3.06.72A2 2 0 0 1 22 16.92z"></path></svg>
                          群組語音
                        </button>
                        <button style={{ background: themeStyles.buttonSuccess, color: themeStyles.buttonText, border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }} onClick={handleGroupVideoCall}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="15" height="10" rx="2" ry="2"></rect><polygon points="23 7 16 12 23 17 23 7"></polygon></svg>
                          群組視訊
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            {/* 語音通話彈窗 */}
            {callState.visible && (
              <div style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: themeStyles.cardBg, color: themeStyles.color, borderRadius: 10, boxShadow: isDarkMode ? '0 2px 16px rgba(0,0,0,0.5)' : '0 2px 16px rgba(0,0,0,0.2)', minWidth: 320, maxWidth: 400, padding: 32, position: 'relative', textAlign: 'center', border: `1px solid ${themeStyles.border}` }}>
                  {callState.status === 'calling' && <div style={{ fontSize: 18, marginBottom: 16 }}>正在呼叫對方...</div>}
                  {callState.status === 'incoming' && <div style={{ fontSize: 18, marginBottom: 16 }}>來電：{callState.fromUsername || callState.from}</div>}
                  {callState.status === 'accepted' && <div style={{ fontSize: 18, marginBottom: 16 }}>通話中...</div>}
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
                  {callState.status === 'calling' && <button onClick={handleCallEnd} style={{ marginTop: 24, background: themeStyles.buttonDanger, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px' }}>掛斷</button>}
                  {callState.status === 'incoming' && (
                    <div style={{ marginTop: 24 }}>
                      <button onClick={handleCallAccept} style={{ background: themeStyles.buttonInfo, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px', marginRight: 12 }}>接聽</button>
                      <button onClick={handleCallReject} style={{ background: themeStyles.buttonDanger, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px' }}>拒絕</button>
                    </div>
                  )}
                  {callState.status === 'accepted' && <button onClick={handleCallEnd} style={{ marginTop: 24, background: themeStyles.buttonDanger, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px' }}>掛斷</button>}
                </div>
              </div>
            )}
            <div ref={messagesBoxRef} onScroll={handleScroll} style={{
              border: `1px solid ${themeStyles.border}`,
              minHeight: 300,
              padding: '16px',
              marginBottom: 10,
              height: 'calc(100vh - 280px)',
              overflowY: 'auto',
              background: theme === 'dark' ? 'linear-gradient(to bottom, #0d1117, #161b22)' : 'linear-gradient(to bottom, #ffffff, #f6f8fa)',
              position: 'relative',
              width: '70vw',
              maxWidth: 1200,
              minWidth: 400,
              borderRadius: 8,
              boxShadow: theme === 'dark' ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)'
            }}>
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
                    // console.log('渲染語音訊息', msg._id, 'playingVoiceId:', playingVoiceId); // 調試用，已註釋
                  }
                  // 在渲染已讀頭像前檢查 readBy 數據
                  const readByUsers = (msg.readBy || []).filter(user => typeof user === 'object' && user.username && user.username !== username);
                  // 只有最後一則訊息顯示已讀狀態
                  const isLastMessage = idx === filteredMessages.length - 1;
                  
                  // 調試：檢查已讀狀態
                  const isMe = msg.sender === username;
                  if (isLastMessage && isMe) {
                    console.log('最後一則訊息已讀狀態:', {
                      msgId: msg._id,
                      sender: msg.sender,
                      isMe,
                      readBy: msg.readBy,
                      readByUsers: readByUsers.length,
                      readByData: readByUsers
                    });
                  }
                  if (!messageRefs.current[msg._id]) {
                    messageRefs.current[msg._id] = React.createRef();
                  }
                  
                  return (
                    <CSSTransition
                      key={msg._id}
                      timeout={300}
                      classNames="msg-anim"
                      nodeRef={messageRefs.current[msg._id]}
                    >
                      <div ref={messageRefs.current[msg._id]} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', marginBottom: 10 }}>
                        {/* 頭像 - 傳遞 senderInfo */}
                        {renderAvatar(msg.sender, groupInfo, profile, isMe, msg.senderInfo, theme)}
                        {/* 泡泡+已讀同一 flex row，順序根據 isMe 調整 */}
                        <div style={{ display: 'flex', flexDirection: isMe ? 'row' : 'row-reverse', alignItems: 'flex-end', gap: 6 }}>
                          {/* 泡泡本體在這裡渲染 */}

                          {/* 已讀標籤（泡泡右側）- 只在最後一則訊息且是自己的訊息時顯示 */}
                          {isLastMessage && isMe && readByUsers.length > 0 && (
                            <div
                              ref={el => { if (el) readByRefs.current[msg._id] = el; }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3,
                                alignSelf: 'flex-end',
                                minWidth: 24,
                                cursor: 'pointer',
                                marginBottom: 6,
                                flexShrink: 0
                              }}
                              onClick={e => {
                                e.stopPropagation();
                                setOpenReadByMsgId(msg._id === openReadByMsgId ? null : msg._id);
                                if (msg._id !== openReadByMsgId && readByRefs.current[msg._id]) {
                                  const rect = readByRefs.current[msg._id].getBoundingClientRect();
                                  setReadByPopupPos({ x: rect.left - 170, y: rect.top });
                                }
                              }}
                            >
                              {readByUsers.slice(0, 3).map(user => {
                                // 使用 readBy 用戶的頭像信息
                                const readByUserInfo = { username: user.username, avatar: user.avatar, discriminator: user.discriminator };
                                const avatarUrl = getUserAvatar(user.username, groupInfo, profile, readByUserInfo);
                                return (
                                  <img
                                    key={user._id}
                                    src={avatarUrl}
                                    alt={user.username}
                                    title={user.username}
                                    style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #fff', boxShadow: '0 1px 3px #0002' }}
                                    onError={(e) => {
                                      console.error('已讀頭像加載失敗:', user.username, avatarUrl);
                                      e.target.src = 'https://res.cloudinary.com/dvnuhsvtd/image/upload/v1754576538/chat-app/default-avatar.jpg';
                                    }}
                                  />
                                );
                              })}
                              {readByUsers.length > 3 && (
                                <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#e0e3eb', color: '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, border: '1.5px solid #fff', boxShadow: '0 1px 3px #0002' }}>+{readByUsers.length - 3}</div>
                              )}
                              {/* 已讀名單彈窗 */}
                              {openReadByMsgId === msg._id && (
                                <div style={{ position: 'fixed', left: readByPopupPos?.x || 120, top: readByPopupPos?.y || 120, background: themeStyles.cardBg, border: `1px solid ${themeStyles.border}`, borderRadius: 8, boxShadow: '0 2px 12px #0003', zIndex: 10001, minWidth: 160, padding: 12 }}>
                                  <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15, color: themeStyles.buttonInfo, textAlign: 'center' }}>已讀名單</div>
                                  {readByUsers.length === 0 ? (
                                    <div style={{ color: themeStyles.textSecondary, fontSize: 14, textAlign: 'center' }}>無其他人已讀</div>
                                  ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
                                      {readByUsers.map(user => (
                                        <div key={user._id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 56 }}>
                                          <img
                                            src={getUserAvatar(user.username, groupInfo, profile)}
                                            alt={user.username}
                                            style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${themeStyles.border}`, marginBottom: 4 }}
                                            onError={(e) => {
                                              e.target.src = 'https://res.cloudinary.com/dvnuhsvtd/image/upload/v1754576538/chat-app/default-avatar.jpg';
                                            }}
                                          />
                                          <span style={{ fontSize: 13, color: themeStyles.color, textAlign: 'center', wordBreak: 'break-all' }}>{user.username}</span>
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
                              maxWidth: 360,
                              background: isMe
                                ? themeStyles.bubbleMe
                                : themeStyles.bubbleOther,
                              color: isMe ? '#ffffff' : themeStyles.color,
                              borderRadius: 18,
                              padding: '12px 18px 26px 18px',
                              minWidth: 80,
                              position: 'relative',
                              boxShadow: hoveredMsgId === msg._id
                                ? (theme === 'dark' ? '0 6px 20px rgba(31, 111, 235, 0.4)' : '0 6px 20px rgba(9, 105, 218, 0.3)')
                                : (theme === 'dark' ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.1)'),
                              marginLeft: isMe ? 0 : 8,
                              marginRight: isMe ? 8 : 0,
                              transform: hoveredMsgId === msg._id ? 'scale(1.02)' : 'scale(1)',
                              transition: 'all 0.2s ease',
                              cursor: 'pointer',
                              border: isMe ? 'none' : `1px solid ${themeStyles.border}`,
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
                                  <div>
                                    <img
                                      src={msg.url.startsWith('blob:') || msg.url.startsWith('http') ? msg.url : API_URL + msg.url}
                                      alt="圖片"
                                      style={{ maxWidth: 220, maxHeight: 180, borderRadius: 8, marginBottom: 4, cursor: 'pointer', display: 'block', objectFit: 'cover' }}
                                      onClick={() => setMediaPreview({ type: 'image', url: msg.url.startsWith('blob:') || msg.url.startsWith('http') ? msg.url : API_URL + msg.url })}
                                      onError={(e) => {
                                        // Only log once per image
                                        if (!e.target.dataset.errorLogged) {
                                          const constructedUrl = msg.url.startsWith('blob:') || msg.url.startsWith('http') ? msg.url : API_URL + msg.url;
                                          console.log('圖片載入失敗:', constructedUrl, '原始URL:', msg.url);
                                          e.target.dataset.errorLogged = 'true';
                                        }
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'block';
                                      }}
                                    />
                                    <div style={{ display: 'none', padding: '8px 12px', background: themeStyles.cardBg, borderRadius: 8, fontSize: 12, color: themeStyles.textSecondary, border: `1px solid ${themeStyles.border}` }}>
                                      <span>圖片載入失敗</span>
                                      <div style={{ fontSize: 10, color: themeStyles.textSecondary, marginTop: 4 }}>URL: {msg.url}</div>
                                      <button onClick={() => {
                                        const finalUrl = msg.url.startsWith('http') ? msg.url : API_URL + msg.url;
                                        console.log('嘗試在新視窗開啟圖片:', finalUrl);
                                        const newWindow = window.open(finalUrl, '_blank');
                                        if (!newWindow) {
                                          alert('無法開啟新視窗，請檢查彈出視窗設定');
                                        }
                                      }} style={{ marginLeft: 8, padding: '2px 6px', fontSize: 10, background: '#2196f3', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>在新視窗開啟</button>
                                    </div>
                                  </div>
                                ) : msg.type === 'video' && msg.url ? (
                                  <div style={{ position: 'relative', width: 220, height: 180, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
                                    <video
                                      src={msg.url.startsWith('blob:') || msg.url.startsWith('http') ? msg.url : API_URL + msg.url}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                      poster={msg.poster || ''}
                                      controls
                                      preload="metadata"
                                      onError={(e) => {
                                        console.error('視頻載入失敗:', e.target.src);
                                        const finalUrl = msg.url.startsWith('http') ? msg.url : API_URL + msg.url;
                                        e.target.style.display = 'none';
                                        e.target.parentNode.innerHTML = `
                                          <div style="padding: 20px; text-align: center; color: #fff;">
                                            <div>視頻載入失敗</div>
                                            <button onclick="window.open('${finalUrl}', '_blank')" style="margin-top: 8px; padding: 4px 8px; font-size: 12px; background: #2196f3; color: #fff; border: none; border-radius: 4px; cursor: pointer;">在新視窗開啟</button>
                                          </div>
                                        `;
                                      }}
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
                                      const audioUrl = msg.url.startsWith('http') ? msg.url : API_URL + msg.url;
                                      console.log('嘗試播放語音:', audioUrl);
                                      try {
                                        if (!audioRefs.current[msg._id]) {
                                          audioRefs.current[msg._id] = new Audio();
                                        }

                                        // 設置音頻屬性
                                        audioRefs.current[msg._id].src = audioUrl;
                                        audioRefs.current[msg._id].preload = 'metadata';

                                        // 添加錯誤處理
                                        audioRefs.current[msg._id].onerror = (e) => {
                                          console.error('音頻載入失敗:', e);
                                          setPlayingVoiceId(null);
                                          alert('無法載入語音文件，請檢查網絡連接或文件格式');
                                        };

                                        audioRefs.current[msg._id].onended = () => {
                                          console.log('語音播放結束，重置 playingVoiceId');
                                          setPlayingVoiceId(null);
                                        };

                                        console.log('設置 playingVoiceId 為:', msg._id);
                                        setPlayingVoiceId(msg._id);

                                        // 等待音頻載入完成後播放
                                        audioRefs.current[msg._id].oncanplaythrough = async () => {
                                          try {
                                            await audioRefs.current[msg._id].play();
                                            console.log('語音播放成功');
                                          } catch (playError) {
                                            console.error('播放失敗:', playError);
                                            setPlayingVoiceId(null);
                                            alert('無法播放語音：' + (playError.message || playError));
                                          }
                                        };

                                        // 如果音頻已經載入完成，直接播放
                                        if (audioRefs.current[msg._id].readyState >= 2) {
                                          await audioRefs.current[msg._id].play();
                                          console.log('語音播放成功');
                                        }
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
                            {/* 時間戳 - 改善短訊息時的顯示 */}
                            <span style={{
                              position: 'absolute',
                              right: 10,
                              bottom: 2,
                              fontSize: 11,
                              color: theme === 'dark' ? '#999' : '#aaa',
                              whiteSpace: 'nowrap',
                              paddingLeft: 8
                            }}>{formatTime(msg.createdAt)}</span>
                          </div>
                        </div>
                        {/* 操作選單（右鍵觸發） */}
                        {openActionMenuId === msg._id && (
                          <div className="menu-anim" style={{ position: 'fixed', left: contextMenuPos?.x, top: contextMenuPos?.y, background: themeStyles.cardBg, border: `1px solid ${themeStyles.border}`, borderRadius: 6, boxShadow: theme === 'dark' ? '0 2px 8px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.1)', zIndex: 10000, minWidth: 80 }}>
                            {isMe && <button onClick={() => { startEditMessage(msg); setOpenActionMenuId(null); }} className="button-secondary" style={{ width: '100%', borderRadius: 0, borderBottom: `1px solid ${themeStyles.divider}` }}>編輯</button>}
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
        <div style={{ width: 300, background: themeStyles.sidebarBg, color: themeStyles.color, borderLeft: `1px solid ${themeStyles.border}`, padding: 20, position: 'relative', overflowY: 'auto', maxHeight: '100vh' }}>
          <button onClick={() => setShowGroupInfo(false)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: themeStyles.textSecondary }}>✕</button>
          <h3 style={{ marginTop: 0, marginBottom: 20, fontSize: 20 }}>群組資訊</h3>
          <div style={{ marginBottom: 12 }}>
            <b>公告：</b>
            <div style={{ background: themeStyles.input, padding: 8, borderRadius: 4, minHeight: 40, marginBottom: 4, border: `1px solid ${themeStyles.border}`, color: themeStyles.color }}>{groupInfo.announcement || '（無公告）'}</div>
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
                      src={m.avatar ?
                        (m.avatar.startsWith('http') ? m.avatar : API_URL + m.avatar) :
                        'https://res.cloudinary.com/dvnuhsvtd/image/upload/v1754576538/chat-app/default-avatar.jpg'}
                      alt={m.username}
                      style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${themeStyles.border}`, background: themeStyles.cardBg, marginRight: 8 }}
                    />
                    <span>{m.username} {role}</span>
                    {m._id !== userId && (
                      <>
                        <button style={{ marginLeft: 8, background: themeStyles.buttonInfo, color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }} onClick={() => handleCallInvite(m._id)}>語音</button>
                        <button style={{ marginLeft: 4, background: themeStyles.buttonSuccess, color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }} onClick={() => handleVideoCallInvite(m._id)}>視訊</button>
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
              const userIdentifier = prompt('請輸入要邀請的用戶（格式：name#1234）');
              if (userIdentifier) handleInviteMember(userIdentifier);
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
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: themeStyles.cardBg, color: themeStyles.color, border: `1px solid ${themeStyles.buttonInfo}`, borderRadius: 8, padding: '8px 24px', zIndex: 1000, boxShadow: theme === 'dark' ? '0 2px 8px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.1)' }}>
          上傳中... {uploadProgress}%
          <div style={{ width: 200, height: 8, background: themeStyles.divider, borderRadius: 4, marginTop: 4 }}>
            <div style={{ width: `${uploadProgress}%`, height: 8, background: '#2196f3', borderRadius: 4 }} />
          </div>
        </div>
      )}
      {/* 推播日誌查詢頁 Modal */}
      {showPushLog && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: themeStyles.cardBg, color: themeStyles.color, padding: 24, borderRadius: 8, maxWidth: 900, width: '90%', maxHeight: '90vh', overflow: 'auto', position: 'relative', border: `1px solid ${themeStyles.border}` }}>
            <h2 style={{ color: themeStyles.color }}>推播日誌查詢</h2>
            <button onClick={() => setShowPushLog(false)} style={{ position: 'absolute', right: 32, top: 24 }}>關閉</button>
            {/* 篩選條件 */}
            <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {isAdmin && (
                <input placeholder="userId" style={{ width: 120, background: themeStyles.input, color: themeStyles.color, border: `1px solid ${themeStyles.border}`, padding: 4, borderRadius: 4 }} value={pushLogUserId || ''} onChange={e => setPushLogUserId(e.target.value)} />
              )}
              <select value={pushLogType || ''} onChange={e => setPushLogType(e.target.value)} style={{ width: 120, background: themeStyles.input, color: themeStyles.color, border: `1px solid ${themeStyles.border}`, padding: 4, borderRadius: 4 }}>
                <option value="">全部型別</option>
                <option value="mention">@提及</option>
                <option value="announcement">公告</option>
                <option value="message">一般訊息</option>
                <option value="voice">語音</option>
                <option value="file">檔案</option>
                <option value="system">系統</option>
              </select>
              <input type="date" value={pushLogStart} onChange={e => setPushLogStart(e.target.value)} style={{ background: themeStyles.input, color: themeStyles.color, border: `1px solid ${themeStyles.border}`, padding: 4, borderRadius: 4 }} />
              <input type="date" value={pushLogEnd} onChange={e => setPushLogEnd(e.target.value)} style={{ background: themeStyles.input, color: themeStyles.color, border: `1px solid ${themeStyles.border}`, padding: 4, borderRadius: 4 }} />
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
                  <tr style={{ background: themeStyles.sidebarBg, color: themeStyles.color }}>
                    <th style={{ padding: 8, borderBottom: `1px solid ${themeStyles.border}` }}>時間</th>
                    <th style={{ padding: 8, borderBottom: `1px solid ${themeStyles.border}` }}>型別</th>
                    <th>標題</th>
                    <th>內容</th>
                    <th>狀態</th>
                    <th>錯誤</th>
                    <th>data</th>
                  </tr>
                </thead>
                <tbody>
                  {pushLogs.map(l => (
                    <tr key={l._id} style={{ background: l.status === 'fail' ? (theme === 'dark' ? '#3d1f1f' : '#ffebee') : undefined, borderBottom: `1px solid ${themeStyles.border}` }}>
                      <td style={{ padding: 8, color: themeStyles.color }}>{new Date(l.createdAt).toLocaleString()}</td>
                      <td style={{ padding: 8, color: themeStyles.color }}>{l.type}</td>
                      <td style={{ padding: 8, color: themeStyles.color }}>{l.title}</td>
                      <td style={{ padding: 8, color: themeStyles.color }}>{l.body}</td>
                      <td style={{ padding: 8, color: l.status === 'fail' ? '#e53935' : '#4caf50' }}>{l.status}</td>
                      <td style={{ padding: 8, color: themeStyles.color }}>{l.error}</td>
                      <td style={{ padding: 8 }}><pre style={{ maxWidth: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: themeStyles.color }}>{JSON.stringify(l.data)}</pre></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {showMention && mentionList.length > 0 && (
        <div style={{ position: 'absolute', background: themeStyles.cardBg, border: `1px solid ${themeStyles.border}`, borderRadius: 6, zIndex: 100, left: 0, top: -40, minWidth: 120, boxShadow: theme === 'dark' ? '0 2px 8px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.1)' }}>
          {mentionList.map((u, i) => (
            <div
              key={u._id}
              style={{ padding: '4px 12px', background: i === mentionIndex ? themeStyles.buttonInfo : 'transparent', cursor: 'pointer', color: i === mentionIndex ? '#fff' : themeStyles.color }}
              onMouseDown={e => { e.preventDefault(); insertMention(u); }}
            >
              @{u.username}
            </div>
          ))}
        </div>
      )}
      {/* 深色模式切換按鈕 */}
      {page === 'chat' && (
        <button
          onClick={toggleTheme}
          style={{
            position: 'fixed',
            top: 12,
            right: 180,
            zIndex: 1001,
            padding: '10px 16px',
            borderRadius: 25,
            border: 'none',
            background: themeStyles.buttonSecondary,
            color: themeStyles.color,
            cursor: 'pointer',
            fontSize: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.3s'
          }}
          title={theme === 'light' ? '切換到深色模式' : '切換到淺色模式'}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      )}
      {/* 會員中心按鈕 */}
      {page === 'chat' && (
        <button
          style={{
            ...profileBtnStyle,
            background: themeStyles.buttonSecondary,
            color: themeStyles.color
          }}
          onClick={() => { setShowProfile(true); fetchProfile(); }}
          onMouseEnter={e => e.currentTarget.style.background = theme === 'dark' ? 'rgba(100,100,100,0.5)' : 'rgba(200,200,200,0.72)'}
          onMouseLeave={e => e.currentTarget.style.background = themeStyles.buttonSecondary}
        >
          {renderAvatar(profile.username, groupInfo, profile, true, null, theme)}
          <span style={{ fontWeight: 'bold', fontSize: 18, color: themeStyles.color, marginRight: 8 }}>{profile.username || username}</span>
        </button>
      )}
      {/* 會員中心 Modal */}
      {showProfile && (
        <div style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {console.log('會員中心顯示 - profile:', profile, 'avatar:', profile.avatar)}
          <div style={{ background: themeStyles.cardBg, color: themeStyles.color, borderRadius: 12, padding: 32, minWidth: 360, position: 'relative', border: `1px solid ${themeStyles.border}` }}>
            <button onClick={() => setShowProfile(false)} style={{ position: 'absolute', top: 16, right: 16, fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', color: themeStyles.color }}>✕</button>
            <h2 style={{ color: themeStyles.color }}>會員中心</h2>
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
              <img
                src={profile.avatar && profile.avatar !== '' ?
                  (profile.avatar.startsWith('http') ? profile.avatar : API_URL + profile.avatar) :
                  'https://res.cloudinary.com/dvnuhsvtd/image/upload/v1754576538/chat-app/default-avatar.jpg'}
                alt="頭像"
                style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', marginBottom: 8, border: '2px solid #2196f3' }}
                onLoad={() => console.log('頭像載入成功:', profile.avatar && profile.avatar !== '' ?
                  (profile.avatar.startsWith('http') ? profile.avatar : API_URL + profile.avatar) :
                  'https://res.cloudinary.com/dvnuhsvtd/image/upload/v1754576538/chat-app/default-avatar.jpg')}
                onError={(e) => {
                  // 如果載入失敗，自動切換到預設頭像
                  const defaultAvatar = 'https://res.cloudinary.com/dvnuhsvtd/image/upload/v1754576538/chat-app/default-avatar.jpg';
                  if (e.target.src !== defaultAvatar) {
                    console.log('頭像載入失敗:', e.target.src, 'profile.avatar:', profile.avatar);
                    e.target.src = defaultAvatar;
                  }
                }}
              />
              <button style={{ marginBottom: 8, background: themeStyles.buttonInfo, color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', cursor: 'pointer' }} onClick={() => document.getElementById('avatar-file-input').click()}>選擇頭像</button>
              {avatarFile && (
                <button style={{ marginBottom: 8, background: themeStyles.buttonSuccess, color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', cursor: 'pointer' }} onClick={handleAvatarUpload}>上傳頭像</button>
              )}
              {avatarFile && (
                <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>已選擇文件，請點擊上傳</div>
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
              <div style={{ marginBottom: 8 }}>
                帳號：
                {editingUsername ? (
                  <>
                    <input
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value)}
                      style={{ marginLeft: 8, padding: 4, borderRadius: 4, border: `1px solid ${themeStyles.border}`, width: 150, background: themeStyles.input, color: themeStyles.color }}
                      placeholder="輸入新用戶名"
                    />
                    <button style={{ marginLeft: 8, padding: '4px 12px', borderRadius: 4, border: 'none', background: '#2196f3', color: '#fff', cursor: 'pointer' }} onClick={async () => {
                      if (!newUsername.trim()) {
                        alert('用戶名不能為空');
                        return;
                      }
                      try {
                        const res = await safeFetch(`${API_URL}/api/user/update-profile`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ username: newUsername })
                        });
                        const data = await res.json();
                        if (res.ok) {
                          setProfile({ ...profile, username: newUsername });
                          setUsername(newUsername);
                          setEditingUsername(false);
                          alert('用戶名更新成功');
                        } else {
                          alert(data.error || '更新失敗');
                        }
                      } catch (err) {
                        console.error('更新用戶名失敗:', err);
                        alert('更新失敗：' + (err.message || '請重新登入'));
                      }
                    }}>儲存</button>
                    <button className="button-secondary" style={{ marginLeft: 4, padding: '4px 12px', borderRadius: 4 }} onClick={() => setEditingUsername(false)}>取消</button>
                  </>
                ) : (
                  <>
                    {profile.username}
                    <button className="button-secondary" style={{ marginLeft: 8, padding: '4px 12px', borderRadius: 4 }} onClick={() => { setEditingUsername(true); setNewUsername(profile.username); }}>修改</button>
                  </>
                )}
              </div>
              <div style={{ marginBottom: 8 }}>
                ID：
                {editingDiscriminator ? (
                  <>
                    <input
                      value={newDiscriminator}
                      onChange={e => setNewDiscriminator(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      style={{ marginLeft: 8, padding: 4, borderRadius: 4, border: `1px solid ${themeStyles.border}`, width: 80, background: themeStyles.input, color: themeStyles.color }}
                      placeholder="4位數字"
                      maxLength={4}
                    />
                    <button style={{ marginLeft: 8, padding: '4px 12px', borderRadius: 4, border: 'none', background: '#2196f3', color: '#fff', cursor: 'pointer' }} onClick={async () => {
                      if (newDiscriminator.length !== 4) {
                        alert('ID必須是4位數字');
                        return;
                      }
                      try {
                        const res = await safeFetch(`${API_URL}/api/user/update-profile`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ discriminator: newDiscriminator })
                        });
                        const data = await res.json();
                        if (res.ok) {
                          setProfile({ ...profile, discriminator: newDiscriminator });
                          setDiscriminator(newDiscriminator);
                          setEditingDiscriminator(false);
                          alert('ID更新成功');
                        } else {
                          alert(data.error || '更新失敗（ID可能已被使用）');
                        }
                      } catch (err) {
                        console.error('更新ID失敗:', err);
                        alert('更新失敗：' + (err.message || '請重新登入'));
                      }
                    }}>儲存</button>
                    <button className="button-secondary" style={{ marginLeft: 4, padding: '4px 12px', borderRadius: 4 }} onClick={() => setEditingDiscriminator(false)}>取消</button>
                  </>
                ) : (
                  <>
                    {discriminator || profile.discriminator}
                    <button className="button-secondary" style={{ marginLeft: 8, padding: '4px 12px', borderRadius: 4 }} onClick={() => { setEditingDiscriminator(true); setNewDiscriminator(discriminator || profile.discriminator); }}>修改</button>
                  </>
                )}
              </div>
              <div style={{ marginBottom: 8 }}>
                Email：
                {editingEmail ? (
                  <>
                    <input
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      style={{ marginLeft: 8, padding: 4, borderRadius: 4, border: `1px solid ${themeStyles.border}`, width: 180, background: themeStyles.input, color: themeStyles.color }}
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
          <div style={{ background: themeStyles.cardBg, color: themeStyles.color, borderRadius: 12, padding: 24, maxWidth: '90vw', maxHeight: '90vh', position: 'relative', border: `1px solid ${themeStyles.border}` }}>
            <button onClick={() => setShowCropModal(false)} style={{ position: 'absolute', top: 12, right: 12, fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', zIndex: 1, color: themeStyles.color }}>✕</button>
            <h3 style={{ marginBottom: 16, color: themeStyles.color }}>裁切頭像</h3>
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
              <button onClick={() => setShowCropModal(false)} style={{ padding: '8px 16px', background: themeStyles.buttonSecondary, color: themeStyles.color, border: 'none', borderRadius: 4, cursor: 'pointer' }}>取消</button>
              <button onClick={handleCropComplete} style={{ padding: '8px 16px', background: themeStyles.buttonInfo, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>確認裁切</button>
            </div>
          </div>
        </div>
      )}
      {/* 群組成員完整列表彈窗 */}
      {showGroupMemberList && currentGroupObj && hasGroupMembers && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowGroupMemberList(false)}>
          <div style={{ background: themeStyles.cardBg, borderRadius: 12, padding: 24, minWidth: 320, maxHeight: '80vh', overflowY: 'auto', position: 'relative', border: `1px solid ${themeStyles.border}` }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowGroupMemberList(false)} style={{ position: 'absolute', top: 12, right: 12, fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', color: themeStyles.color }}>✕</button>
            <h3 style={{ color: themeStyles.color }}>群組成員 ({groupMembers.length})</h3>
            <ul style={{ padding: 0, listStyle: 'none' }}>
              {groupMembers.map((u, idx) => (
                <li key={u._id || idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <img
                    src={u.avatar ?
                      (u.avatar.startsWith('http') ? u.avatar : API_URL + u.avatar) :
                      'https://res.cloudinary.com/dvnuhsvtd/image/upload/v1754576538/chat-app/default-avatar.jpg'}
                    alt={u.username}
                    style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${themeStyles.border}`, background: themeStyles.cardBg, marginRight: 8 }}
                  />
                  <span style={{ fontSize: 15, color: '#222', wordBreak: 'break-all' }}>{u.username}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {/* 群組通話彈窗 */}
      {groupCallState.visible && (
        <div style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: themeStyles.cardBg, borderRadius: 16, padding: 32, minWidth: 480, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto', position: 'relative', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <button onClick={handleLeaveGroupCall} style={{ position: 'absolute', top: 16, right: 16, fontSize: 24, background: 'none', border: 'none', cursor: 'pointer', color: themeStyles.textSecondary }}>✕</button>

            <h3 style={{ margin: '0 0 24px 0', fontSize: 24, color: themeStyles.buttonInfo }}>
              群組{groupCallState.type === 'video' ? '視訊' : '語音'}通話
            </h3>

            {/* 成員列表 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
              {groupCallState.members.length === 0 && (
                <div style={{ color: themeStyles.textSecondary, gridColumn: '1 / -1', textAlign: 'center', padding: '32px 0' }}>
                  等待成員加入...
                </div>
              )}

              {groupCallState.members.map(member => {
                const isMuted = member.userId === userId ? groupCallState.isMuted : member.isMuted;
                const isVideoOff = member.userId === userId ? groupCallState.isVideoOff : member.isVideoOff;
                const isSpeaking = speakingUsers.has(member.userId) && !isMuted;

                return (
                  <div key={member.userId} style={{
                    background: theme === 'dark' ? '#21262d' : '#f5f5f5',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    border: member.userId === userId ? `2px solid ${themeStyles.buttonInfo}` : '2px solid transparent',
                    position: 'relative'
                  }}>
                    {/* 視訊或頭像顯示 */}
                    <div style={{ position: 'relative', width: '100%', marginBottom: 8 }}>
                      {groupCallState.type === 'video' && groupCallState.streams[member.userId] && !isVideoOff ? (
                        <video
                          autoPlay
                          playsInline
                          muted={member.userId === userId}
                          ref={el => {
                            if (el && groupCallState.streams[member.userId]) {
                              el.srcObject = groupCallState.streams[member.userId];
                              // 確保視訊播放
                              el.play().catch(err => console.error('視訊播放失敗:', err));
                            }
                          }}
                          style={{
                            width: '100%',
                            height: 120,
                            borderRadius: 8,
                            objectFit: 'cover',
                            background: '#000',
                            transform: member.userId === userId ? 'scaleX(-1)' : 'none' // 鏡像翻轉自己的視訊
                          }}
                          onLoadedMetadata={(e) => {
                            console.log('視訊元數據已加載:', member.username);
                            e.target.play().catch(err => console.error('播放失敗:', err));
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '100%',
                          height: 120,
                          borderRadius: 8,
                          background: themeStyles.buttonInfo,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative'
                        }}>
                          {/* 音波動畫 */}
                          {isSpeaking && (
                            <div style={{
                              position: 'absolute',
                              width: 80,
                              height: 80,
                              borderRadius: '50%',
                              border: '3px solid rgba(255,255,255,0.6)',
                              animation: 'pulse 1.5s ease-out infinite'
                            }} />
                          )}
                          {/* 頭像 */}
                          <img
                            src={getUserAvatar(member.username, groupInfo, profile)}
                            alt={member.username}
                            style={{
                              width: 60,
                              height: 60,
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: '3px solid #fff',
                              position: 'relative',
                              zIndex: 1
                            }}
                            onError={(e) => {
                              console.error('頭像加載失敗:', member.username, getUserAvatar(member.username, groupInfo, profile));
                              e.target.style.display = 'none';
                              if (e.target.nextSibling) {
                                e.target.nextSibling.style.display = 'flex';
                              }
                            }}
                            onLoad={() => {
                              console.log('頭像加載成功:', member.username);
                            }}
                          />
                          {/* 備用頭像（首字母） */}
                          <div style={{
                            width: 60,
                            height: 60,
                            borderRadius: '50%',
                            background: '#fff',
                            display: 'none',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 24,
                            fontWeight: 'bold',
                            color: themeStyles.buttonInfo,
                            border: '3px solid #fff',
                            position: 'absolute',
                            zIndex: 1
                          }}>
                            {member.username ? member.username[0].toUpperCase() : '?'}
                          </div>
                        </div>
                      )}

                      {/* 靜音圖示 */}
                      {isMuted && (
                        <div style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          background: 'rgba(229, 57, 53, 0.9)',
                          borderRadius: '50%',
                          width: 28,
                          height: 28,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 2
                        }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                            <line x1="1" y1="1" x2="23" y2="23"></line>
                            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                            <line x1="12" y1="19" x2="12" y2="23"></line>
                            <line x1="8" y1="23" x2="16" y2="23"></line>
                          </svg>
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: 14, fontWeight: 600, color: themeStyles.color, textAlign: 'center' }}>
                      {member.username}
                      {member.userId === userId && ' (你)'}
                    </div>

                    {groupCallState.streams[member.userId] && (
                      <audio
                        autoPlay
                        ref={el => {
                          if (el && groupCallState.streams[member.userId] && member.userId !== userId) {
                            el.srcObject = groupCallState.streams[member.userId];
                          }
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* 控制按鈕 */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {!groupCallState.isCaller && groupCallState.members.length > 0 && !groupCallState.members.some(m => m.userId === userId) && (
                <button
                  style={{ background: themeStyles.buttonInfo, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', cursor: 'pointer', fontSize: 16, fontWeight: 600 }}
                  onClick={handleJoinGroupCall}
                >
                  加入通話
                </button>
              )}

              {groupCallState.members.some(m => m.userId === userId) && (
                <>
                  <button
                    style={{
                      background: groupCallState.isMuted ? themeStyles.buttonDanger : themeStyles.buttonSuccess,
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '12px 24px',
                      cursor: 'pointer',
                      fontSize: 16,
                      fontWeight: 600
                    }}
                    onClick={toggleGroupCallMute}
                  >
                    {groupCallState.isMuted ? '取消靜音' : '靜音'}
                  </button>

                  {groupCallState.type === 'video' && (
                    <button
                      style={{
                        background: groupCallState.isVideoOff ? themeStyles.buttonDanger : themeStyles.buttonSuccess,
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '12px 24px',
                        cursor: 'pointer',
                        fontSize: 16,
                        fontWeight: 600
                      }}
                      onClick={toggleGroupCallVideo}
                    >
                      {groupCallState.isVideoOff ? '開啟視訊' : '關閉視訊'}
                    </button>
                  )}
                </>
              )}

              {groupCallState.members.some(m => m.userId === userId) && (
                <button
                  style={{ background: themeStyles.buttonDanger, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', cursor: 'pointer', fontSize: 16, fontWeight: 600 }}
                  onClick={handleLeaveGroupCall}
                >
                  離開通話
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 通話通知 */}
      {callNotification && (
        <div style={{
          position: 'fixed',
          top: 80,
          right: 20,
          background: themeStyles.cardBg,
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          zIndex: 2500,
          minWidth: 300,
          border: `2px solid ${themeStyles.buttonInfo}`,
          animation: 'slideInRight 0.3s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: themeStyles.buttonInfo,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12
            }}>
              {callNotification.type === 'video' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                  <rect x="2" y="7" width="15" height="10" rx="2" ry="2"></rect>
                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                  <path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.72 19.72 0 0 1 3 5.18 2 2 0 0 1 5 3h2.09a2 2 0 0 1 2 1.72c.13 1.05.37 2.07.72 3.06a2 2 0 0 1-.45 2.11l-.27.27a16 16 0 0 0 6.29 6.29l.27-.27a2 2 0 0 1 2.11-.45c.99.35 2.01.59 3.06.72A2 2 0 0 1 22 16.92z"></path>
                </svg>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold', fontSize: 16, color: themeStyles.color, marginBottom: 4 }}>
                {callNotification.type === 'video' ? '群組視訊通話' : '群組語音通話'}
              </div>
              <div style={{ fontSize: 14, color: themeStyles.textSecondary }}>
                {callNotification.fromUsername} 發起了通話
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{
                flex: 1,
                background: themeStyles.buttonSuccess,
                color: themeStyles.buttonText,
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600
              }}
              onClick={() => {
                setCallNotification(null);
                handleJoinGroupCall();
              }}
            >
              加入
            </button>
            <button
              style={{
                flex: 1,
                background: themeStyles.buttonSecondary,
                color: themeStyles.color,
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600
              }}
              onClick={() => setCallNotification(null)}
            >
              忽略
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;