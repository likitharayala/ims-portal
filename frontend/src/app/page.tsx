'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative h-[42px] w-[180px] overflow-hidden sm:h-[50px] sm:w-[205px] lg:h-[58px] lg:w-[230px] ${className}`}
    >
      <Image
        src="/logo.png"
        alt="Teachly"
        width={1536}
        height={1024}
        priority
        className="absolute -left-3 top-1/2 h-[188%] w-auto max-w-none -translate-y-1/2 sm:-left-4 sm:h-[194%] lg:h-[200%]"
      />
    </div>
  );
}

const PRODUCT_BLOCKS = [
  {
    title: 'Student Management',
    description:
      'Manage student records, attendance and progress tracking from one dashboard.',
    icon: (
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M16 7a4 4 0 11-8 0 4 4 0 018 0zM23 21v-2a4 4 0 00-3-3.87" />
    ),
  },
  {
    title: 'Assessment Management',
    description:
      'Conduct exams, track results and monitor performance across your institute.',
    icon: (
      <path d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    ),
  },
  {
    title: 'Payments',
    description:
      'Track fees, overdue payments and payment history with a cleaner workflow for admins.',
    icon: <path d="M12 8c-2.21 0-4 .895-4 2s1.79 2 4 2 4 .895 4 2-1.79 2-4 2m0-10v12" />,
  },
  {
    title: 'Dashboard Analytics',
    description:
      'View institute performance insights and stay on top of the most important activity.',
    icon: <path d="M7 20V10M12 20V4M17 20v-7" />,
  },
] as const;

const BENEFITS = [
  {
    title: 'Save admin time',
    description: 'Reduce switching between tools and complete everyday tasks faster.',
  },
  {
    title: 'Centralized data',
    description: 'Keep students, assessments, attendance and payments in one place.',
  },
  {
    title: 'Easy tracking',
    description: 'Follow progress, pending work and performance without extra complexity.',
  },
] as const;

const HERO_STATS = [
  {
    label: 'Students',
    value: '248',
    accent: 'from-sky-500 to-blue-600',
    icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M16 7a4 4 0 11-8 0 4 4 0 018 0z',
  },
  {
    label: 'Assessments',
    value: '36',
    accent: 'from-indigo-500 to-violet-600',
    icon: 'M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  {
    label: 'Payments',
    value: 'Rs1.2L',
    accent: 'from-emerald-500 to-teal-600',
    icon: 'M12 8c-2.21 0-4 .895-4 2s1.79 2 4 2 4 .895 4 2-1.79 2-4 2m0-10v12',
  },
  {
    label: 'Materials',
    value: '84',
    accent: 'from-amber-400 to-orange-500',
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5 4.462 5 2 6.343 2 8v11c0-1.657 2.462-3 5.5-3 1.746 0 3.332.477 4.5 1.253m0-11C13.168 5.477 14.754 5 16.5 5 19.538 5 22 6.343 22 8v11c0-1.657-2.462-3-5.5-3-1.746 0-3.332.477-4.5 1.253',
  },
] as const;

const TREND_BARS = [34, 46, 43, 58, 54, 68, 63, 78, 72, 84, 79, 91];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 overflow-hidden border-b transition-all duration-300 ${
        scrolled
          ? 'border-blue-100/80 bg-white/82 shadow-[0_10px_30px_rgba(0,0,0,0.05)] backdrop-blur-xl'
          : 'border-transparent bg-white/55 backdrop-blur-md'
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-3 sm:h-[72px] sm:px-5 lg:px-7">
        <div className="flex items-center">
          <BrandLogo className="h-[42px] w-[180px] sm:h-[50px] sm:w-[205px] lg:h-[58px] lg:w-[230px]" />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="inline-flex h-9 min-w-[88px] items-center justify-center rounded-xl border border-blue-200 bg-white px-3.5 text-sm font-semibold text-blue-800 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 sm:h-10 sm:min-w-[108px] sm:px-5"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 min-w-[88px] items-center justify-center rounded-xl bg-gradient-to-r from-blue-800 to-sky-500 px-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(30,58,138,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:from-blue-900 hover:to-sky-600 sm:h-10 sm:min-w-[108px] sm:px-5"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </nav>
  );
}

function RevealSection({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className={`${className} overflow-hidden transition-all duration-700 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
      }`}
    >
      {children}
    </section>
  );
}

