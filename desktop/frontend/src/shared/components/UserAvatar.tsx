import { useState } from 'react';
import { Avatar } from 'antd';

export function UserAvatar({
  url,
  name,
  size = 36,
  className,
}: {
  url?: string;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failedURL, setFailedURL] = useState<string>();
  return (
    <Avatar
      size={size}
      className={className || 'user-avatar'}
      src={
        url && failedURL !== url ? (
          <img
            src={url}
            alt={name + '的头像'}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailedURL(url)}
          />
        ) : undefined
      }
    >
      {Array.from(name)[0] || '?'}
    </Avatar>
  );
}
