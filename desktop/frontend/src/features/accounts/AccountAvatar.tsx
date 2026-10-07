import { UserAvatar } from '@/shared/components/UserAvatar';

export function AccountAvatar({ url, name, index }: { url: string; name: string; index: number }) {
  return (
    <UserAvatar
      url={url}
      name={name}
      size={44}
      className={'account-avatar avatar-' + (index % 4)}
    />
  );
}
