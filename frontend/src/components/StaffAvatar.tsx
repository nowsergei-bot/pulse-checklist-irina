import { useEffect, useState } from 'react';

type Size = 'sm' | 'md' | 'lg' | 'xl';

type Props = {
  name: string;
  photoUrl?: string | null;
  size?: Size;
  className?: string;
};

export function staffInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toLocaleUpperCase('ru-RU');
  }
  return (parts[0]?.slice(0, 2) || '?').toLocaleUpperCase('ru-RU');
}

export default function StaffAvatar({ name, photoUrl, size = 'md', className = '' }: Props) {
  const src = String(photoUrl || '').trim();
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  return (
    <span className={`staff-avatar staff-avatar--${size}${className ? ` ${className}` : ''}`}>
      {src && !broken ? (
        <img src={src} alt="" onError={() => setBroken(true)} />
      ) : (
        <span className="staff-avatar__initials">{staffInitials(name)}</span>
      )}
    </span>
  );
}