function PreviewShell({
  eyebrow,
  title,
  children,
  interactive = false,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  interactive?: boolean;
}) {
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left) / rect.width;
    const pointerY = (event.clientY - rect.top) / rect.height;
    setTilt({
      rotateX: (0.5 - pointerY) * 10,
      rotateY: (pointerX - 0.5) * 10,
    });
  };

  const resetTilt = () => setTilt({ rotateX: 0, rotateY: 0 });

  return (
    <div className="relative mx-auto w-full max-w-xl overflow-hidden lg:max-w-2xl">
      <div className="absolute inset-x-12 top-8 h-28 rounded-full bg-sky-200/60 blur-3xl sm:h-32" />
      <div className="absolute -right-8 bottom-6 h-20 w-20 rounded-full bg-blue-200/55 blur-3xl sm:h-24 sm:w-24" />

      <div
        className="preview-float relative px-1 sm:px-0"
        style={{ perspective: interactive ? '1800px' : undefined }}
        onMouseMove={handleMove}
        onMouseLeave={resetTilt}
      >
        <div
          className="relative overflow-hidden rounded-[18px] border border-white/70 bg-white/55 p-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.05)] backdrop-blur-xl transition-transform duration-300 ease-out sm:p-3"
          style={
            interactive
              ? {
                  transform: `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
                  transformStyle: 'preserve-3d',
                }
              : undefined
          }
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.9),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.62),rgba(255,255,255,0.26))]" />
          <div className="absolute -right-12 top-0 h-28 w-32 rotate-12 bg-sky-100/70 blur-3xl sm:h-36 sm:w-40" />

          <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-2 border-b border-blue-100 bg-gradient-to-r from-slate-50 to-blue-50/70 px-4 py-3 sm:px-5 sm:py-4">
              <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              <div className="ml-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {eyebrow}
                </p>
                <p className="mt-1 text-[13px] font-semibold text-slate-900 sm:text-sm">{title}</p>
              </div>
            </div>
            <div className="p-3.5 sm:p-4.5">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <PreviewShell eyebrow="Teachly Dashboard" title="Institute snapshot" interactive>
      <div className="grid gap-3 sm:grid-cols-2">
        {HERO_STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-blue-100 bg-white p-3 shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:p-3.5"
          >
            <div className="mb-3 flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${stat.accent} shadow-[0_10px_24px_rgba(96,165,250,0.25)] sm:h-10 sm:w-10`}
              >
                <svg
                  className="h-4 w-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  viewBox="0 0 24 24"
                >
                  <path d={stat.icon} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                {stat.label}
              </p>
            </div>
            <p className="text-[1.125rem] font-semibold text-slate-900 sm:text-[1.35rem]">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-blue-100 bg-white p-3 shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:p-3.5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-slate-900 sm:text-sm">Performance overview</p>
            <p className="text-xs text-slate-500">Last 12 months</p>
          </div>
          <div className="flex h-28 items-end gap-1.5 sm:h-36 sm:gap-2">
            {TREND_BARS.map((height, index) => (
              <div
                key={index}
                className={`flex-1 rounded-t-full ${
                  index === TREND_BARS.length - 1
                    ? 'bg-gradient-to-t from-blue-800 to-sky-400'
                    : 'bg-blue-100'
                }`}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          <div className="mt-3 flex justify-between text-[10px] uppercase tracking-[0.18em] text-slate-400">
            {['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'].map((month) => (
              <span key={month}>{month}</span>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-blue-100 bg-white p-3 shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:p-3.5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              New enrolment
            </p>
            <p className="mt-2 text-[15px] font-semibold text-slate-900 sm:text-base">
              12 students this week
            </p>
            <p className="mt-2 text-[13px] text-slate-600 sm:text-sm">
              Applications are moving smoothly across batches.
            </p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-50 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:p-3.5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-700">
              Pending review
            </p>
            <p className="mt-2 text-[15px] font-semibold text-slate-900 sm:text-base">
              6 assessments ready
            </p>
            <p className="mt-2 text-[13px] text-slate-600 sm:text-sm">
              Evaluation queue is visible at a glance for faster action.
            </p>
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function AssessmentsPreview() {
  return (
    <PreviewShell eyebrow="Assessment View" title="Student performance tracking">
      <div className="grid gap-3 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-2xl border border-blue-100 bg-white p-3 shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:p-3.5">
          <p className="text-[13px] font-semibold text-slate-900 sm:text-sm">Upcoming assessments</p>
          <div className="mt-4 space-y-3">
            {[
              { title: 'Physics Unit Test', badge: 'Active', tone: 'bg-emerald-50 text-emerald-700' },
              { title: 'Math Practice Test', badge: 'Upcoming', tone: 'bg-blue-50 text-blue-700' },
              { title: 'Chemistry Quiz', badge: 'Completed', tone: 'bg-slate-100 text-slate-600' },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-blue-100 bg-slate-50/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-slate-900 sm:text-sm">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">Scheduled in Teachly</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${item.tone}`}>
                    {item.badge}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-white p-3 shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-slate-900 sm:text-sm">Recent results</p>
            <p className="text-xs text-slate-500">Latest release</p>
          </div>

          <div className="mt-4 space-y-4">
            {[
              { name: 'Math Test', score: 78, color: 'bg-blue-500' },
              { name: 'Physics Quiz', score: 82, color: 'bg-emerald-500' },
              { name: 'Chemistry Revision', score: 69, color: 'bg-amber-500' },
            ].map((result) => (
              <div key={result.name}>
                <div className="mb-2 flex items-center justify-between text-[13px] sm:text-sm">
                  <span className="font-medium text-slate-900">{result.name}</span>
                  <span className="text-slate-600">{result.score}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                  <div
                    className={`h-full rounded-full ${result.color}`}
                    style={{ width: `${result.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: 'Attendance', value: '90%' },
              { label: 'Missed', value: '2' },
              { label: 'Trend', value: 'Up' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-blue-100 bg-slate-50/80 p-3 text-center">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-[15px] font-semibold text-slate-900 sm:text-base">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] text-slate-900">
      <Navbar />

      <main className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] bg-[radial-gradient(circle_at_18%_14%,rgba(96,165,250,0.26),transparent_26%),radial-gradient(circle_at_82%_16%,rgba(147,197,253,0.28),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.98),rgba(238,242,255,0.96))]" />
        <div className="pointer-events-none absolute left-[-12rem] top-28 -z-10 h-72 w-72 rounded-full bg-sky-200/50 blur-3xl" />
        <div className="pointer-events-none absolute right-[-8rem] top-20 -z-10 h-[20rem] w-[20rem] rounded-full bg-blue-200/45 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-[38rem] -z-10 h-64 w-[32rem] -translate-x-1/2 rounded-full bg-indigo-100/50 blur-3xl" />

        <RevealSection className="px-5 pb-14 pt-10 sm:px-8 sm:pb-16 sm:pt-14 lg:pb-20 lg:pt-20">
          <div className="mx-auto grid min-h-[calc(100vh-7rem)] max-w-7xl items-center gap-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:gap-12">
            <div className="min-w-0 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700 shadow-[0_10px_30px_rgba(0,0,0,0.05)] backdrop-blur-md sm:px-4 sm:py-2 sm:text-xs">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                Multi-tenant SaaS Platform
              </div>

              <h1 className="mt-6 max-w-3xl text-[clamp(2.05rem,4.6vw,3.1rem)] font-bold leading-[1.02] tracking-[-0.04em] text-slate-950">
                All-in-One
                <span className="block bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 bg-clip-text text-transparent">
                  Institute Management
                </span>
                <span className="block">System</span>
              </h1>

              <p className="mt-5 max-w-xl text-[14px] leading-7 text-slate-600 sm:text-[15px] sm:leading-7">
                Manage students, courses, assessments, and payments seamlessly using a
                powerful multi-tenant SaaS platform designed for modern educational
                institutes.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/signup"
                  className="inline-flex h-10 min-w-[144px] items-center justify-center rounded-xl bg-gradient-to-r from-blue-800 to-sky-500 px-5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(30,58,138,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:from-blue-900 hover:to-sky-600 sm:h-11 sm:min-w-[156px] sm:px-6"
                >
                  Get Started
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-10 min-w-[144px] items-center justify-center rounded-xl border border-blue-200 bg-white px-5 text-sm font-semibold text-blue-800 shadow-[0_10px_30px_rgba(0,0,0,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 sm:h-11 sm:min-w-[156px] sm:px-6"
                >
                  Sign In
                </Link>
              </div>
            </div>

            <div className="relative min-w-0">
              <DashboardPreview />
            </div>
          </div>
        </RevealSection>

        <RevealSection className="border-t border-blue-100/70 px-5 py-14 sm:px-8 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-blue-700 sm:text-sm">
                What Teachly does
              </p>
              <h2 className="mt-3 text-[clamp(1.45rem,2.6vw,1.85rem)] font-semibold tracking-[-0.03em] text-slate-950">
                Everything your institute needs in one platform
              </h2>
              <p className="mt-3 max-w-2xl text-[14px] leading-7 text-slate-600 sm:text-[15px] sm:leading-7">
                Teachly brings together the core workflows your institute already uses so
                they are easier to manage, easier to review, and easier to keep organised.
              </p>
            </div>

            <div className="mt-8 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:mt-10">
              {PRODUCT_BLOCKS.map((block, index) => (
                <div
                  key={block.title}
                  className={`flex flex-col gap-4 px-5 py-5 sm:px-7 sm:py-6 lg:flex-row lg:items-center lg:justify-between ${
                    index !== PRODUCT_BLOCKS.length - 1 ? 'border-b border-blue-100' : ''
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 sm:h-12 sm:w-12">
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        viewBox="0 0 24 24"
                      >
                        {block.icon}
                      </svg>
                    </div>
                    <div className="max-w-2xl">
                      <h3 className="text-[15px] font-semibold text-slate-900 sm:text-base">{block.title}</h3>
                      <p className="mt-1.5 text-[14px] leading-7 text-slate-600 sm:text-[15px]">
                        {block.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </RevealSection>

        <RevealSection className="border-t border-blue-100/70 px-5 py-14 sm:px-8 sm:py-16 lg:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-12">
            <div className="min-w-0 max-w-xl">
              <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-blue-700 sm:text-sm">
                Product screen
              </p>
              <h2 className="mt-3 text-[clamp(1.45rem,2.6vw,1.85rem)] font-semibold tracking-[-0.03em] text-slate-950">
                Manage everything from one dashboard
              </h2>
              <p className="mt-4 text-[14px] leading-7 text-slate-600 sm:text-[15px] sm:leading-7">
                Keep track of students, assessments, payments and materials from a single
                control center designed for daily institute work.
              </p>
            </div>

            <div className="min-w-0">
              <DashboardPreview />
            </div>
          </div>
        </RevealSection>

        <RevealSection className="border-t border-blue-100/70 px-5 py-14 sm:px-8 sm:py-16 lg:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12">
            <div className="order-2 min-w-0 lg:order-1">
              <AssessmentsPreview />
            </div>

            <div className="order-1 min-w-0 max-w-xl justify-self-end lg:order-2">
              <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-blue-700 sm:text-sm">
                Product screen
              </p>
              <h2 className="mt-3 text-[clamp(1.45rem,2.6vw,1.85rem)] font-semibold tracking-[-0.03em] text-slate-950">
                Track student performance easily
              </h2>
              <p className="mt-4 text-[14px] leading-7 text-slate-600 sm:text-[15px] sm:leading-7">
                Follow assessment activity, released results and progress trends through a
                cleaner interface that helps students and admins understand improvement.
              </p>
            </div>
          </div>
        </RevealSection>

        <RevealSection className="border-t border-blue-100/70 px-5 py-14 sm:px-8 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-blue-700 sm:text-sm">
                Benefits
              </p>
              <h2 className="mt-3 text-[clamp(1.45rem,2.6vw,1.85rem)] font-semibold tracking-[-0.03em] text-slate-950">
                Built to make institute work simpler
              </h2>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {BENEFITS.map((benefit) => (
                <div
                  key={benefit.title}
                  className="rounded-2xl border border-blue-100 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.05)] transition-transform duration-200 hover:-translate-y-1 sm:p-6"
                >
                  <h3 className="text-[15px] font-semibold text-slate-900 sm:text-base">{benefit.title}</h3>
                  <p className="mt-2.5 text-[14px] leading-7 text-slate-600 sm:text-[15px]">
                    {benefit.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </RevealSection>

        <RevealSection className="border-t border-blue-100/70 px-5 pb-14 pt-14 sm:px-8 sm:pb-16 sm:pt-16 lg:pb-20 lg:pt-20">
          <div className="mx-auto max-w-5xl rounded-[20px] border border-blue-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,246,255,0.96))] px-6 py-10 text-center shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:px-10 sm:py-12">
            <h2 className="text-[clamp(1.45rem,2.6vw,1.85rem)] font-semibold tracking-[-0.03em] text-slate-950">
              Start managing your institute smarter
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-7 text-slate-600 sm:text-[15px] sm:leading-7">
              Bring your daily workflows into one cleaner platform with Teachly.
            </p>
            <div className="mt-8">
              <Link
                href="/signup"
                className="inline-flex h-10 min-w-[152px] items-center justify-center rounded-xl bg-gradient-to-r from-blue-800 to-sky-500 px-6 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(30,58,138,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:from-blue-900 hover:to-sky-600 sm:h-11 sm:min-w-[168px] sm:px-7"
              >
                Get Started
              </Link>
            </div>
          </div>
        </RevealSection>
      </main>

      <style jsx global>{`
        @keyframes previewFloat {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        .preview-float {
          animation: previewFloat 6.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
