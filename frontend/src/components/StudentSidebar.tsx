'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { useStudentFeatures } from '@/hooks/use-features';

const NAV_LINKS = [
  { href: '/student/dashboard', label: 'Dashboard', icon: '⊞', feature: undefined },
  { href: '/student/assessments', label: 'Assessments', icon: '📝', feature: 'assessments' },
  { href: '/student/materials', label: 'Materials', icon: '📄', feature: 'materials' },
  { href: '/student/results', label: 'My Results', icon: '🏆', feature: 'assessments' },
  { href: '/student/progress', label: 'Learning Progress', icon: '📊', feature: 'assessments' },
  { href: '/student/attendance', label: 'Attendance', icon: '✓', feature: undefined },
  { href: '/student/notifications', label: 'Notifications', icon: '🔔', feature: undefined },
  { href: '/student/profile', label: 'My Profile', icon: '👤', feature: undefined },
];

interface Props {
  unreadCount?: number;
  onClose?: () => void;
}

export function StudentSidebar({ unreadCount = 0, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const { data: features } = useStudentFeatures();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    clearAuth();
    queryClient.clear();
    document.cookie = 'accessToken=; path=/; max-age=0';
    document.cookie = 'userRole=; path=/; max-age=0';
    router.push('/login');
  };

  const isActive = (href: string) =>
    href === '/student/dashboard' ? pathname === href : pathname.startsWith(href);

  const visibleLinks = NAV_LINKS.filter((link) => {
    if (!link.feature) return true;
    if (!features) return true;
    return features[link.feature] === true;
  });

  return (
    <div className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-4">
        <Image
          src="/logo.png"
          alt="Teachly"
          width={120}
          height={40}
          className="object-contain"
          priority
        />
        {user?.instituteName && (
          <p className="mt-1 truncate text-xs text-slate-500">{user.instituteName}</p>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onClose}
            className={`mx-2 flex items-center gap-3 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
              isActive(link.href)
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <span className="w-5 text-center text-base leading-none">{link.icon}</span>
            {link.label}
            {link.href === '/student/notifications' && unreadCount > 0 && (
              <span className="ml-auto min-w-[18px] rounded-full bg-blue-600 px-1.5 py-0.5 text-center text-xs text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="border-t border-slate-100 px-4 py-4">
        <div className="mb-3 flex items-center gap-3 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
            {user?.name?.[0]?.toUpperCase() ?? 'S'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{user?.name}</p>
            <p className="text-xs text-slate-500">Student</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
