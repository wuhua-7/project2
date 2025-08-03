import React, { useEffect, useState, useRef } from 'react';
import TagManager from './TagManager';
import { API_URL } from '../config';

function formatSize(size) {
  if (!size) return '';
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / 1024 / 1024).toFixed(1) + ' MB';
}

function highlight(text, keyword) {
  if (!keyword) return text;
  const reg = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')})`, 'gi');
  return text.split(reg).map((part, i) =>
    reg.test(part) ? <mark key={i}>{part}</mark> : part
  );
}

function getFileIcon(mimetype) {
  if (!mimetype) return icons.unknown;
  if (mimetype.startsWith('image/')) return icons.image;
  if (mimetype.startsWith('video/')) return icons.video;
  if (mimetype === 'application/pdf') return icons.pdf;
  if (mimetype.includes('word')) return icons.word;
  if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return icons.excel;
  if (mimetype.includes('zip') || mimetype.includes('rar')) return icons.zip;
  if (mimetype.startsWith('audio/')) return icons.audio;
  if (mimetype.startsWith('text/')) return icons.text;
  return icons.file;
}

const icons = {
  pdf: <svg width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#e57373"/><text x="50%" y="60%" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="bold">PDF</text></svg>,
  word: <svg width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#1976d2"/><text x="50%" y="60%" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="bold">DOC</text></svg>,
  excel: <svg width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#388e3c"/><text x="50%" y="60%" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="bold">XLS</text></svg>,
  zip: <svg width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#fbc02d"/><text x="50%" y="60%" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="bold">ZIP</text></svg>,
  image: <svg width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#90caf9"/><circle cx="7" cy="13" r="2" fill="#fff"/><rect x="10" y="10" width="6" height="6" fill="#fff"/></svg>,
  video: <svg width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#ba68c8"/><polygon points="7,5 15,10 7,15" fill="#fff"/></svg>,
  audio: <svg width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#4dd0e1"/><rect x="7" y="6" width="2" height="8" fill="#fff"/><circle cx="13" cy="10" r="3" fill="#fff"/></svg>,
  text: <svg width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#bdbdbd"/><text x="50%" y="60%" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="bold">TXT</text></svg>,
  file: <svg width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#90a4ae"/><text x="50%" y="60%" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="bold">FILE</text></svg>,
  unknown: <svg width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#e0e0e0"/><text x="50%" y="60%" textAnchor="middle" fontSize="10" fill="#888" fontWeight="bold">?</text></svg>
};

const emptyFileSVG = (
  <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: 'block', margin: '0 auto 8px' }}>
    <rect x="30" y="20" width="60" height="40" rx="8" fill="#f0f4f8" />
    <rect x="50" y="35" width="20" height="10" rx="2" fill="#b3c6e0" />
    <rect x="40" y="50" width="40" height="6" rx="2" fill="#e0e7ef" />
  </svg>
);

const responsiveStyle = `
@media (max-width: 700px) {
  .filecabinet-table th, .filecabinet-table td { font-size: 12px !important; padding: 4px !important; }
  .filecabinet-table th:nth-child(3), .filecabinet-table td:nth-child(3),
  .filecabinet-table th:nth-child(4), .filecabinet-table td:nth-child(4) { display: none !important; }
}
@media (max-width: 500px) {
  .filecabinet-table th, .filecabinet-table td { font-size: 11px !important; padding: 2px !important; }
  .filecabinet-table th:nth-child(2), .filecabinet-table td:nth-child(2) { max-width: 80px !important; }
}
`;

