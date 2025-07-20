import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';

const isAdmin = true; // TODO: 串接實際權限

// 假資料
const mockLogs = Array.from({ length: 50 }).map((_, i) => ({
  id: i + 1,
  user: i % 3 === 0 ? 'userA' : i % 3 === 1 ? 'userB' : 'admin',
  action: ['delete', 'edit', 'batch-tag', 'batch-archive'][i % 4],
  target: `msg_${1000 + i}`,
  time: new Date(Date.now() - i * 3600 * 1000).toISOString(),
}));

export default function OperationLogScreen() {
  if (!isAdmin) return <View style={styles.center}><Text>僅管理員可查詢操作日誌</Text></View>;

  const [user, setUser] = useState('');
  const [action, setAction] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // 篩選
  const filtered = mockLogs.filter(log =>
    (!user || log.user.includes(user)) &&
    (!action || log.action.includes(action)) &&
    (!start || log.time >= start) &&
    (!end || log.time <= end)
  );
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  // 導出 CSV
  const handleExport = () => {
    const header = 'user,action,target,time\n';
    const rows = filtered.map(l => `${l.user},${l.action},${l.target},${l.time}`).join('\n');
    const csv = header + rows;
    Alert.alert('CSV 匯出', csv.length > 200 ? csv.slice(0, 200) + '...（已截斷）' : csv);
    // 實際可用 FileSystem/Sharing 實作下載
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.filterBar}>
        <TextInput value={user} onChangeText={setUser} placeholder="操作者 userId" style={styles.input} />
        <TextInput value={action} onChangeText={setAction} placeholder="動作 (如 batch_delete)" style={styles.input} />
        <TextInput value={start} onChangeText={setStart} placeholder="起始日期 yyyy-mm-dd" style={styles.input} />
        <TextInput value={end} onChangeText={setEnd} placeholder="結束日期 yyyy-mm-dd" style={styles.input} />
        <TouchableOpacity onPress={handleExport} style={styles.exportBtn}><Text style={{ color: '#fff' }}>導出 CSV</Text></TouchableOpacity>
      </View>
      <FlatList
        data={paged}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.logRow}>
            <Text style={styles.cell}>{item.user}</Text>
            <Text style={styles.cell}>{item.action}</Text>
            <Text style={styles.cell}>{item.target}</Text>
            <Text style={styles.cell}>{item.time.replace('T', ' ').slice(0, 19)}</Text>
          </View>
        )}
        ListHeaderComponent={
          <View style={[styles.logRow, { backgroundColor: '#f5f5f5' }]}> 
            <Text style={[styles.cell, { fontWeight: 'bold' }]}>操作者</Text>
            <Text style={[styles.cell, { fontWeight: 'bold' }]}>動作</Text>
            <Text style={[styles.cell, { fontWeight: 'bold' }]}>目標ID</Text>
            <Text style={[styles.cell, { fontWeight: 'bold' }]}>時間</Text>
          </View>
        }
      />
      <View style={styles.pageBar}>
        <TouchableOpacity onPress={() => setPage(p => Math.max(1, p - 1))} style={styles.pageBtn}><Text>上一頁</Text></TouchableOpacity>
        <Text style={{ marginHorizontal: 12 }}>{page} / {totalPages}</Text>
        <TouchableOpacity onPress={() => setPage(p => Math.min(totalPages, p + 1))} style={styles.pageBtn}><Text>下一頁</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filterBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', padding: 8, backgroundColor: '#f5f5f5' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 6, marginRight: 8, marginBottom: 8, minWidth: 100 },
  exportBtn: { backgroundColor: '#1976d2', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 16, marginLeft: 8 },
  logRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 8, paddingHorizontal: 4 },
  cell: { flex: 1, fontSize: 13, color: '#333' },
  pageBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#fafafa' },
  pageBtn: { backgroundColor: '#eee', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 16 },
}); 