import React, { useEffect, useRef, useState } from 'react';

import { View, Text, Modal, TouchableOpacity, StyleSheet, Alert, Image, Platform, Animated } from 'react-native';
import { RTCPeerConnection, mediaDevices, RTCView } from 'expo-webrtc';
import { Audio } from 'expo-av';
import io, { Socket } from 'socket.io-client';
import { useTheme } from '../../ThemeContext';
import FloatingCallWidget from './floating-call-widget';

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // { urls: 'turn:your.turn.server:3478', username: 'user', credential: 'pass' }
  ]
};

type CallModalProps = {
  visible: boolean;
  onClose: () => void;
  userId: string;
  peerId: string;
  groupId: string;
  token: string;
  isCaller: boolean;
  peerName: string;
  peerAvatar: string;
  // 新增可選 isVideo
  isVideo?: boolean;
};

export default function CallModal({
  visible,
  onClose,
  userId,
  peerId,
  groupId,
  token,
  isCaller,
  peerName,
  peerAvatar,
  isVideo: isVideoProp = false,
}: CallModalProps) {
  const [status, setStatus] = useState<'calling' | 'incoming' | 'accepted' | 'rejected' | 'ended'>(isCaller ? 'calling' : 'incoming');
  const [peer, setPeer] = useState<RTCPeerConnection | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordedUri, setRecordedUri] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const [minimized, setMinimized] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [callStart, setCallStart] = useState<number | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [isVideo, setIsVideo] = useState(isVideoProp);
  const [videoDeviceId, setVideoDeviceId] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<any[]>([]);
  const { theme } = useTheme();
  const [quality, setQuality] = useState({ rtt: 0, packetsLost: 0, bitrate: 0, good: true });
  const qualityTimer = useRef<NodeJS.Timeout | null>(null);
  // 本地/遠端說話高亮
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);

  // 淡入淡出動畫
  useEffect(() => {
    if (visible && !minimized) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, minimized]);

  useEffect(() => {
    if (!visible) return;
    const socket = io('http://localhost:3001', { transports: ['websocket'], auth: { token } });
    socketRef.current = socket;

    // WebRTC 訊號
    socket.on('call:signal', async ({ from, to, groupId: gid, data }: any) => {
      if (!peer) return;
      if (data.sdp) {
        if (data.type === 'offer') {
          await peer.setRemoteDescription(new window.RTCSessionDescription(data));
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit('call:signal', { from: userId, to: from, groupId: gid, data: peer.localDescription });
        } else if (data.type === 'answer') {
          await peer.setRemoteDescription(new window.RTCSessionDescription(data));
        }
      } else if (data.candidate) {
        await peer.addIceCandidate(new window.RTCIceCandidate(data));
      }
    });

    // 來電
    socket.on('call:incoming', ({ from, peerName, peerAvatar, isVideo }: any) => {
      setStatus('incoming');
      // 可根據 from/peerName/peerAvatar 更新 UI
    });
    // 對方接聽
    socket.on('call:accept', () => {
      setStatus('accepted');
    });
    // 對方拒接
    socket.on('call:reject', () => {
      setStatus('rejected');
      setTimeout(onClose, 1200);
    });
    // 對方掛斷
    socket.on('call:end', () => {
      setStatus('ended');
      setTimeout(onClose, 1200);
    });
    // 忙線
    socket.on('call:busy', () => {
      setStatus('ended');
      Alert.alert('對方忙線中');
      setTimeout(onClose, 1200);
    });

    return () => { socket.disconnect(); };
  }, [visible, peer, token, userId]);

  // 取得可用攝影機
  useEffect(() => {
    if (!isVideo || !visible) return;
    (async () => {
      const devices = await mediaDevices.enumerateDevices();
      const videos = devices.filter((d: MediaDeviceInfo) => d.kind === 'videoinput');
      setVideoDevices(videos);
      if (!videoDeviceId && videos.length > 0) setVideoDeviceId(videos[0].deviceId);
    })();
  }, [isVideo, visible]);

  useEffect(() => {
    if (!visible) return;
    let pc: RTCPeerConnection;
    let mounted = true;
    (async () => {
      pc = new RTCPeerConnection(rtcConfig);
      setPeer(pc);
      // 根據 isVideo 取得 audio/video
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? (videoDeviceId ? { deviceId: videoDeviceId } : true) : false,
      });
      setLocalStream(stream);
      stream.getTracks().forEach((track: MediaStreamTrack) => pc.addTrack(track, stream));
      pc.ontrack = (e: any) => {
        if (!e.streams || !e.streams[0]) return;
        setRemoteStream(e.streams[0]);
      };
      pc.onicecandidate = (e: any) => {
        if (e.candidate && socketRef.current) {
          socketRef.current.emit('call:signal', { from: userId, to: peerId, groupId, data: e.candidate });
        }
      };
      if (isCaller && socketRef.current) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current.emit('call:signal', { from: userId, to: peerId, groupId, data: offer });
      }
    })();
    return () => {
      if (pc) pc.close();
      if (localStream) {
        localStream.getTracks().forEach((track: any) => track.stop());
      }
      setPeer(null);
      setLocalStream(null);
      setRemoteStream(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isVideo, videoDeviceId]);

  useEffect(() => {
    if (status === 'accepted') {
      setCallStart(Date.now());
      timerRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - (callStart || Date.now())) / 1000));
      }, 1000);
    } else {
      setCallDuration(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status, callStart]);

  useEffect(() => {
    if (status !== 'accepted' || !peer) {
      setQuality({ rtt: 0, packetsLost: 0, bitrate: 0, good: true });
      if (qualityTimer.current) clearInterval(qualityTimer.current);
      return;
    }
    qualityTimer.current = setInterval(async () => {
      const stats = await peer.getStats();
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
      setQuality({ rtt, packetsLost, bitrate, good });
    }, 2000);
    return () => { if (qualityTimer.current) clearInterval(qualityTimer.current); };
  }, [status, peer]);

  // 本地/遠端說話高亮
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
        setSpeakingIds(prev => {
          const arr = [...prev];
          if (rms > 10 && !arr.includes(userId)) arr.push(userId);
          if (rms <= 10 && arr.includes(userId)) return arr.filter(id => id !== userId);
          return arr;
        });
      };
      const timer = setInterval(checkSpeaking, 500);
      timers.push(timer);
    }
    // 遠端
    if (remoteStream) {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(remoteStream);
        source.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const checkSpeaking = () => {
          analyser.getByteTimeDomainData(data);
          const rms = Math.sqrt(data.reduce((sum, v) => sum + Math.pow(v - 128, 2), 0) / data.length);
          setSpeakingIds(prev => {
            const arr = [...prev];
            if (rms > 10 && !arr.includes(peerId)) arr.push(peerId);
            if (rms <= 10 && arr.includes(peerId)) return arr.filter(id => id !== peerId);
            return arr;
          });
        };
        const timer = setInterval(checkSpeaking, 500);
        timers.push(timer);
      } catch {}
    }
    return () => { timers.forEach(clearInterval); };
  }, [visible, localStream, remoteStream]);

  // 狀態操作時同步 emit
  const handleAccept = () => {
    setStatus('accepted');
    socketRef.current?.emit('call:accept', { from: userId, to: peerId, groupId });
  };
  const handleReject = () => {
    setStatus('rejected');
    socketRef.current?.emit('call:reject', { from: userId, to: peerId, groupId });
    onClose();
  };
  const handleEnd = () => {
    setStatus('ended');
    socketRef.current?.emit('call:end', { from: userId, to: peerId, groupId });
    onClose();
  };
  const toggleMute = () => {
    if (localStream) {
      const enabled = !isMuted;
      const tracks = localStream.getAudioTracks();
      if (tracks.length > 0) tracks[0].enabled = !enabled;
      setIsMuted(enabled);
    }
  };
  const startRecording = async () => {
    try {
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
      setIsRecording(true);
    } catch (e: any) { Alert.alert('錄音失敗', e.message); }
  };
  const stopRecording = async () => {
    if (!recording) return;
    await recording.stopAndUnloadAsync();
    setIsRecording(false);
    setRecordedUri(recording.getURI() || '');
  };

  // 切換鏡頭
  const handleSwitchCamera = async () => {
    if (!isVideo || videoDevices.length < 2) return;
    const idx = videoDevices.findIndex((d: MediaDeviceInfo) => d.deviceId === videoDeviceId);
    const next = videoDevices[(idx + 1) % videoDevices.length];
    setVideoDeviceId(next.deviceId);
    // 重新取得 stream 並 replaceTrack
    const newStream = await mediaDevices.getUserMedia({ audio: true, video: { deviceId: next.deviceId } });
    setLocalStream(newStream);
    if (peer && localStream) {
      const senders = peer.getSenders().filter(s => s.track && s.track.kind === 'video');
      const newTrack = newStream.getVideoTracks()[0];
      if (senders.length && newTrack) senders[0].replaceTrack(newTrack);
    }
  };

  // 通話時長格式化
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // 切換語音/視訊
  const handleToggleVideo = () => setIsVideo(v => !v);

  // 懸浮窗 props
  const widgetProps = {
    visible: minimized,
    onRestore: () => setMinimized(false),
    onMute: toggleMute,
    onEnd: handleEnd,
    isMuted,
    participants: [
      { avatar: peerAvatar, id: peerId, isHost: false },
      { avatar: '', id: userId, isHost: true }
    ],
    status: status === 'accepted' ? '語音通話中' : status === 'calling' ? '撥號中' : status === 'incoming' ? '來電' : '已結束',
    quality,
    speakingIds,
    duration: callDuration,
    type: (isVideo ? 'video' : 'audio') as 'audio' | 'video',
  };

  return (
    <>
      <FloatingCallWidget {...widgetProps} />
      <Animated.View style={{ opacity: fadeAnim, display: minimized ? 'none' : 'flex' }} pointerEvents={minimized ? 'none' : 'auto'}>
        <Modal visible={visible && !minimized} transparent animationType="none" onRequestClose={onClose}>
          <View style={styles.overlay}>
            <View style={styles.modal}>
              {/* 對方頭像與暱稱 */}
              <Image source={{ uri: peerAvatar }} style={styles.avatar} />
              <Text style={styles.peerName}>{peerName}</Text>
              {/* 狀態/時長 */}
              <Text style={styles.title}>
                {status === 'calling' ? '正在呼叫對方...' : status === 'incoming' ? '來電' : status === 'accepted' ? (isVideo ? '視訊通話中' : '語音通話中') : status === 'ended' ? '通話結束' : ''}
              </Text>
              {status === 'accepted' && <Text style={styles.duration}>{formatDuration(callDuration)}</Text>}
              {/* 視訊流顯示 */}
              {isVideo && status === 'accepted' && (
                <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                  {localStream && <RTCView streamURL={(localStream as any).toURL()} style={styles.videoView} />}
                  {remoteStream && <RTCView streamURL={(remoteStream as any).toURL()} style={styles.videoView} />}
                </View>
              )}
              {/* 音訊流無需顯示 */}
              {remoteStream && <RTCView streamURL={(remoteStream as any).toURL()} style={{ width: 0, height: 0 }} />}
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 16 }}>
                <TouchableOpacity onPress={toggleMute} style={styles.btn}><Text>{isMuted ? '取消靜音' : '靜音'}</Text></TouchableOpacity>
                {!isRecording ? <TouchableOpacity onPress={startRecording} style={styles.btn}><Text>開始錄音</Text></TouchableOpacity> : <TouchableOpacity onPress={stopRecording} style={styles.btn}><Text>停止錄音</Text></TouchableOpacity>}
                {recordedUri ? <TouchableOpacity onPress={() => {}} style={styles.btn}><Text>下載錄音</Text></TouchableOpacity> : null}
                {/* 切換語音/視訊 */}
                <TouchableOpacity onPress={handleToggleVideo} style={styles.btn}><Text>{isVideo ? '切換語音' : '切換視訊'}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={() => setMinimized(true)}><Text style={{ color: '#fff' }}>最小化</Text></TouchableOpacity>
              </View>
              {isVideo && status === 'accepted' && videoDevices.length > 1 && (
                <TouchableOpacity onPress={handleSwitchCamera} style={styles.switchBtn}>
                  <Text style={{ color: '#fff' }}>切換鏡頭</Text>
                </TouchableOpacity>
              )}
              {status === 'accepted' && (
                <View style={[styles.qualityBar, !quality.good && styles.qualityBarBad]}>
                  <Text style={{ color: quality.good ? '#fff' : '#fff', fontSize: 13 }}>
                    網路品質 {quality.good ? '良好' : '不佳'}｜延遲 {quality.rtt}ms｜丟包 {quality.packetsLost}｜比特率 {quality.bitrate}kbps
                  </Text>
                </View>
              )}
              {/* 狀態按鈕 */}
              {status === 'calling' && <TouchableOpacity onPress={handleEnd} style={styles.endBtn}><Text>掛斷</Text></TouchableOpacity>}
              {status === 'incoming' && (
                <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                  <TouchableOpacity onPress={handleAccept} style={styles.acceptBtn}><Text>接聽</Text></TouchableOpacity>
                  <TouchableOpacity onPress={handleReject} style={styles.endBtn}><Text>拒絕</Text></TouchableOpacity>
                </View>
              )}
              {status === 'accepted' && <TouchableOpacity onPress={handleEnd} style={styles.endBtn}><Text>掛斷</Text></TouchableOpacity>}
              {/* 通話結束提示 */}
              {status === 'ended' && <Text style={styles.endedTip}>通話已結束，時長 {formatDuration(callDuration)}</Text>}
            </View>
          </View>
        </Modal>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0005', justifyContent: 'center', alignItems: 'center' },
  modal: { backgroundColor: '#fff', borderRadius: 16, padding: 28, minWidth: 300, maxWidth: 360, alignItems: 'center', elevation: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 8, backgroundColor: '#eee' },
  peerName: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#1976d2' },
  duration: { fontSize: 16, color: '#888', marginBottom: 8 },
  endedTip: { color: '#e53935', marginTop: 12, fontSize: 15 },
  btn: { backgroundColor: '#1976d2', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 16, marginHorizontal: 8 },
  endBtn: { backgroundColor: '#e53935', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 24, marginTop: 16 },
  acceptBtn: { backgroundColor: '#43a047', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 24, marginTop: 16, marginRight: 12 },
  videoView: { width: 120, height: 160, borderRadius: 12, marginHorizontal: 4, backgroundColor: '#000' },
  switchBtn: { backgroundColor: '#888', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 18, marginBottom: 8, alignSelf: 'center' },
  qualityBar: { backgroundColor: '#43a047', borderRadius: 8, padding: 6, marginBottom: 8, alignSelf: 'center' },
  qualityBarBad: { backgroundColor: '#e53935' },
}); 