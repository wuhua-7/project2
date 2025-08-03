import React, { useEffect, useState, useRef } from 'react';
import { API_URL } from '../config';

function highlight(text, keyword) {
  if (!keyword) return text;
  const reg = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')})`, 'gi');
  return text.split(reg).map((part, i) =>
    reg.test(part) ? <mark key={i}>{part}</mark> : part
  );
}

function formatSize(size) {
  if (!size) return '';
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / 1024 / 1024).toFixed(1) + ' MB';
}

const playIcon = (
  <svg width="32" height="32" viewBox="0 0 32 32" style={{ position: 'absolute', right: 8, top: 8, pointerEvents: 'none' }}>
    <circle cx="16" cy="16" r="16" fill="rgba(0,0,0,0.5)" />
    <polygon points="13,10 24,16 13,22" fill="#fff" />
  </svg>
);

const emptyMediaSVG = (
  <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: 'block', margin: '0 auto 8px' }}>
    <rect x="10" y="20" width="100" height="50" rx="8" fill="#f0f4f8" />
    <circle cx="40" cy="50" r="10" fill="#b3c6e0" />
    <rect x="65" y="40" width="30" height="15" rx="3" fill="#dbeafe" />
    <rect x="20" y="30" width="60" height="8" rx="2" fill="#e0e7ef" />
  </svg>
);

const responsiveStyle = `
@media (max-width: 600px) {
  .mediawall-grid { grid-template-columns: repeat(2, 1fr) !important; }
  .mediawall-item img, .mediawall-item video { width: 90px !important; height: 60px !important; }
  .mediawall-item .mediawall-hover { min-width: 120px !important; font-size: 11px !important; }
}
@media (max-width: 400px) {
  .mediawall-grid { grid-template-columns: 1fr !important; }
  .mediawall-item img, .mediawall-item video { width: 100% !important; height: 48vw !important; min-width: 0 !important; }
}
`;

