import { useState } from 'react';
import { FileImageOutlined } from '@ant-design/icons';

export function NoteCover({ src, title }: { src: string; title: string }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  return (
    <div className="note-cover">
      {src && failedSrc !== src ? (
        <img
          src={src}
          alt={title || '笔记封面'}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div className="note-cover-placeholder">
          <FileImageOutlined />
          <span>暂无封面</span>
        </div>
      )}
    </div>
  );
}