const FileCabinet = ({ groupId, uploadKey, isAdmin }) => {
  const [fileList, setFileList] = useState([]); // [{_id, url, type, filename, size, mimetype, createdAt}]
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [before, setBefore] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const searchDebounceRef = useRef();
  const listRef = useRef();
  const [hoverRow, setHoverRow] = useState(null);
  const [selected, setSelected] = useState([]); // 多選 id 陣列
  const allChecked = fileList.length > 0 && selected.length === fileList.length;
  // 勾選動畫 state
  const checkboxRefs = useRef({});
  const [allTags, setAllTags] = useState([]); // 所有標籤
  const tagSuggestRef = useRef();
  const [tagSuggestOpen, setTagSuggestOpen] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [tagModalType, setTagModalType] = useState(''); // 'add' | 'remove'
  const [tagInput, setTagInput] = useState('');
  const [tagInputFocus, setTagInputFocus] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [tagColors, setTagColors] = useState({});
  const [tagCounts, setTagCounts] = useState({});

  const animateCheckbox = (id) => {
    const el = checkboxRefs.current[id];
    if (el) {
      el.animate([
        { transform: 'scale(0.8)' },
        { transform: 'scale(1)' }
      ], { duration: 180 });
    }
  };

  const toggleSelect = (id) => {
    setSelected(sel => {
      const next = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id];
      animateCheckbox(id);
      return next;
    });
  };
  const toggleSelectAll = () => setSelected(allChecked ? [] : fileList.map(f => f._id));
  const clearSelect = () => setSelected([]);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [sort, setSort] = useState('createdAt_desc'); // createdAt_desc, createdAt_asc, filename_asc, filename_desc, size_asc, size_desc
  const [typeFilters, setTypeFilters] = useState([]); // ['pdf','word','excel','zip','image','video','audio','text','file']
  const typeOptions = [
    { label: '圖片', value: 'image' },
    { label: '影片', value: 'video' },
    { label: 'PDF', value: 'pdf' },
    { label: 'Word', value: 'word' },
    { label: 'Excel', value: 'excel' },
    { label: '壓縮檔', value: 'zip' },
    { label: '音訊', value: 'audio' },
    { label: '純文字', value: 'text' },
    { label: '其他', value: 'file' }
  ];
  const handleTypeFilter = (val) => setTypeFilters(f => f.includes(val) ? f.filter(x => x !== val) : [...f, val]);
  const [tagFilters, setTagFilters] = useState([]); // 新增標籤篩選
  const [showArchived, setShowArchived] = useState(false); // 歸檔篩選
  const tagOptions = [
    { label: '所有標籤', value: '' },
    { label: '標籤A', value: 'tagA' },
    { label: '標籤B', value: 'tagB' },
    { label: '標籤C', value: 'tagC' },
    { label: '標籤D', value: 'tagD' },
    { label: '標籤E', value: 'tagE' },
    { label: '標籤F', value: 'tagF' },
    { label: '標籤G', value: 'tagG' },
    { label: '標籤H', value: 'tagH' },
    { label: '標籤I', value: 'tagI' },
    { label: '標籤J', value: 'tagJ' },
    { label: '標籤K', value: 'tagK' },
    { label: '標籤L', value: 'tagL' },
    { label: '標籤M', value: 'tagM' },
    { label: '標籤N', value: 'tagN' },
    { label: '標籤O', value: 'tagO' },
    { label: '標籤P', value: 'tagP' },
    { label: '標籤Q', value: 'tagQ' },
    { label: '標籤R', value: 'tagR' },
    { label: '標籤S', value: 'tagS' },
    { label: '標籤T', value: 'tagT' },
    { label: '標籤U', value: 'tagU' },
    { label: '標籤V', value: 'tagV' },
    { label: '標籤W', value: 'tagW' },
    { label: '標籤X', value: 'tagX' },
    { label: '標籤Y', value: 'tagY' },
    { label: '標籤Z', value: 'tagZ' },
  ];
  const handleTagFilter = (val) => setTagFilters(f => f.includes(val) ? f.filter(x => x !== val) : [...f, val]);

  // 載入檔案訊息
  const fetchFiles = async (reset = false, searchVal = search) => {
    if (loading || !groupId || (!hasMore && !reset)) return;
    setLoading(true);
    let url = `${API_URL}/api/group/${groupId}/messages?type=file&limit=20`;
    if (!reset && before) url += `&before=${before}`;
    if (searchVal) url += `&search=${encodeURIComponent(searchVal)}`;
    if (dateStart) url += `&start=${encodeURIComponent(dateStart)}`;
    if (dateEnd) url += `&end=${encodeURIComponent(dateEnd)}`;
    if (sort) url += `&sort=${encodeURIComponent(sort)}`;
    if (typeFilters.length > 0) url += `&mimetype=${encodeURIComponent(typeFilters.join(','))}`;
    if (tagFilters.length > 0) url += `&tags=${encodeURIComponent(tagFilters.join(','))}`;
    if (showArchived) url += `&archived=true`;
    const res = await fetch(url, { credentials: 'include' });
    const data = await res.json();
    if (res.ok && data.messages) {
      setFileList(prev => reset ? data.messages : [...prev, ...data.messages]);
      setHasMore(data.hasMore);
      if (data.messages.length > 0) setBefore(data.messages[data.messages.length - 1]._id);
    }
    setLoading(false);
  };

  // 批次刪除
  const handleBatchDelete = async () => {
    if (!window.confirm('確定要刪除選取的檔案嗎？')) return;
    try {
      const res = await fetch(`${API_URL}/api/group/${groupId}/messages/batch-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ ids: selected })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '刪除失敗');
      setSelected([]);
      fetchFiles(true);
      alert('批次刪除完成');
    } catch (e) {
      alert('批次刪除失敗：' + (e.message || e));
    }
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
      a.download = `group_${groupId}_files.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('zip 下載失敗');
    }
    setSelected([]);
  };

  const handleBatchTag = () => {
    setTagModalType('add');
    setTagInput('');
    setShowTagModal(true);
  };
  const handleBatchUntag = () => {
    setTagModalType('remove');
    setTagInput('');
    setShowTagModal(true);
  };
  const submitTagModal = async () => {
    if (!tagInput || !allTags.includes(tagInput)) {
      alert('請選擇現有標籤');
      return;
    }
    try {
      let url = `${API_URL}/api/group/${groupId}/messages/` + (tagModalType === 'add' ? 'batch-tag' : 'batch-untag');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ ids: selected, tag: tagInput })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (tagModalType === 'add' ? '標籤失敗' : '移除標籤失敗'));
      setSelected([]);
      fetchFiles(true);
      alert(tagModalType === 'add' ? '批次標籤完成' : '批次移除標籤完成');
    } catch (e) {
      alert((tagModalType === 'add' ? '批次標籤失敗：' : '批次移除標籤失敗：') + (e.message || e));
    }
    setShowTagModal(false);
  };
  const handleBatchArchive = async () => {
    if (!window.confirm('確定要歸檔選取的檔案嗎？')) return;
    try {
      const res = await fetch(`${API_URL}/api/group/${groupId}/messages/batch-archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ ids: selected })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '歸檔失敗');
      setSelected([]);
      fetchFiles(true);
      alert('批次歸檔完成');
    } catch (e) {
      alert('批次歸檔失敗：' + (e.message || e));
    }
  };

  const handleBatchUnarchive = async () => {
    if (!window.confirm('確定要取消歸檔選取的檔案嗎？')) return;
    try {
      const res = await fetch(`${API_URL}/api/group/${groupId}/messages/batch-unarchive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ ids: selected })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取消歸檔失敗');
      setSelected([]);
      fetchFiles(true);
      alert('批次取消歸檔完成');
    } catch (e) {
      alert('批次取消歸檔失敗：' + (e.message || e));
    }
  };

  useEffect(() => {
    setFileList([]);
    setHasMore(true);
    setBefore('');
    fetchFiles(true);
    // eslint-disable-next-line
  }, [groupId, search, uploadKey, dateStart, dateEnd, sort, typeFilters, tagFilters, showArchived]);

  // 進入頁面自動查詢所有標籤
  useEffect(() => {
    fetch(`${API_URL}/api/group/${groupId}/tags`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setAllTags((data.tags || []).map(t => t.name));
        setTagColors(Object.fromEntries((data.tags || []).map(t => [t.name, t.color])));
        setTagCounts(Object.fromEntries((data.tags || []).map(t => [t.name, t.count || 0])));
      });
  }, [groupId]);

  // infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!listRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = listRef.current;
      if (scrollHeight - scrollTop - clientHeight < 80 && hasMore && !loading) {
        fetchFiles();
      }
    };
    const list = listRef.current;
    if (list) list.addEventListener('scroll', handleScroll);
    return () => { if (list) list.removeEventListener('scroll', handleScroll); };
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
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="搜尋檔名/關鍵字..."
          style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #ccc', minWidth: 120 }}
        />
        <button onClick={() => setSearchInput('')}>清除</button>
        {/* 標籤多選自動補全 */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <input
            value={tagFilters.join(',')}
            onChange={e => setTagFilters(e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
            placeholder="標籤（逗號分隔）"
            style={{ width: 120, marginLeft: 8 }}
            ref={tagSuggestRef}
            onFocus={e => setTagSuggestOpen(true)}
            onBlur={e => setTimeout(() => setTagSuggestOpen(false), 200)}
          />
          {tagSuggestOpen && allTags.length > 0 && (
            <div style={{ position: 'absolute', top: 28, left: 0, background: '#fff', border: '1px solid #ccc', borderRadius: 6, zIndex: 20, minWidth: 120, maxHeight: 160, overflowY: 'auto', boxShadow: '0 2px 8px #0002' }}>
              {allTags.filter(t => t && !tagFilters.includes(t) && (tagFilters.length === 0 || t.includes(tagFilters[tagFilters.length-1]))).map((t, i) => (
                <div key={i} style={{ padding: '4px 12px', cursor: 'pointer', color: '#1976d2' }}
                  onMouseDown={e => {
                    const arr = [...tagFilters];
                    arr[arr.length-1] = t;
                    setTagFilters(arr.filter(Boolean));
                    setTagSuggestOpen(false);
                  }}>{t}</div>
              ))}
              {allTags.filter(t => t && !tagFilters.includes(t) && (tagFilters.length === 0 || t.includes(tagFilters[tagFilters.length-1]))).length === 0 && (
                <div style={{ color: '#888', padding: '4px 12px' }}>無建議</div>
              )}
            </div>
          )}
        </div>
        <label style={{ marginLeft: 8 }}><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> 僅顯示已歸檔</label>
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
      {/* 批次操作列 */}
      {selected.length > 0 && (
        <div style={{ background: '#f5faff', border: '1px solid #b3e5fc', borderRadius: 6, padding: 8, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>已選 {selected.length} 項</span>
          <a href="#" onClick={e => {e.preventDefault(); selected.forEach(id => { const f = fileList.find(x => x._id === id); if(f) window.open(API_URL+f.url, '_blank'); }); }} style={{ color: '#1976d2', fontWeight: 500 }}>批次下載</a>
          <a href="#" onClick={e => {e.preventDefault(); handleBatchZip(); }} style={{ color: '#1976d2', fontWeight: 500 }}>zip 批次下載</a>
          {isAdmin && <button onClick={handleBatchDelete} style={{ color: '#e53935', border: 'none', background: 'none', fontWeight: 500, cursor: 'pointer' }}>批次刪除</button>}
          {isAdmin && <button onClick={handleBatchTag} style={{ color: '#1976d2' }}>批次標籤</button>}
          {isAdmin && <button onClick={handleBatchArchive} style={{ color: '#1976d2' }}>批次歸檔</button>}
          {isAdmin && <button onClick={handleBatchUntag} style={{ color: '#1976d2' }}>批次移除標籤</button>}
          {isAdmin && <button onClick={handleBatchUnarchive} style={{ color: '#1976d2' }}>批次取消歸檔</button>}
          <button onClick={clearSelect} style={{ marginLeft: 8 }}>取消選取</button>
        </div>
      )}
      <div style={{ height: 400, overflowY: 'auto', background: '#fafbfc', border: '1px solid #eee', borderRadius: 8, padding: 16 }} ref={listRef}>
        <table className="filecabinet-table" style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={{ textAlign: 'center', padding: 6 }}><input type="checkbox" checked={allChecked} onChange={toggleSelectAll} /></th>
              <th style={{ textAlign: 'left', padding: 6 }}></th>
              <th style={{ textAlign: 'left', padding: 6 }}>檔名</th>
              <th style={{ textAlign: 'left', padding: 6 }}>型別</th>
              <th style={{ textAlign: 'right', padding: 6 }}>大小</th>
              <th style={{ textAlign: 'center', padding: 6 }}>下載</th>
            </tr>
          </thead>
          <tbody>
            {fileList.map(f => (
              <tr key={f._id} style={{ borderBottom: '1px solid #eee', background: hoverRow === f._id ? '#f5faff' : undefined }}
                onMouseEnter={() => setHoverRow(f._id)} onMouseLeave={() => setHoverRow(null)}>
                <td style={{ textAlign: 'center', padding: 6 }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(f._id)}
                    ref={el => checkboxRefs.current[f._id] = el}
                    onChange={() => toggleSelect(f._id)}
                    style={{ width: 18, height: 18, accentColor: selected.includes(f._id) ? '#1976d2' : '#ccc', transition: 'accent-color 0.2s' }}
                  />
                  {selected.includes(f._id) && (
                    <span style={{
                      position: 'absolute', top: -8, right: -8, background: '#1976d2', color: '#fff', borderRadius: 8, minWidth: 16, height: 16, fontSize: 10, fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', zIndex: 2
                    }}>{selected.indexOf(f._id) + 1}</span>
                  )}
                </td>
                <td style={{ padding: 6 }}>{getFileIcon(f.mimetype)}</td>
                <td style={{ padding: 6, maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', position: 'relative' }}>
                  {highlight(f.filename || '', search)}
                  {f.tags && f.tags.map((tag, i) => <span key={i} style={{ background: tagColors[tag] || '#bde0fe', color: '#1976d2', borderRadius: 6, padding: '2px 8px', fontSize: 11, marginLeft: 4 }}>{tag}</span>)}
                  {f.archived && <span style={{ background: '#eee', color: '#888', borderRadius: 6, padding: '2px 8px', fontSize: 11, marginLeft: 4 }}>已歸檔</span>}
                  {hoverRow === f._id && (
                    <div style={{ position: 'absolute', left: 0, top: 24, background: '#fff', border: '1px solid #ccc', borderRadius: 4, padding: 8, fontSize: 12, zIndex: 10, minWidth: 200, boxShadow: '0 2px 8px #0002' }}>
                      <div><b>完整檔名：</b>{f.filename}</div>
                      <div><b>型別：</b>{f.mimetype || '-'}</div>
                      <div><b>大小：</b>{formatSize(f.size)}</div>
                      <div><b>上傳時間：</b>{f.createdAt ? new Date(f.createdAt).toLocaleString() : '-'}</div>
                    </div>
                  )}
                </td>
                <td style={{ padding: 6 }}>{f.mimetype || '-'}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{formatSize(f.size)}</td>
                <td style={{ padding: 6, textAlign: 'center' }}>
                  <a href={API_URL + f.url} download={f.filename} style={{ color: '#1976d2', display: 'inline-block' }} title="下載">
                    <svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 3v9m0 0l-3-3m3 3l3-3M4 15h12" stroke="#1976d2" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div style={{ textAlign: 'center', color: '#888', margin: 12 }}>載入中...</div>}
        {!hasMore && fileList.length > 0 && <div style={{ textAlign: 'center', color: '#888', margin: 12 }}>已無更多檔案</div>}
        {fileList.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#888', margin: 24 }}>
            {emptyFileSVG}
            <div style={{ fontSize: 15, color: '#888' }}>尚無檔案訊息，快來上傳檔案吧！</div>
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, background: '#f5faff', borderTop: '1px solid #b3e5fc', display: 'flex', alignItems: 'center', padding: 12, zIndex: 100, boxShadow: '0 -2px 8px #0001', gap: 16, justifyContent: 'center' }}>
          <span style={{ fontWeight: 'bold', color: '#1976d2' }}>已選 {selected.length} / {fileList.length} 項</span>
          <button onClick={toggleSelectAll} style={{ color: allChecked ? '#1976d2' : '#888' }}>{allChecked ? '取消全選' : '全選本頁'}</button>
          <button onClick={handleBatchZip} style={{ color: '#1976d2' }}>批次下載</button>
          {isAdmin && <button onClick={handleBatchDelete} style={{ color: '#e53935' }}>批次刪除</button>}
          <button onClick={clearSelect} style={{ color: '#888' }}>取消</button>
        </div>
      )}
      {showTagModal && (
        <div style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: '#0005', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, minWidth: 320, boxShadow: '0 2px 16px #0004', position: 'relative' }}>
            <h3>{tagModalType === 'add' ? '批次標籤' : '批次移除標籤'}</h3>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder="請輸入標籤"
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', marginBottom: 8 }}
              autoFocus
              onFocus={() => setTagInputFocus(true)}
              onBlur={() => setTimeout(() => setTagInputFocus(false), 200)}
            />
            {tagInputFocus && allTags.length > 0 && (
              <div style={{ position: 'absolute', left: 24, top: 90, background: '#fff', border: '1px solid #ccc', borderRadius: 6, zIndex: 20, minWidth: 120, maxHeight: 160, overflowY: 'auto', boxShadow: '0 2px 8px #0002' }}>
                {allTags.filter(t => t && t.includes(tagInput)).map((t, i) => (
                  <div key={i} style={{ padding: '4px 12px', cursor: 'pointer', color: '#1976d2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    onMouseDown={e => { setTagInput(t); setTagInputFocus(false); }}
                  >
                    <span>{t}</span>
                    <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>{tagCounts[t] || 0}次</span>
                  </div>
                ))}
                {allTags.filter(t => t && t.includes(tagInput)).length === 0 && (
                  <div style={{ color: '#888', padding: '4px 12px' }}>無建議</div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button onClick={submitTagModal} style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px' }}>確定</button>
              <button onClick={() => setShowTagModal(false)} style={{ border: 'none', borderRadius: 6, padding: '8px 24px' }}>取消</button>
            </div>
          </div>
        </div>
      )}
      {/* 右上角管理員專用標籤管理按鈕 */}
      {isAdmin && (
        <button style={{ position: 'absolute', right: 24, top: 16, zIndex: 10 }} onClick={() => setShowTagManager(true)}>
          標籤管理
        </button>
      )}
      {showTagManager && (
        <div style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: '#0005', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 2px 16px #0004', minWidth: 400, maxWidth: 520, padding: 0, position: 'relative' }}>
            <button onClick={() => setShowTagManager(false)} style={{ position: 'absolute', right: 12, top: 12, fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
            <TagManager groupId={groupId} token={localStorage.getItem('token')} />
          </div>
        </div>
      )}
    </div>
  );
};

export default FileCabinet; 