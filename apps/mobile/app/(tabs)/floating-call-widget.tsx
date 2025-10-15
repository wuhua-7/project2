import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder, Image, Platform } from 'react-native';

export type FloatingCallWidgetProps = {
  visible: boolean;
  onRestore: () => void;
  onMute: () => void;
  onEnd: () => void;
  isMuted: boolean;
  participants: { avatar: string; id: string; isHost?: boolean }[];
  status: string;
  quality?: { good: boolean; rtt: number; packetsLost: number };
  speakingIds?: string[];
  duration?: number;
  type?: 'audio' | 'video';
};

export default function FloatingCallWidget({ visible, onRestore, onMute, onEnd, isMuted, participants, status, quality, speakingIds = [], duration = 0, type = 'audio' }: FloatingCallWidgetProps) {
  const pan = useRef(new Animated.ValueXY({ x: 20, y: 100 })).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  // 進出場動畫
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 0.9, useNativeDriver: true })
      ]).start();
    }
  }, [visible]);
  // 拖曳
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([
        null,
        { dx: pan.x, dy: pan.y },
      ], { useNativeDriver: false }),
      onPanResponderRelease: () => {},
    })
  ).current;
  if (!visible) return null;
  // 時長格式化
  const formatDuration = (sec: number) => `${Math.floor(sec/60)}:${(sec%60).toString().padStart(2,'0')}`;
  // iOS 風格品質條顏色
  const qualityColor = quality ? (quality.good ? '#34c759' : '#ff3b30') : '#bdbdbd';
  return (
    <Animated.View style={[styles.widget, pan.getLayout(), { transform: [{ scale: scaleAnim }], opacity: opacityAnim, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, backgroundColor: Platform.OS === 'ios' ? '#fff9' : '#222c', borderWidth: Platform.OS === 'ios' ? 0.5 : 0, borderColor: '#eee' }]} {...panResponder.panHandlers}>
      <TouchableOpacity style={styles.inner} activeOpacity={0.8} onPress={onRestore}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
          {participants.slice(0, 2).map((p, i) => (
            <View key={i} style={[styles.avatarWrap, speakingIds.includes(p.id) && styles.speakingWrap]}> 
              <Image source={{ uri: p.avatar }} style={styles.avatar} />
              {p.isHost && <Text style={styles.hostBadge}>主持人</Text>}
            </View>
          ))}
          {participants.length > 2 && <Text style={styles.more}>+{participants.length - 2}</Text>}
          {type === 'video' && <Text style={styles.typeIcon}>🎥</Text>}
        </View>
        <View style={styles.qualityRow}>
          <Animated.View style={[styles.qualityBar, { backgroundColor: qualityColor, width: quality ? (quality.good ? 60 : 36) : 36 }]} />
          <Text style={[styles.qualityText, { color: qualityColor }]}>{quality ? (quality.good ? '良好' : '不佳') : '品質'}</Text>
          <Text style={styles.duration}>{formatDuration(duration)}</Text>
        </View>
        <Text style={styles.status}>{status}</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity onPress={onMute} style={[styles.btn, isMuted && styles.btnActive]}>
            <Text style={{ color: '#222' }}>{isMuted ? '取消靜音' : '靜音'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onEnd} style={[styles.btn, styles.endBtn]}>
            <Text style={{ color: '#fff' }}>掛斷</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  widget: { position: 'absolute', zIndex: 9999, width: 200, height: 110, borderRadius: 22, overflow: 'hidden' },
  inner: { flex: 1, padding: 12, justifyContent: 'center' },
  avatarWrap: { marginRight: 4, borderRadius: 20, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6 },
  speakingWrap: { borderColor: '#34c759', shadowOpacity: 0.18, shadowRadius: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eee' },
  more: { color: '#888', fontWeight: 'bold', marginLeft: 4 },
  hostBadge: { backgroundColor: '#ffd700', color: '#222', fontWeight: 'bold', fontSize: 10, borderRadius: 6, paddingHorizontal: 4, position: 'absolute', bottom: -10, left: 0 },
  typeIcon: { fontSize: 18, marginLeft: 4 },
  qualityRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  qualityBar: { height: 8, borderRadius: 4, marginRight: 6 },
  qualityText: { fontSize: 12, marginRight: 8, fontWeight: '500' },
  duration: { fontSize: 12, color: '#888', marginLeft: 'auto', fontWeight: '500' },
  status: { color: '#888', fontSize: 13, marginTop: 2 },
  btnRow: { flexDirection: 'row', marginTop: 8 },
  btn: { backgroundColor: '#f2f2f7', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 12, marginRight: 8 },
  btnActive: { backgroundColor: '#bdbdbd' },
  endBtn: { backgroundColor: '#ff3b30' },
}); 