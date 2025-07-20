import React, { useState, useRef, useEffect } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Image, Alert, Pressable, ActivityIndicator, Modal, TouchableWithoutFeedback, ActionSheetIOS, FlatList as RNFlatList, Animated } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import io, { Socket } from 'socket.io-client';
import CallModal from './call-modal';
import { CheckBox } from 'react-native-elements';
import { useTheme } from '../../ThemeContext';

// Mock 資料
const userId = 'userA';
const peerId = 'userB';
const groupId = 'demoGroupId';
const token = 'mock-jwt-token';

const userMap: Record<string, { name: string; avatar: string }> = {
  userA: { name: '我', avatar: 'https://randomuser.me/api/portraits/men/32.jpg' },
  userB: { name: '對方', avatar: 'https://randomuser.me/api/portraits/women/44.jpg' },
};

const userList = [
  { userId: 'userA', name: '我' },
  { userId: 'userB', name: '對方' },
  { userId: 'userC', name: '小明' },
  { userId: 'userD', name: '小美' },
];

const initialMessages: Message[] = [
  { _id: '1', sender: 'userA', type: 'text', text: 'Hello!', createdAt: new Date().toISOString() },
  { _id: '2', sender: 'userB', type: 'text', text: 'Hi, how are you?', createdAt: new Date().toISOString() },
];

type Message = {
  _id: string;
  sender?: string;
  type: 'text' | 'image' | 'system' | 'sticker';
  text?: string;
  imageUri?: string;
  createdAt: string;
  readBy?: string[];
  edited?: boolean;
  deleted?: boolean;
  replyTo?: string;
  mentions?: string[];
  tags?: string[];
  archived?: boolean;
  content?: string; // 新增 content 欄位
};

// Reaction 資料型別
// { [messageId]: { [emoji]: userId[] } }
type ReactionMap = { [msgId: string]: { [emoji: string]: string[] } };

