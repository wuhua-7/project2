import React, { useEffect, useState } from 'react';
const API_URL = 'http://localhost:3001';

export default function OperationLog({ groupId, isAdmin }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState('');
  const [action, setAction] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [skip, setSkip] = useState(0);
  const limit = 50;

  const fetchLogs = async (newSkip = skip) => {
    setLoading(true);
    let url = `${API_URL}/api/group/${groupId}/operation-logs?skip=${newSkip}&limit=${limit}`;
    if (user) url += `&user=${encodeURIComponent(user)}`;
    if (action) url += `&action=${encodeURIComponent(action)}`;
    if (start) url += `&start=${encodeURIComponent(start)}`;
    if (end) url += `&end=${encodeURIComponent(end)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    const data = await res.json();
    setLogs(data.logs || []);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) fetchLogs(0); }, [groupId, user, action, start, end, isAdmin]);

  if (!isAdmin) return <div style={{ color: '#888', margin: 24 }}>僅管理員/群主可查詢操作日誌</div>;

  function logsToCSV(logs) {
    const header = ['時間', '操作者', '動作', '目標ID'];
    const rows = logs.map(log => [
      new Date(log.timestamp).toLocaleString(),
      log.user?.username || log.user,
      log.action,
      (log.targetIds || []).join(' ')
    ]);
    return [header, ...rows].map(r => r.map(x => `"${(x || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>操作日誌查詢</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={user} onChange={e => setUser(e.target.value)} placeholder="操作者 userId" style={{ width: 120 }} />
        <input value={action} onChange={e => setAction(e.target.value)} placeholder="動作 (如 batch_delete)" style={{ width: 120 }} />
        <input type="date" value={start} onChange={e => setStart(e.target.value)} />
        <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
        <button onClick={() => { setSkip(0); fetchLogs(0); }}>查詢</button>
        <button onClick={() => {
          const csv = logsToCSV(logs);
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `operation_logs_${groupId}.csv`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        }}>導出 CSV</button>
      </div>
      <div style={{ marginBottom: 8 }}>
        <button disabled={skip === 0} onClick={() => { const newSkip = Math.max(0, skip - limit); setSkip(newSkip); fetchLogs(newSkip); }}>上一頁</button>
        <span style={{ margin: '0 12px' }}>第 {skip / limit + 1} 頁</span>
        <button disabled={logs.length < limit} onClick={() => { const newSkip = skip + limit; setSkip(newSkip); fetchLogs(newSkip); }}>下一頁</button>
      </div>
      {loading ? <div>載入中...</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ background: '#f5faff' }}>
              <th style={{ padding: 6, border: '1px solid #eee' }}>時間</th>
              <th style={{ padding: 6, border: '1px solid #eee' }}>操作者</th>
              <th style={{ padding: 6, border: '1px solid #eee' }}>動作</th>
              <th style={{ padding: 6, border: '1px solid #eee' }}>目標ID</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log._id}>
                <td style={{ padding: 6, border: '1px solid #eee' }}>{new Date(log.timestamp).toLocaleString()}</td>
                <td style={{ padding: 6, border: '1px solid #eee', color: '#1976d2', fontWeight: 'bold' }}>{log.user?.username || log.user}</td>
                <td style={{ padding: 6, border: '1px solid #eee' }}>{log.action}</td>
                <td style={{ padding: 6, border: '1px solid #eee' }}>{log.targetIds?.join(', ')}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#888', padding: 16 }}>尚無日誌</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
} 