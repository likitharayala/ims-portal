'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { useAdminFeatures } from '@/hooks/use-features';

// feature: undefined → always visible; otherwise gated by that feature key
const NAV_LINKS = [
  { href: '/admin/dashboard',      label: 'Dashboard',     icon: '⊞', feature: undefined },
  { href: '/admin/students',       label: 'Students',      icon: '👥', feature: 'students' },
  { href: '/admin/materials',      label: 'Materials',     icon: '📄', feature: 'materials' },
  { href: '/admin/assessments',    label: 'Assessments',   icon: '📝', feature: 'assessments' },
  { href: '/admin/payments',       label: 'Payments',      icon: '₹',  feature: 'payments' },
  { href: '/admin/attendance',     label: 'Attendance',    icon: '✓',  feature: undefined },
  { href: '/admin/teachers',       label: 'Teachers',      icon: '🎓', feature: undefined },
  { href: '/admin/notifications',  label: 'Notifications', icon: '🔔', feature: undefined },
  { href: '/admin/settings',       label: 'Settings',      icon: '⚙',  feature: undefined },
];

interface Props {
  onClose?: () => void;
}

export function AdminSidebar({ onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const { data: features } = useAdminFeatures();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    clearAuth();
    document.cookie = 'accessToken=; path=/; max-age=0';
    document.cookie = 'userRole=; path=/; max-age=0';
    router.push('/login');
  };

  const isActive = (href: string) =>
    href === '/admin/dashboard'
      ? pathname === href
      : pathname.startsWith(href);

  // While features are loading, show all links (graceful degradation)
  const visibleLinks = NAV_LINKS.filter((link) => {
    if (!link.feature) return true;
    if (!features) return true;
    return features[link.feature] === true;
  });

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-100">
        <Image src="/logo.png" alt="Teachly" width={130} height={40} className="object-contain" priority />
        {user?.instituteName && (
          <p className="text-xs text-slate-500 mt-1 truncate">{user.instituteName}</p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onClose}
            className={`flex items-center gap-3 px-5 py-2.5 mx-2 rounded-lg text-sm font-medium transition-colors ${
              isActive(link.href)
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <span className="w-5 text-center text-base leading-none">{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Profile avatar dropdown */}
      <div className="px-4 py-4 border-t border-slate-100" ref={profileRef}>
        <button
          onClick={() => setProfileOpen((o) => !o)}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm flex-shrink-0">
            {user?.name?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{user?.name}</p>
            <p className="text-xs text-slate-500">Admin</p>
          </div>
          <svg
            className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${profileOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {profileOpen && (
          <div className="mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <Link
              href="/admin/profile"
              onClick={() => { setProfileOpen(false); onClose?.(); }}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              My Profile
            </Link>
            <div className="border-t border-slate-100" />
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
