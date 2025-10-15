import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../ThemeContext';

const themeColors = [
  { name: '藍色', value: '#1976d2' },
  { name: '綠色', value: '#43a047' },
  { name: '紅色', value: '#e53935' },
  { name: '橘色', value: '#fb8c00' },
  { name: '企業色', value: '#6a1b9a' },
];

export default function SettingsScreen() {
  const { theme, mode, setMode, primary, setPrimary } = useTheme();
  // 這裡假設 setPrimaryColor 之後會實作
  // const [primary, setPrimary] = React.useState(theme.primary); // This line is removed

  return (
    <View style={[styles.container, { backgroundColor: theme.background }] }>
      <Text style={[styles.title, { color: theme.text }]}>主題模式</Text>
      <View style={styles.row}>
        {['light', 'dark', 'system'].map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.modeBtn, mode === opt && { backgroundColor: theme.primary }]}
            onPress={() => setMode(opt as any)}
          >
            <Text style={{ color: mode === opt ? '#fff' : theme.text }}>{opt === 'light' ? '淺色' : opt === 'dark' ? '深色' : '跟隨系統'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.title, { color: theme.text, marginTop: 32 }]}>主題色</Text>
      <View style={styles.row}>
        {themeColors.map(c => (
          <TouchableOpacity
            key={c.value}
            style={[styles.colorBtn, { backgroundColor: c.value, borderWidth: primary === c.value ? 3 : 0, borderColor: theme.primary }]}
            onPress={() => setPrimary(c.value)}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ color: theme.text, marginTop: 32, fontSize: 12 }}>主題色切換已全 app 生效。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  modeBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8, backgroundColor: '#eee', marginRight: 12 },
  colorBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 8, marginRight: 12, minWidth: 60, alignItems: 'center' },
}); 