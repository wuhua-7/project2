import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, FlatList, Image, Animated } from 'react-native';
import { RTCPeerConnection, mediaDevices, RTCView } from 'expo-webrtc';
import { useTheme } from '../../ThemeContext';
import io, { Socket } from 'socket.io-client';
import FloatingCallWidget from './floating-call-widget';

export type Participant = {
  id: string;
  name: string;
  avatar: string;
  stream: MediaStream | null;
  isMe: boolean;
  isMuted: boolean;
  isVideo: boolean;
  isHost?: boolean;
  quality?: { rtt: number; packetsLost: number; bitrate: number; good: boolean };
  isSpeaking?: boolean;
};

type GroupCallModalProps = {
  visible: boolean;
  onClose: () => void;
  userId: string;
  groupId: string;
  token: string;
  initialParticipants: Participant[];
};

export default function GroupCallModal({ visible, onClose, userId, groupId, token, initialParticipants }: GroupCallModalProps) {
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [peerConnections, setPeerConnections] = useState<{ [peerId: string]: RTCPeerConnection }>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<'idle' | 'joining' | 'in-call' | 'ended'>('joining');
  const [isLocked, setIsLocked] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const { theme } = useTheme();
  const [minimized, setMinimized] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // 初始化 localStream
  useEffect(() => {
    if (!visible) return;
    (async () => {
      const stream = await mediaDevices.getUserMedia({ audio: true, video: true });
      setLocalStream(stream);
    })();
    return () => {
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Socket.IO 多方訊號流
  useEffect(() => {
    if (!visible) return;
    const socket = io('http://localhost:3001', { transports: ['websocket'], auth: { token } });
    socketRef.current = socket;

    // 參與者加入
    socket.on('call:group-join', ({ peerId, name, avatar }: any) => {
      setParticipants(prev => prev.some(p => p.id === peerId) ? prev : [...prev, { id: peerId, name, avatar, stream: null, isMe: false, isMuted: false, isVideo: true }]);
    });
    // 參與者離開
    socket.on('call:group-leave', ({ peerId }: any) => {
      setParticipants(prev => prev.filter(p => p.id !== peerId));
      setPeerConnections(prev => { if (prev[peerId]) prev[peerId].close(); const cp = { ...prev }; delete cp[peerId]; return cp; });
    });
    // 收到 WebRTC 訊號
    socket.on('call:group-signal', async ({ from, data }: any) => {
      if (from === userId) return;
      let pc = peerConnections[from];
      if (!pc) {
        pc = new RTCPeerConnection();
        setPeerConnections(prev => ({ ...prev, [from]: pc }));
        // localStream track 加入
        if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        pc.ontrack = (e: any) => {
          if (!e.streams || !e.streams[0]) return;
          setParticipants(prev => prev.map(p => p.id === from ? { ...p, stream: e.streams[0] } : p));
        };
        pc.onicecandidate = (e: any) => {
          if (e.candidate) socket.emit('call:group-signal', { from: userId, to: from, groupId, data: e.candidate });
        };
      }
      if (data.sdp) {
        if (data.type === 'offer') {
          await pc.setRemoteDescription(new window.RTCSessionDescription(data));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('call:group-signal', { from: userId, to: from, groupId, data: pc.localDescription });
        } else if (data.type === 'answer') {
          await pc.setRemoteDescription(new window.RTCSessionDescription(data));
        }
      } else if (data.candidate) {
        await pc.addIceCandidate(new window.RTCIceCandidate(data));
      }
    });
    // 通話結束
    socket.on('call:group-end', () => {
      setStatus('ended');
      onClose();
    });
    // 主持人控制
    socket.on('call:group-mute', ({ targetId }: any) => {
      setParticipants(prev => prev.map(p => p.id === targetId ? { ...p, isMuted: true } : p));
    });
    socket.on('call:group-kick', ({ targetId }: any) => {
      if (targetId === userId) { setStatus('ended'); onClose(); }
      setParticipants(prev => prev.filter(p => p.id !== targetId));
    });
    socket.on('call:group-lock', ({ locked }: any) => {
      setIsLocked(locked);
    });
    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, localStream, peerConnections]);

  // 動態建立/關閉 PeerConnection
  useEffect(() => {
    if (!visible || !localStream) return;
    participants.forEach(p => {
      if (p.id === userId) return;
      if (!peerConnections[p.id]) {
        const pc = new RTCPeerConnection();
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        pc.ontrack = (e: any) => {
          if (!e.streams || !e.streams[0]) return;
          setParticipants(prev => prev.map(pp => pp.id === p.id ? { ...pp, stream: e.streams[0] } : pp));
        };
        pc.onicecandidate = (e: any) => {
          if (e.candidate && socketRef.current) socketRef.current.emit('call:group-signal', { from: userId, to: p.id, groupId, data: e.candidate });
        };
        setPeerConnections(prev => ({ ...prev, [p.id]: pc }));
        // 發起 offer
        (async () => {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (socketRef.current) socketRef.current.emit('call:group-signal', { from: userId, to: p.id, groupId, data: offer });
        })();
      }
    });
    // 離開時關閉多餘連線
    Object.keys(peerConnections).forEach(pid => {
      if (!participants.some(p => p.id === pid)) {
        peerConnections[pid].close();
        setPeerConnections(prev => { const cp = { ...prev }; delete cp[pid]; return cp; });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, localStream, visible]);

  // 動態偵測誰正在說話
  useEffect(() => {
    if (!visible) return;
    const timers: NodeJS.Timeout[] = [];
    // 本地
    if (localStream) {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(localStream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const checkSpeaking = () => {
        analyser.getByteTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((sum, v) => sum + Math.pow(v - 128, 2), 0) / data.length);
        setParticipants(prev => prev.map(p => p.isMe ? { ...p, isSpeaking: rms > 10 } : p));
      };
      const timer = setInterval(checkSpeaking, 500);
      timers.push(timer);
    }
    // 遠端
    participants.forEach(p => {
      if (p.isMe || !p.stream) return;
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(p.stream);
        source.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const checkSpeaking = () => {
          analyser.getByteTimeDomainData(data);
          const rms = Math.sqrt(data.reduce((sum, v) => sum + Math.pow(v - 128, 2), 0) / data.length);
          setParticipants(prev => prev.map(pp => pp.id === p.id ? { ...pp, isSpeaking: rms > 10 } : pp));
        };
        const timer = setInterval(checkSpeaking, 500);
        timers.push(timer);
      } catch {}
    });
    return () => { timers.forEach(clearInterval); };
  }, [visible, localStream, participants]);

  // 品質監控
  useEffect(() => {
    if (!visible) return;
    const timers: NodeJS.Timeout[] = [];
    Object.entries(peerConnections).forEach(([peerId, pc]) => {
      const timer = setInterval(async () => {
        const stats = await pc.getStats();
        let rtt = 0, packetsLost = 0, bitrate = 0, good = true;
        stats.forEach((report: any) => {
          if (report.type === 'remote-inbound-rtp' && report.kind === 'audio') {
            if (report.roundTripTime) rtt = Math.round(report.roundTripTime * 1000);
            if (report.packetsLost) packetsLost = report.packetsLost;
          }
          if (report.type === 'outbound-rtp' && report.kind === 'audio') {
            if (report.bitrateMean) bitrate = Math.round(report.bitrateMean / 1000);
          }
        });
        good = rtt < 300 && packetsLost < 10;
        setParticipants(prev => prev.map(p => p.id === peerId ? { ...p, quality: { rtt, packetsLost, bitrate, good } } : p));
      }, 2000);
      timers.push(timer);
    });
    return () => { timers.forEach(clearInterval); };
  }, [visible, peerConnections]);

  // Grid 動態排版
  const numColumns = participants.length <= 2 ? 2 : 3;

  // UI: 渲染每個參與者（語音顯示頭像，視訊顯示 RTCView）
  const renderParticipant = ({ item }: { item: Participant }) => (
    <View style={[styles.participantBox, item.isSpeaking && styles.speakingBox]}>
      {item.isVideo && item.stream ? (
        <RTCView streamURL={(item.stream as any).toURL()} style={styles.videoView} />
      ) : (
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
        <Text style={{ color: theme.text }}>{item.name}{item.isMe ? ' (我)' : ''}</Text>
        {item.isHost && <Text style={styles.hostBadge}>主持人</Text>}
      </View>
      {item.isMuted && <Text style={{ color: '#e53935', fontSize: 12 }}>靜音</Text>}
      {item.quality && (
        <View style={[styles.qualityBar, !item.quality.good && styles.qualityBarBad]}>
          <Text style={{ color: '#fff', fontSize: 11 }}>
            {item.quality.good ? '良好' : '不佳'}｜{item.quality.rtt}ms｜丟包{item.quality.packetsLost}
          </Text>
        </View>
      )}
      {/* 主持人控制按鈕 */}
      {participants.find(p => p.id === userId)?.isHost && !item.isMe && (
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          <TouchableOpacity style={styles.ctrlBtn} onPress={() => socketRef.current?.emit('call:group-mute', { targetId: item.id, groupId })}><Text style={{ color: '#fff', fontSize: 12 }}>靜音</Text></TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} onPress={() => socketRef.current?.emit('call:group-kick', { targetId: item.id, groupId })}><Text style={{ color: '#fff', fontSize: 12 }}>踢出</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );

  // 淡入淡出動畫
  useEffect(() => {
    if (visible && !minimized) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, minimized]);

  // 懸浮窗 props
  const widgetProps = {
    visible: minimized,
    onRestore: () => setMinimized(false),
    onMute: () => {},
    onEnd: onClose,
    isMuted: false,
    participants: participants.map(p => ({ avatar: p.avatar })),
    status: status === 'in-call' ? '通話中' : status === 'joining' ? '連線中' : '已結束',
  };

  return (
    <>
      <FloatingCallWidget {...widgetProps} />
      <Animated.View style={{ opacity: fadeAnim, display: minimized ? 'none' : 'flex' }} pointerEvents={minimized ? 'none' : 'auto'}>
        <Modal visible={visible && !minimized} transparent animationType="none" onRequestClose={onClose}>
          <View style={styles.overlay}>
            <View style={styles.modal}>
              <Text style={styles.title}>群組通話</Text>
              <FlatList
                data={participants}
                keyExtractor={item => item.id}
                renderItem={renderParticipant}
                numColumns={numColumns}
                contentContainerStyle={{ alignItems: 'center' }}
                style={{ maxHeight: 340, minWidth: 320 }}
              />
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.btn} onPress={() => setMinimized(true)}><Text style={{ color: '#fff' }}>最小化</Text></TouchableOpacity>
                <TouchableOpacity style={styles.endBtn} onPress={onClose}><Text style={{ color: '#fff' }}>掛斷</Text></TouchableOpacity>
              </View>
              {/* 主持人鎖定房間按鈕 */}
              {participants.find(p => p.id === userId)?.isHost && (
                <TouchableOpacity style={[styles.btn, isLocked && { backgroundColor: '#888' }]} onPress={() => socketRef.current?.emit('call:group-lock', { locked: !isLocked, groupId })}>
                  <Text style={{ color: '#fff' }}>{isLocked ? '已鎖定' : '鎖定房間'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0007', justifyContent: 'center', alignItems: 'center' },
  modal: { backgroundColor: '#fff', borderRadius: 16, padding: 24, minWidth: 340, maxWidth: 400, alignItems: 'center', elevation: 8 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  participantBox: { alignItems: 'center', margin: 10, width: 120 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#eee' },
  videoView: { width: 100, height: 140, borderRadius: 12, backgroundColor: '#000' },
  btnRow: { flexDirection: 'row', marginTop: 18 },
  btn: { backgroundColor: '#1976d2', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18, marginHorizontal: 8 },
  endBtn: { backgroundColor: '#e53935', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24, marginHorizontal: 8 },
  speakingBox: { borderColor: '#1976d2', borderWidth: 2 },
  qualityBar: { backgroundColor: '#43a047', borderRadius: 8, padding: 3, marginTop: 4, alignSelf: 'center' },
  qualityBarBad: { backgroundColor: '#e53935' },
  hostBadge: { backgroundColor: '#ffd700', color: '#222', fontWeight: 'bold', fontSize: 11, borderRadius: 6, paddingHorizontal: 6, marginLeft: 6 },
  ctrlBtn: { backgroundColor: '#1976d2', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8, marginHorizontal: 2 },
}); 