function formatTime(ts: string) {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h < 12 ? '上午' : '下午';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${hour}:${m}`;
}

const allTags = [
  { name: '重要', color: '#e53935' },
  { name: '待處理', color: '#fbc02d' },
  { name: '已完成', color: '#43a047' },
  { name: '討論', color: '#1976d2' },
];

const isAdmin = true; // TODO: 串接實際權限

const emojiList = ['😀','😂','😍','👍','🎉','😢','😡','🙏','🥰','😎','🤔','👏','💯','🔥','😱','🤩'];
const stickerList = [
  'https://cdn-icons-png.flaticon.com/512/616/616408.png',
  'https://cdn-icons-png.flaticon.com/512/616/616408.png',
  'https://cdn-icons-png.flaticon.com/512/616/616408.png',
  'https://cdn-icons-png.flaticon.com/512/616/616408.png',
];

const emojiAll = [
  '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','🥰','😗','😙','😚','🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','😡','😠','🤬','😷','🤒','🤕','🤢','🤮','🥴','😇','🥳','🥺','🤠','😈','👿','👹','👺','💀','👻','👽','🤖','💩','😺','😸','😹','😻','😼','😽','🙀','😿','😾','👍','👎','👏','🙌','👐','🙏','💪','👋','🤙','💅','🦾','🦵','🦶','👣','👀','👁️','👅','👄','💋','💘','💝','💖','💗','💓','💞','💕','💌','💟','❣️','💔','❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💯','🔥','✨','🌟','💫','⭐','🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','💧','💦','☔','🧊','🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🥞','🧇','🧀','🍖','🍗','🥩','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥣','🥗','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🦀','🦞','🦐','🦑','🦪','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🥄','🍴','🍽️','🥣','🥡','🥢','🧂','⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🥅','🏒','🏑','🥍','🏏','🪃','🥌','⛳','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️‍♂️','🏋️‍♀️','🤼‍♂️','🤼‍♀️','🤸‍♂️','🤸‍♀️','⛹️‍♂️','⛹️‍♀️','🤺','🤾‍♂️','🤾‍♀️','🏌️‍♂️','🏌️‍♀️','🏇','🧘‍♂️','🧘‍♀️','🏄‍♂️','🏄‍♀️','🏊‍♂️','🏊‍♀️','🤽‍♂️','🤽‍♀️','🚣‍♂️','🚣‍♀️','🧗‍♂️','🧗‍♀️','🚵‍♂️','🚵‍♀️','🚴‍♂️','🚴‍♀️','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹‍♂️','🤹‍♀️','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🎰'];

// 範例貼圖（可換成自己的 CDN 或本地資源）
const stickers = [
  { uri: 'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif' },
  { uri: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif' },
  { uri: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif' },
  { uri: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif' },
  { uri: 'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif' },
  { uri: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif' },
  { uri: 'https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif' },
  { uri: 'https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif' },
];

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [callVisible, setCallVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editMsgId, setEditMsgId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [replyMsg, setReplyMsg] = useState<Message | null>(null);
  const [mentionListVisible, setMentionListVisible] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentions, setMentions] = useState<{ userId: string; name: string }[]>([]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [tagModalType, setTagModalType] = useState<'add' | 'remove'>('add');
  const [tagInput, setTagInput] = useState('');
  const [tagSuggest, setTagSuggest] = useState<string[]>([]);
  const [archiveModalVisible, setArchiveModalVisible] = useState(false);
  const [archiveType, setArchiveType] = useState<'archive' | 'unarchive'>('archive');
  const [socketStatus, setSocketStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');
  const [statusMsg, setStatusMsg] = useState('');
  const statusAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const [animatedIds, setAnimatedIds] = useState<string[]>([]);
  const [emojiVisible, setEmojiVisible] = useState(false);
  const [stickerVisible, setStickerVisible] = useState(false);
  const [emojiTab, setEmojiTab] = useState<'recent' | 'all'>('recent');
  const [recentEmoji, setRecentEmoji] = useState<string[]>([]);
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const { theme } = useTheme();

  // 權限判斷
  const isSelf = (msg: Message) => msg.sender === userId;

  // 歷史訊息分頁載入
  const fetchMessages = async (reset = false) => {
    if (loading || (!hasMore && !reset)) return;
    setLoading(true);
    let before = '';
    if (!reset && messages.length > 0) before = messages[0]._id;
    try {
      const res = await fetch(`http://localhost:3001/api/group/${groupId}/messages?limit=20${before ? `&before=${before}` : ''}`);
      const data = await res.json();
      if (res.ok && data.messages) {
        setMessages(prev => reset ? data.messages : [...data.messages, ...prev]);
        setHasMore(data.hasMore);
      }
    } catch (e) {
      // 可加錯誤提示
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 進入聊天室自動載入
  useEffect(() => {
    fetchMessages(true);
    // 進入聊天室自動回報已讀
    setTimeout(() => {
      if (messages.length > 0) {
        const lastId = messages[messages.length - 1]._id;
        socketRef.current?.emit('read', { userId, groupId, messageId: lastId });
      }
    }, 500);
    // eslint-disable-next-line
  }, []);

  // 進入聊天室自動聚焦輸入欄
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 400);
  }, []);

  // 發送訊息後自動聚焦
  useEffect(() => {
    if (input === '') setTimeout(() => inputRef.current?.focus(), 200);
  }, [input]);

  // 新訊息淡入動畫
  const renderAnimatedRow = (id: string, children: React.ReactNode) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      if (!animatedIds.includes(id)) {
        setAnimatedIds(prev => [...prev, id]);
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      } else {
        fadeAnim.setValue(1);
      }
    }, []);
    return <Animated.View style={{ opacity: fadeAnim }}>{children}</Animated.View>;
  };

  // FlatList 上滑分頁載入
  const handleEndReached = () => {
    if (!loading && hasMore) fetchMessages();
  };

  // 下拉重新整理
  const onRefresh = () => {
    setRefreshing(true);
    fetchMessages(true);
  };

  // 長按訊息彈出 ActionSheet
  const handleLongPress = (item: Message) => {
    if (item.type === 'system' || item.deleted) return;
    const isMe = isSelf(item);
    const canEdit = isMe;
    const canDelete = isMe || isAdmin;
    const canReply = true;
    const options = [canReply ? '回覆' : null, canDelete ? '刪除' : null, canEdit ? '編輯' : null, '取消'].filter(Boolean) as string[];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        destructiveButtonIndex: canDelete ? 1 : undefined,
        cancelButtonIndex: options.length - 1,
      },
      (buttonIndex) => {
        if (buttonIndex === 0 && canReply) setReplyMsg(item);
        if (canDelete && buttonIndex === 1) handleDelete(item._id);
        if (canEdit && buttonIndex === 2) {
          setEditMsgId(item._id);
          setEditInput(item.text || '');
        }
      }
    );
  };

  // 點擊訊息切換選取狀態
  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // 全選/取消全選
  const handleSelectAll = () => {
    if (selectedIds.length === messages.length) setSelectedIds([]);
    else setSelectedIds(messages.map(m => m._id));
  };

  // 批次刪除
  const handleBatchDelete = () => {
    selectedIds.forEach(id => socketRef.current?.emit('delete', { messageId: id }));
    setMultiSelect(false);
    setSelectedIds([]);
  };

  // 退出多選
  const exitMultiSelect = () => {
    setMultiSelect(false);
    setSelectedIds([]);
  };

  // 刪除訊息（權限檢查+日誌）
  const handleDelete = (id: string) => {
    const msg = messages.find(m => m._id === id);
    if (!msg) return;
    if (!isSelf(msg) && !isAdmin) {
      Alert.alert('無權限', '只有本人或管理員可刪除訊息');
      return;
    }
    socketRef.current?.emit('delete', { messageId: id });
    console.log(`[LOG] user:${userId} 刪除訊息 ${id} at ${new Date().toISOString()}`);
  };

  // 編輯訊息（權限檢查+日誌）
  const handleEdit = () => {
    if (!editMsgId || !editInput.trim()) return;
    const msg = messages.find(m => m._id === editMsgId);
    if (!msg || !isSelf(msg)) {
      Alert.alert('無權限', '只有本人可編輯訊息');
      return;
    }
    socketRef.current?.emit('edit', { messageId: editMsgId, newText: editInput });
    setEditMsgId(null);
    setEditInput('');
    console.log(`[LOG] user:${userId} 編輯訊息 ${editMsgId} at ${new Date().toISOString()}`);
  };

  // 批次標籤/移除標籤
  const handleBatchTag = (type: 'add' | 'remove') => {
    setTagModalType(type);
    setTagModalVisible(true);
    setTagInput('');
    setTagSuggest([]);
  };
  const submitTagModal = () => {
    if (!tagInput) return;
    if (tagModalType === 'add') {
      socketRef.current?.emit('batch-tag', { ids: selectedIds, tag: tagInput });
    } else {
      socketRef.current?.emit('batch-untag', { ids: selectedIds, tag: tagInput });
    }
    setTagModalVisible(false);
    setMultiSelect(false);
    setSelectedIds([]);
  };

  // 批次歸檔/取消歸檔
  const handleBatchArchive = (type: 'archive' | 'unarchive') => {
    setArchiveType(type);
    setArchiveModalVisible(true);
  };
  const submitArchiveModal = () => {
    if (archiveType === 'archive') {
      socketRef.current?.emit('batch-archive', { ids: selectedIds });
    } else {
      socketRef.current?.emit('batch-unarchive', { ids: selectedIds });
    }
    setArchiveModalVisible(false);
    setMultiSelect(false);
    setSelectedIds([]);
  };

  // 標籤自動補全
  useEffect(() => {
    if (!tagInput) setTagSuggest([]);
    else setTagSuggest(allTags.filter(t => t.name.includes(tagInput)).map(t => t.name));
  }, [tagInput]);

  // 監聽標籤推播
  useEffect(() => {
    if (!socketRef.current) return;
    const socket = socketRef.current;
    socket.on('batch-tag', ({ ids, tag }) => {
      setMessages(prev => prev.map(m => ids.includes(m._id) ? { ...m, tags: [...(m.tags || []), tag] } : m));
    });
    socket.on('batch-untag', ({ ids, tag }) => {
      setMessages(prev => prev.map(m => ids.includes(m._id) ? { ...m, tags: (m.tags || []).filter(t => t !== tag) } : m));
    });
    return () => {
      socket.off('batch-tag');
      socket.off('batch-untag');
    };
  }, []);

  // 監聽歸檔推播
  useEffect(() => {
    if (!socketRef.current) return;
    const socket = socketRef.current;
    socket.on('batch-archive', ({ ids }) => {
      setMessages(prev => prev.map(m => ids.includes(m._id) ? { ...m, archived: true } : m));
    });
    socket.on('batch-unarchive', ({ ids }) => {
      setMessages(prev => prev.map(m => ids.includes(m._id) ? { ...m, archived: false } : m));
    });
    return () => {
      socket.off('batch-archive');
      socket.off('batch-unarchive');
    };
  }, []);

  // Socket.IO 連線與事件（含斷線重連提示）
  useEffect(() => {
    const socket = io('ws://localhost:3001', {
      transports: ['websocket'],
      auth: { token },
      query: { userId, groupId },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      setSocketStatus('connected');
      setStatusMsg('已重新連線');
      Animated.timing(statusAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => {
        setTimeout(() => Animated.timing(statusAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(), 1200);
      });
    });
    socket.on('disconnect', () => {
      setSocketStatus('disconnected');
      setStatusMsg('已斷線，正在重連...');
      Animated.timing(statusAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
    socket.on('reconnect_attempt', () => {
      setSocketStatus('reconnecting');
      setStatusMsg('正在重連...');
      Animated.timing(statusAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
    socket.on('message', (msg: Message) => {
      setMessages(prev => [...prev, msg]);
    });
    socket.on('read', ({ userId: readUser, messageId }: { userId: string; messageId: string }) => {
      setMessages(prev => prev.map(m =>
        m._id === messageId && m.readBy && !m.readBy.includes(readUser)
          ? { ...m, readBy: [...m.readBy, readUser] }
          : m
      ));
    });
    // 監聽刪除事件
    socket.on('delete', ({ messageId }: { messageId: string }) => {
      setMessages(prev => prev.map(m =>
        m._id === messageId ? { ...m, deleted: true, text: '', imageUri: '' } : m
      ));
    });
    // 監聽編輯事件
    socket.on('edit', ({ messageId, newText }: { messageId: string; newText: string }) => {
      setMessages(prev => prev.map(m =>
        m._id === messageId ? { ...m, text: newText, edited: true } : m
      ));
    });
    return () => { socket.disconnect(); };
  }, []);

  // 新訊息自動滾動
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // 輸入欄 onChangeText 處理 @ 提及
  const handleInputChange = (text: string) => {
    setInput(text);
    const atIdx = text.lastIndexOf('@');
    if (atIdx !== -1 && (atIdx === 0 || /\s/.test(text[atIdx - 1]))) {
      setMentionListVisible(true);
      setMentionQuery(text.slice(atIdx + 1));
    } else {
      setMentionListVisible(false);
      setMentionQuery('');
    }
  };

  // 選擇用戶插入 @暱稱
  const handleMentionSelect = (user: { userId: string; name: string }) => {
    const atIdx = input.lastIndexOf('@');
    if (atIdx !== -1) {
      const before = input.slice(0, atIdx + 1);
      const after = input.slice(atIdx + 1);
      setInput(before + user.name + ' ');
      setMentions(prev => prev.some(u => u.userId === user.userId) ? prev : [...prev, user]);
      setMentionListVisible(false);
      setMentionQuery('');
    }
  };

  // 發送訊息時帶上 mentions
  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    setSendError('');
    const msg: Message = {
      _id: Date.now().toString(),
      sender: userId,
      type: 'text',
      text: input,
      createdAt: new Date().toISOString(),
      ...(replyMsg ? { replyTo: replyMsg._id } : {}),
      mentions: mentions.map(u => u.userId),
    };
    socketRef.current?.emit('message', msg, (ack: { ok: boolean; error?: string }) => {
      setSending(false);
      if (!ack.ok) {
        setSendError(ack.error || '訊息發送失敗，請重試');
      } else {
        setInput('');
        setReplyMsg(null);
        setMentions([]);
      }
    });
  };

  // 發送圖片訊息時帶上 replyTo
  const handlePickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!res.canceled && res.assets && res.assets.length > 0) {
      setSending(true);
      setSendError('');
      const msg: Message = {
        _id: Date.now().toString(),
        sender: userId,
        type: 'image',
        imageUri: res.assets[0].uri,
        createdAt: new Date().toISOString(),
        ...(replyMsg ? { replyTo: replyMsg._id } : {}),
      };
      socketRef.current?.emit('message', msg, (ack: { ok: boolean; error?: string }) => {
        setSending(false);
        if (!ack.ok) {
          setSendError(ack.error || '圖片發送失敗，請重試');
        } else {
          setReplyMsg(null);
        }
      });
    }
  };

  // 長按訊息複製
  const handleCopy = (text: string) => {
    Clipboard.setStringAsync(text);
    Alert.alert('已複製', '訊息內容已複製到剪貼簿');
  };

  // 判斷是否顯示頭像/名稱（同一用戶連續訊息只顯示一次）
  const shouldShowAvatar = (index: number) => {
    if (index === 0) return true;
    return messages[index].sender !== messages[index - 1].sender;
  };

  // 高亮 @暱稱
  const renderTextWithMention = (text: string) => {
    const parts = text.split(/(@[\w\u4e00-\u9fa5]+)/g);
    return parts.map((part, i) => {
      if (/^@/.test(part)) {
        return <Text key={i} style={styles.mention}>{part}</Text>;
      }
      return <Text key={i}>{part}</Text>;
    });
  };

  // 多選批次操作權限
  const canBatch = isAdmin;

  // 訊息時間分組（日期分隔條）
  function getDateLabel(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const isYesterday = d.toDateString() === new Date(now.getTime() - 86400000).toDateString();
    if (isToday) return '今天';
    if (isYesterday) return '昨天';
    return d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getDate().toString().padStart(2, '0');
  }

  // 插入 Emoji 並加入最近/常用
  const handleEmojiSelect = (emoji: string) => {
    setInput(input + emoji);
    setEmojiVisible(false);
    setRecentEmoji(prev => [emoji, ...prev.filter(e => e !== emoji)].slice(0, 10));
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // 發送貼圖
  const handleStickerSend = (uri: string) => {
    setStickerVisible(false);
    setSending(true);
    setSendError('');
    const msg: Message = {
      _id: Date.now().toString(),
      sender: userId,
      type: 'image',
      imageUri: uri,
      createdAt: new Date().toISOString(),
      ...(replyMsg ? { replyTo: replyMsg._id } : {}),
    };
    socketRef.current?.emit('message', msg, (ack: { ok: boolean; error?: string }) => {
      setSending(false);
      if (!ack.ok) {
        setSendError(ack.error || '貼圖發送失敗，請重試');
      } else {
        setReplyMsg(null);
      }
    });
  };

  // 新增/移除表情反應
  const handleAddReaction = (msgId: string, emoji: string) => {
    setReactions(prev => {
      const msgReactions = prev[msgId] || {};
      const users = msgReactions[emoji] || [];
      if (users.includes(userId)) return prev; // 已回應
      return {
        ...prev,
        [msgId]: { ...msgReactions, [emoji]: [...users, userId] },
      };
    });
    setReactionPickerMsgId(null);
  };
  const handleRemoveReaction = (msgId: string, emoji: string) => {
    setReactions(prev => {
      const msgReactions = prev[msgId] || {};
      const users = (msgReactions[emoji] || []).filter(u => u !== userId);
      const newMsgReactions = { ...msgReactions, [emoji]: users };
      if (users.length === 0) delete newMsgReactions[emoji];
      return { ...prev, [msgId]: newMsgReactions };
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Socket 狀態提示條 */}
      <Animated.View style={[styles.socketStatusBar, { opacity: statusAnim, transform: [{ translateY: statusAnim.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }] }]}>
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>{statusMsg}</Text>
      </Animated.View>
      <View style={styles.header}>
        <Text style={styles.title}>聊天室（Demo）</Text>
        <TouchableOpacity onPress={() => setCallVisible(true)} style={styles.callBtn}>
          <Text style={{ color: '#fff' }}>語音通話</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item._id}
        renderItem={({ item, index }) => {
          // 訊息時間分組
          let showDate = false;
          if (index === 0) showDate = true;
          else {
            const prev = messages[index - 1];
            showDate = getDateLabel(item.createdAt) !== getDateLabel(prev.createdAt);
          }
          if (item.type === 'system') {
            return (
              <View style={styles.sysMsgWrap}>
                <Text style={styles.sysMsgText}>{item.text}</Text>
              </View>
            );
          }
          if (item.type === 'sticker') {
            return (
              <View style={styles.stickerMsgRow}>
                <Image source={{ uri: item.imageUri || item.content }} style={styles.stickerMsgImg} resizeMode="contain" />
              </View>
            );
          }
          const isMe = item.sender === userId;
          const user = userMap[item.sender || ''] || { name: item.sender, avatar: '' };
          const showAvatar = shouldShowAvatar(index);
          const isRead = item.readBy && item.readBy.includes(peerId);
          // 刪除訊息顯示灰底提示
          if (item.deleted) {
            return (
              <View style={[styles.msgRow, isMe ? styles.rowRight : styles.rowLeft]}>
                <View style={[styles.msgBubble, styles.deletedMsg]}>
                  <Text style={styles.deletedText}>訊息已被刪除</Text>
                </View>
              </View>
            );
          }
          // 取得被回覆訊息內容
          let replyContent: Message | undefined;
          if (item.replyTo) replyContent = messages.find(m => m._id === item.replyTo);
          const isSelected = selectedIds.includes(item._id);
          // 歸檔訊息顯示 badge 或淡化
          const archivedBadge = item.archived ? (
            <Text style={styles.archivedBadge}>已歸檔</Text>
          ) : null;
          return renderAnimatedRow(item._id, (
            <>
              {showDate && (
                <View style={styles.dateDivider}><Text style={styles.dateDividerText}>{getDateLabel(item.createdAt)}</Text></View>
              )}
              <View style={[styles.msgRow, isMe ? styles.rowRight : styles.rowLeft, item.archived && styles.archivedRow]}>
                {multiSelect && canBatch && (
                  <CheckBox
                    checked={isSelected}
                    onPress={() => handleSelect(item._id)}
                    containerStyle={styles.checkbox}
                  />
                )}
                {!isMe && showAvatar && <Image source={{ uri: user.avatar }} style={styles.avatar} />}
                <Pressable
                  onLongPress={() => multiSelect ? handleSelect(item._id) : handleLongPress(item)}
                  onPress={() => multiSelect ? handleSelect(item._id) : undefined}
                  android_ripple={{ color: '#e0e0e0' }}
                  style={{ flex: 1 }}
                >
                  <View style={[styles.msgBubble, isMe ? styles.myMsg : styles.peerMsg]}>
                    {showAvatar && <Text style={styles.msgSender}>{user.name}</Text>}
                    {/* 回覆區塊 */}
                    {replyContent && (
                      <View style={styles.replyBlock}>
                        {replyContent.deleted ? (
                          <Text style={styles.replyDeleted}>（訊息已被刪除）</Text>
                        ) : replyContent.type === 'text' ? (
                          <Text style={styles.replyText}>{replyContent.text}</Text>
                        ) : replyContent.type === 'image' && replyContent.imageUri ? (
                          <Image source={{ uri: replyContent.imageUri }} style={styles.replyImg} />
                        ) : null}
                      </View>
                    )}
                    {item.type === 'text' && item.text && (
                      <Text style={styles.msgText}>{renderTextWithMention(item.text)}</Text>
                    )}
                    {item.type === 'image' && item.imageUri && (
                      <TouchableOpacity onPress={() => setPreviewImage(item.imageUri)} activeOpacity={0.85}>
                        <Image source={{ uri: item.imageUri }} style={styles.msgImage} resizeMode="cover" />
                      </TouchableOpacity>
                    )}
                    {archivedBadge}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <Text style={styles.msgTime}>{formatTime(item.createdAt)}</Text>
                      {item.edited && <Text style={styles.editedMark}>(已編輯)</Text>}
                      {isMe && item.type !== 'system' && (
                        <Text style={[styles.readMark, { color: isRead ? '#43a047' : '#aaa' }]}>{isRead ? '已讀' : '未讀'}</Text>
                      )}
                    </View>
                  </View>
                </Pressable>
                {isMe && showAvatar && <Image source={{ uri: user.avatar }} style={styles.avatar} />}
              </View>
              {/* Reaction Bar */}
              <View style={styles.reactionBar}>
                {Object.entries(reactions[item._id] || {}).map(([emoji, users]) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.reactionBtn, users.includes(userId) && styles.reactionBtnActive]}
                    onPress={() => users.includes(userId) ? handleRemoveReaction(item._id, emoji) : handleAddReaction(item._id, emoji)}
                  >
                    <Text style={{ fontSize: 18 }}>{emoji} {users.length > 1 ? users.length : ''}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => setReactionPickerMsgId(item._id)} style={styles.reactionAddBtn}>
                  <Text style={{ fontSize: 18, color: '#888' }}>+</Text>
                </TouchableOpacity>
              </View>
              {/* Reaction Picker Modal */}
              {reactionPickerMsgId === item._id && (
                <Modal visible transparent animationType="fade" onRequestClose={() => setReactionPickerMsgId(null)}>
                  <TouchableWithoutFeedback onPress={() => setReactionPickerMsgId(null)}>
                    <View style={styles.emojiOverlay}>
                      <View style={styles.emojiPanel}>
                        <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>回應表情</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', maxHeight: 220 }}>
                          {emojiAll.slice(0, 30).map(e => (
                            <TouchableOpacity key={e} onPress={() => handleAddReaction(item._id, e)} style={styles.emojiBtn}>
                              <Text style={{ fontSize: 28 }}>{e}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </View>
                  </TouchableWithoutFeedback>
                </Modal>
              )}
            </>
          ));
        }}
        contentContainerStyle={{ padding: 16, flexGrow: 1, justifyContent: messages.length === 0 ? 'center' : 'flex-start' }}
        style={{ flex: 1, backgroundColor: theme.background }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Image source={{ uri: 'https://cdn-icons-png.flaticon.com/512/4076/4076549.png' }} style={styles.emptyImg} />
            <Text style={{ color: '#888', marginTop: 12 }}>尚無訊息，快來發送第一則訊息吧！</Text>
          </View>
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.1}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListHeaderComponent={loading && hasMore ? <ActivityIndicator style={{ marginBottom: 12 }} /> : null}
        ListFooterComponent={!hasMore && messages.length > 0 ? <Text style={{ textAlign: 'center', color: '#aaa', margin: 12 }}>沒有更多訊息</Text> : null}
      />
      {/* 多選操作列（權限） */}
      {multiSelect && canBatch && (
        <View style={styles.multiBar}>
          <Text style={{ marginRight: 12 }}>已選 {selectedIds.length} 則</Text>
          <TouchableOpacity onPress={handleSelectAll} style={styles.multiBtn}>
            <Text>{selectedIds.length === messages.length ? '取消全選' : '全選'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBatchTag.bind(null, 'add')} style={[styles.multiBtn, { backgroundColor: '#43a047' }]}>
            <Text style={{ color: '#fff' }}>批次標籤</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBatchTag.bind(null, 'remove')} style={[styles.multiBtn, { backgroundColor: '#1976d2' }]}>
            <Text style={{ color: '#fff' }}>批次移除標籤</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBatchDelete} style={[styles.multiBtn, { backgroundColor: '#e53935' }]}>
            <Text style={{ color: '#fff' }}>批次刪除</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBatchArchive.bind(null, 'archive')} style={[styles.multiBtn, { backgroundColor: '#888' }]}>
            <Text style={{ color: '#fff' }}>批次歸檔</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBatchArchive.bind(null, 'unarchive')} style={[styles.multiBtn, { backgroundColor: '#bdbdbd' }]}>
            <Text style={{ color: '#fff' }}>批次取消歸檔</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={exitMultiSelect} style={styles.multiBtn}>
            <Text>取消</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* @提及用戶選單 */}
      {mentionListVisible && (
        <View style={styles.mentionListWrap}>
          <RNFlatList
            data={userList.filter(u => u.name.includes(mentionQuery))}
            keyExtractor={u => u.userId}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => handleMentionSelect(item)} style={styles.mentionItem}>
                <Text style={styles.mentionName}>@{item.name}</Text>
              </TouchableOpacity>
            )}
            style={{ maxHeight: 180, backgroundColor: '#fff', borderRadius: 8, elevation: 4, margin: 8 }}
          />
        </View>
      )}
      {/* 輸入欄上方顯示回覆區塊 */}
      {replyMsg && (
        <View style={styles.replyBar}>
          <Text style={styles.replyLabel}>回覆：</Text>
          {replyMsg.deleted ? (
            <Text style={styles.replyDeleted}>（訊息已被刪除）</Text>
          ) : replyMsg.type === 'text' ? (
            <Text style={styles.replyText}>{replyMsg.text}</Text>
          ) : replyMsg.type === 'image' && replyMsg.imageUri ? (
            <Image source={{ uri: replyMsg.imageUri }} style={styles.replyImg} />
          ) : null}
          <TouchableOpacity onPress={() => setReplyMsg(null)} style={{ marginLeft: 8 }}>
            <Text style={{ color: '#e53935', fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.inputBar}>
        <TouchableOpacity onPress={() => setEmojiVisible(true)} style={styles.imgBtn} disabled={sending}>
          <Text style={{ fontSize: 22 }}>😀</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setStickerVisible(true)} style={styles.imgBtn} disabled={sending}>
          <Text style={{ fontSize: 22 }}>🖼️</Text>
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          value={input}
          onChangeText={handleInputChange}
          placeholder="輸入訊息..."
          style={styles.input}
          placeholderTextColor="#aaa"
          editable={!sending}
        />
        <TouchableOpacity onPress={handleSend} style={styles.sendBtn} disabled={sending}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>發送</Text>}
        </TouchableOpacity>
      </View>
      {!!sendError && (
        <View style={styles.errorBar}>
          <Text style={{ color: '#fff' }}>{sendError}</Text>
          <TouchableOpacity onPress={() => setSendError('')} style={{ marginLeft: 12 }}>
            <Text style={{ color: '#fff', textDecorationLine: 'underline' }}>關閉</Text>
          </TouchableOpacity>
        </View>
      )}
      <CallModal
        visible={callVisible}
        onClose={() => setCallVisible(false)}
        userId={userId}
        peerId={peerId}
        groupId={groupId}
        token={token}
        isCaller={true}
        peerName={userMap[peerId]?.name || peerId}
        peerAvatar={userMap[peerId]?.avatar || ''}
      />
      {/* 圖片預覽 Modal */}
      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <TouchableWithoutFeedback onPress={() => setPreviewImage(null)}>
          <View style={styles.previewOverlay}>
            {previewImage && (
              <Image source={{ uri: previewImage }} style={styles.previewImg} resizeMode="contain" />
            )}
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* 編輯訊息 Modal */}
      <Modal visible={!!editMsgId} transparent animationType="fade" onRequestClose={() => setEditMsgId(null)}>
        <TouchableWithoutFeedback onPress={() => setEditMsgId(null)}>
          <View style={styles.editOverlay}>
            <View style={styles.editModal}>
              <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 12 }}>編輯訊息</Text>
              <TextInput
                value={editInput}
                onChangeText={setEditInput}
                style={styles.editInput}
                autoFocus
                placeholder="請輸入新內容"
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
                <TouchableOpacity onPress={() => setEditMsgId(null)} style={[styles.sendBtn, { backgroundColor: '#aaa', marginRight: 12 }]}><Text style={{ color: '#fff' }}>取消</Text></TouchableOpacity>
                <TouchableOpacity onPress={handleEdit} style={styles.sendBtn}><Text style={{ color: '#fff' }}>儲存</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* 標籤選擇 Modal */}
      <Modal visible={tagModalVisible} transparent animationType="fade" onRequestClose={() => setTagModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setTagModalVisible(false)}>
          <View style={styles.editOverlay}>
            <View style={styles.editModal}>
              <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 12 }}>{tagModalType === 'add' ? '批次標籤' : '批次移除標籤'}</Text>
              <TextInput
                value={tagInput}
                onChangeText={setTagInput}
                style={styles.editInput}
                placeholder="請輸入標籤名稱"
                autoFocus
              />
              {tagSuggest.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  {tagSuggest.map(name => {
                    const color = allTags.find(t => t.name === name)?.color || '#888';
                    return (
                      <TouchableOpacity key={name} onPress={() => setTagInput(name)} style={{ flexDirection: 'row', alignItems: 'center', padding: 6 }}>
                        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color, marginRight: 8 }} />
                        <Text style={{ color }}>{name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
                <TouchableOpacity onPress={() => setTagModalVisible(false)} style={[styles.sendBtn, { backgroundColor: '#aaa', marginRight: 12 }]}><Text style={{ color: '#fff' }}>取消</Text></TouchableOpacity>
                <TouchableOpacity onPress={submitTagModal} style={styles.sendBtn}><Text style={{ color: '#fff' }}>確定</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* 歸檔確認 Modal */}
      <Modal visible={archiveModalVisible} transparent animationType="fade" onRequestClose={() => setArchiveModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setArchiveModalVisible(false)}>
          <View style={styles.editOverlay}>
            <View style={styles.editModal}>
              <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 12 }}>{archiveType === 'archive' ? '批次歸檔' : '批次取消歸檔'}</Text>
              <Text style={{ marginBottom: 16 }}>確定要{archiveType === 'archive' ? '歸檔' : '取消歸檔'}選取的 {selectedIds.length} 則訊息嗎？</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <TouchableOpacity onPress={() => setArchiveModalVisible(false)} style={[styles.sendBtn, { backgroundColor: '#aaa', marginRight: 12 }]}><Text style={{ color: '#fff' }}>取消</Text></TouchableOpacity>
                <TouchableOpacity onPress={submitArchiveModal} style={styles.sendBtn}><Text style={{ color: '#fff' }}>確定</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* Emoji 選單 */}
      <Modal visible={emojiVisible} transparent animationType="fade" onRequestClose={() => setEmojiVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setEmojiVisible(false)}>
          <View style={[styles.emojiOverlay, { backgroundColor: 'rgba(0,0,0,0.2)' }] }>
            <View style={[styles.emojiPanel, { backgroundColor: theme.emojiPanel }] }>
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8 }}>
                <TouchableOpacity onPress={() => setEmojiTab('recent')} style={[styles.emojiTab, emojiTab === 'recent' && styles.emojiTabActive]}><Text>最近</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setEmojiTab('all')} style={[styles.emojiTab, emojiTab === 'all' && styles.emojiTabActive]}><Text>全部</Text></TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', maxHeight: 220 }}>
                {(emojiTab === 'recent' ? recentEmoji : emojiAll).map(e => (
                  <TouchableOpacity key={e} onPress={() => handleEmojiSelect(e)} style={styles.emojiBtn}>
                    <Text style={{ fontSize: 28 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
                {emojiTab === 'recent' && recentEmoji.length === 0 && <Text style={{ color: '#888', marginTop: 24 }}>尚無最近使用</Text>}
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* 貼圖選單 */}
      <Modal visible={stickerVisible} transparent animationType="fade" onRequestClose={() => setStickerVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setStickerVisible(false)}>
          <View style={[styles.emojiOverlay, { backgroundColor: 'rgba(0,0,0,0.2)' }] }>
            <View style={[styles.emojiPanel, { backgroundColor: theme.emojiPanel }] }>
              <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>貼圖</Text>
              <FlatList
                data={stickers}
                numColumns={4}
                keyExtractor={(_, i) => i.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => handleStickerSend(item.uri)} style={styles.stickerBtn}>
                    <Image source={{ uri: item.uri }} style={styles.stickerImg} />
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#1976d2' },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  callBtn: { backgroundColor: '#43a047', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 16 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  avatar: { width: 36, height: 36, borderRadius: 18, marginHorizontal: 6, backgroundColor: '#eee' },
  msgBubble: { borderRadius: 14, padding: 12, maxWidth: '75%', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  myMsg: { backgroundColor: '#e3f2fd', alignSelf: 'flex-end' },
  peerMsg: { backgroundColor: '#f1f8e9', alignSelf: 'flex-start' },
  msgSender: { fontSize: 12, color: '#888', marginBottom: 2 },
  msgText: { fontSize: 16, color: '#222' },
  msgImage: { width: 160, height: 120, borderRadius: 10, marginVertical: 6, backgroundColor: '#eee' },
  msgTime: { fontSize: 10, color: '#aaa', alignSelf: 'flex-end', marginTop: 4 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 8, borderTopWidth: 1, borderColor: '#eee', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: -1 }, elevation: 1 },
  imgBtn: { backgroundColor: '#f1f8e9', borderRadius: 20, padding: 8, marginRight: 6, borderWidth: 1, borderColor: '#c8e6c9' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 20, padding: 10, marginRight: 8, backgroundColor: '#f9f9f9', fontSize: 16 },
  sendBtn: { backgroundColor: '#1976d2', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 20 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyImg: { width: 80, height: 80, opacity: 0.5 },
  errorBar: { position: 'absolute', bottom: 70, left: 0, right: 0, backgroundColor: '#e53935', padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: 8, marginHorizontal: 24 },
  previewOverlay: { flex: 1, backgroundColor: '#000c', justifyContent: 'center', alignItems: 'center' },
  previewImg: { width: '90%', height: '70%', borderRadius: 12, backgroundColor: '#222' },
  sysMsgWrap: { alignItems: 'center', marginVertical: 8 },
  sysMsgText: { backgroundColor: '#eee', color: '#888', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12, fontSize: 13 },
  readMark: { fontSize: 11, marginLeft: 6 },
  deletedMsg: { backgroundColor: '#eee', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  deletedText: { color: '#aaa', fontSize: 13, fontStyle: 'italic' },
  editedMark: { fontSize: 11, color: '#888', marginLeft: 4 },
  editOverlay: { flex: 1, backgroundColor: '#0007', justifyContent: 'center', alignItems: 'center' },
  editModal: { backgroundColor: '#fff', borderRadius: 12, padding: 24, minWidth: 260 },
  editInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#f9f9f9' },
  replyBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f8e9', padding: 8, borderTopWidth: 1, borderColor: '#c8e6c9' },
  replyLabel: { color: '#43a047', fontWeight: 'bold', marginRight: 6 },
  replyBlock: { backgroundColor: '#f5f5f5', borderLeftWidth: 3, borderLeftColor: '#43a047', padding: 6, marginBottom: 6, borderRadius: 6 },
  replyText: { color: '#1976d2', fontSize: 13 },
  replyImg: { width: 60, height: 45, borderRadius: 6, backgroundColor: '#eee' },
  replyDeleted: { color: '#aaa', fontSize: 12, fontStyle: 'italic' },
  mention: { color: '#1976d2', fontWeight: 'bold' },
  mentionListWrap: { position: 'absolute', left: 0, right: 0, bottom: 64, zIndex: 20 },
  mentionItem: { padding: 12, borderBottomWidth: 1, borderColor: '#eee' },
  mentionName: { color: '#1976d2', fontWeight: 'bold', fontSize: 16 },
  checkbox: { padding: 0, margin: 0, marginRight: 4, backgroundColor: 'transparent', borderWidth: 0 },
  multiBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', padding: 10, backgroundColor: '#f5f5f5', borderTopWidth: 1, borderColor: '#eee' },
  multiBtn: { backgroundColor: '#eee', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 14, marginLeft: 8 },
  tagBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4, fontSize: 11, color: '#fff', overflow: 'hidden' },
  archivedBadge: { backgroundColor: '#bdbdbd', color: '#fff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, fontSize: 11, alignSelf: 'flex-start', marginBottom: 4 },
  archivedRow: { opacity: 0.5 },
  socketStatusBar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#1976d2', padding: 10, alignItems: 'center', zIndex: 99 },
  dateDivider: { alignItems: 'center', marginVertical: 10 },
  dateDividerText: { backgroundColor: '#eee', color: '#888', paddingHorizontal: 16, paddingVertical: 4, borderRadius: 12, fontSize: 13 },
  emojiOverlay: { flex: 1, backgroundColor: '#0007', justifyContent: 'center', alignItems: 'center' },
  emojiPanel: { borderRadius: 16, padding: 12, minWidth: 280, alignSelf: 'center', marginTop: 120 },
  emojiBtn: { padding: 10, margin: 4, borderRadius: 8 },
  stickerBtn: { padding: 8, margin: 6, borderRadius: 8, backgroundColor: '#f5f5f5' },
  stickerImg: { width: 64, height: 64, borderRadius: 8 },
  emojiTab: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8, backgroundColor: '#eee', marginHorizontal: 4 },
  emojiTabActive: { backgroundColor: '#1976d2', color: '#fff' },
  stickerMsgRow: { alignItems: 'center', marginVertical: 6 },
  stickerMsgImg: { width: 120, height: 120, borderRadius: 12, backgroundColor: '#eee' },
  reactionBar: { flexDirection: 'row', alignItems: 'center', marginLeft: 12, marginBottom: 2 },
  reactionBtn: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: '#eee', marginRight: 4 },
  reactionBtnActive: { backgroundColor: '#ffd966' },
  reactionAddBtn: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: '#f5f5f5' },
}); 