import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';

export default function TagManager({ groupId, token }) {
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [newColor, setNewColor] = useState('#1976d2');
  const [editing, setEditing] = useState(null); // {name, color}
  const [rename, setRename] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchTags = async () => {
    setLoading(true);
    const res = await fetch(`${API_URL}/api/group/${groupId}/tags`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setTags(data.tags || []);
    setLoading(false);
  };
  useEffect(() => { fetchTags(); }, [groupId]);

  const addTag = async () => {
    if (!newTag) return;
    setLoading(true);
    setError('');
    const res = await fetch(`${API_URL}/api/group/${groupId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newTag, color: newColor })
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || '新增失敗');
    setNewTag('');
    setNewColor('#1976d2');
    fetchTags();
    setLoading(false);
  };
  const deleteTag = async (name) => {
    if (!window.confirm(`確定刪除標籤「${name}」？`)) return;
    setLoading(true);
    await fetch(`${API_URL}/api/group/${groupId}/tags/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchTags();
    setLoading(false);
  };
  const startEdit = (tag) => {
    setEditing(tag);
    setRename(tag.name);
  };
  const saveRename = async (oldName) => {
    if (!rename || rename === oldName) { setEditing(null); return; }
    setLoading(true);
    await fetch(`${API_URL}/api/group/${groupId}/tags/${encodeURIComponent(oldName)}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ newName: rename })
    });
    setEditing(null);
    fetchTags();
    setLoading(false);
  };
  const saveColor = async (name, color) => {
    setLoading(true);
    await fetch(`${API_URL}/api/group/${groupId}/tags/${encodeURIComponent(name)}/color`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ color })
    });
    fetchTags();
    setLoading(false);
  };
  const getCount = async (name) => {
    const res = await fetch(`${API_URL}/api/group/${groupId}/tags/${encodeURIComponent(name)}/count`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data.count || 0;
  };

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: '0 auto' }}>
      <h2>標籤管理</h2>
      <div style={{ marginBottom: 16 }}>
        <input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="標籤名稱" style={{ padding: 6, borderRadius: 6, border: '1px solid #ccc', marginRight: 8 }} />
        <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={{ width: 32, height: 32, verticalAlign: 'middle', marginRight: 8 }} />
        <button onClick={addTag} disabled={loading}>新增標籤</button>
      </div>
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={{ width: 60 }}>顏色</th>
            <th>名稱</th>
            <th style={{ width: 80 }}>使用次數</th>
            <th style={{ width: 120 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {tags.map(tag => (
            <tr key={tag.name}>
              <td><span style={{ display: 'inline-block', width: 24, height: 24, borderRadius: 12, background: tag.color, border: '1px solid #ccc' }}></span></td>
              <td>
                {editing && editing.name === tag.name ? (
                  <input value={rename} onChange={e => setRename(e.target.value)} onBlur={() => saveRename(tag.name)} onKeyDown={e => { if (e.key === 'Enter') saveRename(tag.name); }} style={{ padding: 4, borderRadius: 4, border: '1px solid #ccc' }} autoFocus />
                ) : (
                  <span onDoubleClick={() => startEdit(tag)} style={{ cursor: 'pointer' }}>{tag.name}</span>
                )}
              </td>
              <td>
                <TagCount name={tag.name} groupId={groupId} token={token} />
              </td>
              <td>
                <input type="color" value={tag.color} onChange={e => saveColor(tag.name, e.target.value)} style={{ width: 28, height: 28, verticalAlign: 'middle', marginRight: 8 }} />
                <button onClick={() => startEdit(tag)} style={{ marginRight: 4 }}>重命名</button>
                <button onClick={() => deleteTag(tag.name)} style={{ color: 'red' }}>刪除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TagCount({ name, groupId, token }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    fetch(`${API_URL}/api/group/${groupId}/tags/${encodeURIComponent(name)}/count`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setCount(data.count || 0));
  }, [name, groupId, token]);
  return <span>{count}</span>;
} 