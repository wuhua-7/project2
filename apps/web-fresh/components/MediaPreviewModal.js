import React from 'react';

const MediaPreviewModal = ({ open, onClose, media }) => {
  if (!open || !media) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }} onClick={onClose}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 8 }} onClick={e => e.stopPropagation()}>
        <h3>媒體預覽</h3>
        {media.type.startsWith('image') && <img src={media.url} alt="media" style={{ maxWidth: 600, maxHeight: 400 }} />}
        {media.type.startsWith('video') && <video src={media.url} controls style={{ maxWidth: 600, maxHeight: 400 }} />}
        <button onClick={onClose} style={{ marginTop: 16 }}>關閉</button>
      </div>
    </div>
  );
};

export default MediaPreviewModal; 