const MediaWall = ({ groupId, uploadKey, isAdmin }) => {
  const [mediaList, setMediaList] = useState([]); // [{_id, url, type, filename, size, createdAt}]
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [before, setBefore] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const searchDebounceRef = useRef();
  const gridRef = useRef();
  const [preview, setPreview] = useState(null); // {type, url}
  const [hoverId, setHoverId] = useState(null);
  const [selected, setSelected] = useState([]); // 多選 id 陣列
  const allChecked = mediaList.length > 0 && selected.length === mediaList.length;
  const toggleSelect = (id) => setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  const toggleSelectAll = () => setSelected(allChecked ? [] : mediaList.map(m => m._id));
  const clearSelect = () => setSelected([]);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [sort, setSort] = useState('createdAt_desc'); // createdAt_desc, createdAt_asc, filename_asc, filename_desc, size_asc, size_desc
  const [typeFilters, setTypeFilters] = useState(['image','video']); // 預設 image,video
  const typeOptions = [
    { label: '圖片', value: 'image' },
    { label: '影片', value: 'video' }
  ];
  const handleTypeFilter = (val) => setTypeFilters(f => f.includes(val) ? f.filter(x => x !== val) : [...f, val]);

  // 載入媒體訊息
  const fetchMedia = async (reset = false, searchVal = search) => {
    if (loading || !groupId || (!hasMore && !reset)) return;
    setLoading(true);
    let url = `${API_URL}/api/group/${groupId}/messages?limit=20`;
    if (typeFilters.length > 0) url += `&type=${encodeURIComponent(typeFilters.join(','))}`;
    if (!reset && before) url += `&before=${before}`;
    if (searchVal) url += `&search=${encodeURIComponent(searchVal)}`;
    if (dateStart) url += `&start=${encodeURIComponent(dateStart)}`;
    if (dateEnd) url += `&end=${encodeURIComponent(dateEnd)}`;
    if (sort) url += `&sort=${encodeURIComponent(sort)}`;
    const res = await fetch(url, { credentials: 'include' });
    const data = await res.json();
    if (res.ok && data.messages) {
      setMediaList(prev => reset ? data.messages : [...prev, ...data.messages]);
      setHasMore(data.hasMore);
      if (data.messages.length > 0) setBefore(data.messages[data.messages.length - 1]._id);
    }
    setLoading(false);
  };

  // 批次刪除
  const handleBatchDelete = async () => {
    if (!window.confirm('確定要刪除選取的媒體嗎？')) return;
    for (const id of selected) {
      await fetch(`${API_URL}/api/message/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
    }
    setSelected([]);
    fetchMedia(true);
  };

  // 批次 zip 下載
  const handleBatchZip = async () => {
    if (selected.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/group/${groupId}/messages/zip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ ids: selected })
      });
      if (!res.ok) throw new Error('下載失敗');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `group_${groupId}_media.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('zip 下載失敗');
    }
  };

  useEffect(() => {
    setMediaList([]);
    setHasMore(true);
    setBefore('');
    fetchMedia(true);
    // eslint-disable-next-line
  }, [groupId, search, uploadKey, dateStart, dateEnd, sort, typeFilters]);

  // infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!gridRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = gridRef.current;
      if (scrollHeight - scrollTop - clientHeight < 80 && hasMore && !loading) {
        fetchMedia();
      }
    };
    const grid = gridRef.current;
    if (grid) grid.addEventListener('scroll', handleScroll);
    return () => { if (grid) grid.removeEventListener('scroll', handleScroll); };
    // eslint-disable-next-line
  }, [hasMore, loading, before, search]);

  // 搜尋 debounce
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearch(searchInput);
    }, 400);
    return () => clearTimeout(searchDebounceRef.current);
  }, [searchInput]);

  return (
    <div>
      <style>{responsiveStyle}</style>
      {/* 批次操作列 */}
      {selected.length > 0 && (
        <div style={{ background: '#f5faff', border: '1px solid #b3e5fc', borderRadius: 6, padding: 8, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>已選 {selected.length} 項</span>
          <a href="#" onClick={e => {e.preventDefault(); selected.forEach(id => { const m = mediaList.find(x => x._id === id); if(m) window.open(API_URL+m.url, '_blank'); }); }} style={{ color: '#1976d2', fontWeight: 500 }}>批次下載</a>
          <a href="#" onClick={e => {e.preventDefault(); handleBatchZip(); }} style={{ color: '#1976d2', fontWeight: 500 }}>zip 批次下載</a>
          {isAdmin && <button onClick={handleBatchDelete} style={{ color: '#e53935', border: 'none', background: 'none', fontWeight: 500, cursor: 'pointer' }}>批次刪除</button>}
          <button onClick={clearSelect} style={{ marginLeft: 8 }}>取消選取</button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="搜尋檔名/關鍵字..."
          style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #ccc', minWidth: 120 }}
        />
        <button onClick={() => setSearchInput('')}>清除</button>
        <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} style={{ minWidth: 120 }} title="起始日期" />
        <span>~</span>
        <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} style={{ minWidth: 120 }} title="結束日期" />
        <select value={sort} onChange={e => setSort(e.target.value)} style={{ minWidth: 120 }}>
          <option value="createdAt_desc">時間新→舊</option>
          <option value="createdAt_asc">時間舊→新</option>
          <option value="filename_asc">檔名A→Z</option>
          <option value="filename_desc">檔名Z→A</option>
          <option value="size_asc">檔案小→大</option>
          <option value="size_desc">檔案大→小</option>
        </select>
        <input type="checkbox" checked={allChecked} onChange={toggleSelectAll} style={{ marginLeft: 8 }} title="全選/取消全選" />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {typeOptions.map(opt => (
            <label key={opt.value} style={{ fontSize: 13, marginRight: 4 }}>
              <input type="checkbox" checked={typeFilters.includes(opt.value)} onChange={() => handleTypeFilter(opt.value)} /> {opt.label}
            </label>
          ))}
        </div>
      </div>
      <div style={{ height: 400, overflowY: 'auto', background: '#fafbfc', border: '1px solid #eee', borderRadius: 8, padding: 16 }} ref={gridRef}>
        <div className="mediawall-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 16 }}>
          {mediaList.map(m => (
            <div key={m._id} className="mediawall-item" style={{ cursor: 'pointer', textAlign: 'center', position: 'relative' }}
              onClick={e => { if (e.target.type !== 'checkbox') setPreview({ type: m.type, url: API_URL + m.url }); }}
              onMouseEnter={() => setHoverId(m._id)} onMouseLeave={() => setHoverId(null)}>
              <input type="checkbox" checked={selected.includes(m._id)} onChange={() => toggleSelect(m._id)} style={{ position: 'absolute', left: 4, top: 4, zIndex: 2 }} />
              {m.type === 'image' ? (
                <img src={API_URL + m.url} alt={m.filename} style={{ width: 100, height: 70, objectFit: 'cover', borderRadius: 6, marginBottom: 4 }} />
              ) : m.type === 'video' ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <video src={API_URL + m.url} style={{ width: 100, height: 70, objectFit: 'cover', borderRadius: 6, marginBottom: 4 }} muted />
                  {playIcon}
                </div>
              ) : null}
              <div style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{highlight(m.filename || '', search)}</div>
              {hoverId === m._id && (
                <div className="mediawall-hover" style={{ position: 'absolute', left: 0, top: 80, background: '#fff', border: '1px solid #ccc', borderRadius: 4, padding: 8, fontSize: 12, zIndex: 10, minWidth: 180, boxShadow: '0 2px 8px #0002' }}>
                  <div><b>檔名：</b>{m.filename}</div>
                  <div><b>大小：</b>{formatSize(m.size)}</div>
                  <div><b>上傳時間：</b>{m.createdAt ? new Date(m.createdAt).toLocaleString() : '-'}</div>
                </div>
              )}
            </div>
          ))}
        </div>
        {loading && <div style={{ textAlign: 'center', color: '#888', margin: 12 }}>載入中...</div>}
        {!hasMore && mediaList.length > 0 && <div style={{ textAlign: 'center', color: '#888', margin: 12 }}>已無更多媒體</div>}
        {mediaList.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#888', margin: 24 }}>
            {emptyMediaSVG}
            <div style={{ fontSize: 15, color: '#888' }}>尚無媒體訊息，快來分享圖片或影片吧！</div>
          </div>
        )}
        {/* 簡易預覽 Modal */}
        {preview && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setPreview(null)}>
            <div style={{ background: '#fff', padding: 24, borderRadius: 8 }} onClick={e => e.stopPropagation()}>
              <h3>媒體預覽</h3>
              {preview.type === 'image' && <img src={preview.url} alt="media" style={{ maxWidth: 600, maxHeight: 400 }} />}
              {preview.type === 'video' && <video src={preview.url} controls style={{ maxWidth: 600, maxHeight: 400 }} />}
              <button onClick={() => setPreview(null)} style={{ marginTop: 16 }}>關閉</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaWall; 