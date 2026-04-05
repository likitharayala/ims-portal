import Link from 'next/link';

// ─── Navbar ──────────────────────────────────────────────────────────────────

function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-4.5 h-4.5 text-white" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <span className="text-lg font-bold text-slate-800 tracking-tight">Teachly</span>
        </div>

        {/* Nav buttons */}
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Dashboard Preview Illustration ──────────────────────────────────────────

function DashboardPreview() {
  return (
    <div className="relative w-full max-w-lg mx-auto lg:mx-0">
      {/* Glow backdrop */}
      <div className="absolute -inset-4 bg-blue-100 rounded-3xl blur-2xl opacity-40" />

      {/* Main card */}
      <div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-200/80 overflow-hidden">
        {/* Top bar */}
        <div className="bg-slate-800 px-4 py-2.5 flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          <span className="ml-3 text-slate-400 text-xs font-medium">Teachly — Dashboard</span>
        </div>

        <div className="flex">
          {/* Sidebar */}
          <div className="w-14 bg-slate-50 border-r border-slate-100 py-4 flex flex-col items-center gap-3">
            {[
              <path key="home" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
              <path key="users" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />,
              <path key="file" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />,
              <path key="credit" d="M1 4h22v16H1zM1 10h22" />,
            ].map((p, i) => (
              <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center ${i === 0 ? 'bg-blue-600' : 'hover:bg-slate-200'}`}>
                <svg className={`w-4 h-4 ${i === 0 ? 'text-white' : 'text-slate-400'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  {p}
                </svg>
              </div>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 p-4 bg-slate-50">
            <p className="text-xs font-semibold text-slate-700 mb-3">Overview</p>

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { label: 'Students', value: '248', color: 'bg-blue-500', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2' },
                { label: 'Assessments', value: '36', color: 'bg-purple-500', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2' },
                { label: 'Revenue', value: '₹1.2L', color: 'bg-green-500', icon: 'M12 2a10 10 0 100 20A10 10 0 0012 2z' },
                { label: 'Materials', value: '84', color: 'bg-amber-500', icon: 'M4 19.5A2.5 2.5 0 016.5 17H20' },
              ].map((stat) => (
                <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className={`w-5 h-5 rounded-md ${stat.color} flex items-center justify-center`}>
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d={stat.icon} />
                      </svg>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">{stat.label}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-800">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Mini chart */}
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-[10px] font-semibold text-slate-600 mb-2">Performance Overview</p>
              <div className="flex items-end gap-1 h-14">
                {[40, 65, 45, 80, 60, 90, 70, 85, 55, 75, 95, 68].map((h, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm ${i === 10 ? 'bg-blue-600' : 'bg-blue-200'}`}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1">
                {['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'].map((m) => (
                  <span key={m} className="text-[8px] text-slate-400">{m}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating badge — top right */}
      <div className="absolute -top-3 -right-3 bg-green-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-lg">
        Live
      </div>

      {/* Floating notification card */}
      <div className="absolute -bottom-4 -left-4 bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2">
        <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
          </svg>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-800">New student enrolled</p>
          <p className="text-[9px] text-slate-400">Just now</p>
        </div>
      </div>
    </div>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    color: 'bg-blue-50 text-blue-600',
    border: 'border-blue-100',
    title: 'Secure & Multi-Tenant',
    points: ['Role-based access control', 'Institute-level data isolation'],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    color: 'bg-green-50 text-green-600',
    border: 'border-green-100',
    title: 'Easy Student Management',
    points: ['Bulk student import via Excel', 'Attendance & progress tracking'],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    color: 'bg-purple-50 text-purple-600',
    border: 'border-purple-100',
    title: 'AI-Powered Assessments',
    points: ['AI-generated quizzes & questions', 'Smart evaluation & grading'],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    color: 'bg-amber-50 text-amber-600',
    border: 'border-amber-100',
    title: 'Payments Management',
    points: ['Automated fee tracking', 'Payment history & overdue alerts'],
  },
];

function FeaturesSection() {
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <span className="inline-block text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full mb-4 tracking-wide uppercase">
            Everything you need
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            Key Features
          </h2>
          <p className="mt-3 text-slate-500 text-lg max-w-xl mx-auto">
            Start ppts into code, on any anythe as platform
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`bg-white rounded-2xl border ${f.border} p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`}
            >
              <div className={`w-10 h-10 rounded-xl ${f.color} flex items-center justify-center mb-4`}>
                {f.icon}
              </div>
              <h3 className="font-semibold text-slate-800 mb-3">{f.title}</h3>
              <ul className="space-y-2">
                {f.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-slate-500">
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Tech Stack ────────────────────────────────────────────────────────────────

const TECH_STACK = [
  {
    name: 'Supabase',
    description: 'PostgreSQL database',
    color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
        <path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C.277 12.64.706 13.5 1.474 13.5h8.33l.092 9.927c.014.986 1.258 1.41 1.873.637l9.262-11.653c.487-.59.059-1.45-.708-1.45h-8.33L11.9 1.036z" />
      </svg>
    ),
  },
  {
    name: 'OpenAI',
    description: 'AI question generation',
    color: 'bg-slate-50 border-slate-200 text-slate-700',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
        <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 004.981 4.18a5.985 5.985 0 00-3.998 2.9 6.046 6.046 0 00.743 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.26 24a6.056 6.056 0 005.772-4.206 5.99 5.99 0 003.997-2.9 6.056 6.056 0 00-.747-7.073zM13.26 22.43a4.476 4.476 0 01-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 00.392-.681v-6.737l2.02 1.168a.071.071 0 01.038.052v5.583a4.504 4.504 0 01-4.494 4.494zM3.6 18.304a4.47 4.47 0 01-.535-3.014l.142.085 4.783 2.759a.771.771 0 00.78 0l5.843-3.369v2.332a.08.08 0 01-.032.065L9.74 19.95a4.5 4.5 0 01-6.14-1.646zM2.34 7.896a4.485 4.485 0 012.366-1.973V11.6a.766.766 0 00.388.676l5.815 3.355-2.02 1.168a.076.076 0 01-.071 0L4.1 14.02A4.5 4.5 0 012.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 01.071 0l4.717 2.718a4.5 4.5 0 01-.67 8.112v-5.678a.788.788 0 00-.4-.681zm2.008-3.023l-.141-.085-4.774-2.782a.776.776 0 00-.785 0L9.409 9.23V6.897a.066.066 0 01.028-.061l4.713-2.715a4.5 4.5 0 016.592 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 01-.038-.057V6.075a4.5 4.5 0 017.375-3.453l-.142.08-4.778 2.758a.795.795 0 00-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
      </svg>
    ),
  },
  {
    name: 'MinIO',
    description: 'File storage',
    color: 'bg-red-50 border-red-200 text-red-700',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
        <path d="M.263 8.093v7.948l3.025-3.78zm23.474 0l-3.024 4.168 3.024 3.78zM12 15.404L1.745 8.093H0v7.948l12 7.43 12-7.43V8.093h-1.745z" />
        <path d="M12 8.596L0 1.165v6.928l12 7.311 12-7.311V1.165z" />
      </svg>
    ),
  },
];

function TechStackSection() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 pt-6">
      <span className="text-sm text-slate-400 font-medium mr-1">Powered by</span>
      {TECH_STACK.map((t) => (
        <div
          key={t.name}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium ${t.color}`}
        >
          {t.icon}
          {t.name}
        </div>
      ))}
    </div>
  );
}

// ─── CTA / Footer ─────────────────────────────────────────────────────────────

function CTASection() {
  return (
    <section className="py-24 px-6 bg-slate-900">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
          Ready to modernise your institute?
        </h2>
        <p className="text-slate-400 text-lg mb-8">
          Join institutes already using Teachly to manage students, assessments, and payments.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/signup"
            className="px-8 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition-colors text-sm"
          >
            Get Started — it&apos;s free
          </Link>
          <Link
            href="/login"
            className="px-8 py-3.5 border border-slate-600 text-slate-300 font-semibold rounded-xl hover:border-slate-400 hover:text-white transition-colors text-sm"
          >
            Sign In
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-8 px-6 bg-slate-900 border-t border-slate-800">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-slate-300">Teachly</span>
        </div>
        <p className="text-xs text-slate-500">
          &copy; {new Date().getFullYear()} Teachly. All-in-One Institute Management System.
        </p>
      </div>
    </footer>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 bg-gradient-to-b from-slate-50 to-white relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-50 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl opacity-60 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-50 rounded-full translate-y-1/2 -translate-x-1/3 blur-3xl opacity-40 pointer-events-none" />

        <div className="max-w-6xl mx-auto relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

            {/* Left — copy */}
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                Multi-Tenant SaaS Platform
              </div>

              <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight tracking-tight mb-5">
                All-in-One<br />
                <span className="text-blue-600">Institute</span>{' '}
                Management System
              </h1>

              <p className="text-lg text-slate-500 leading-relaxed mb-8 max-w-md">
                Manage students, courses, assessments, and payments seamlessly using
                a powerful multi-tenant SaaS platform designed for modern educational institutes.
              </p>

              <div className="flex flex-wrap gap-3 mb-10">
                <Link
                  href="/signup"
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 active:scale-95 transition-all text-sm shadow-lg shadow-blue-200"
                >
                  Get Started
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <Link
                  href="/login"
                  className="flex items-center gap-2 px-6 py-3 bg-white text-slate-700 font-semibold rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-sm"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Sign In
                </Link>
              </div>

              <TechStackSection />
            </div>

            {/* Right — dashboard preview */}
            <div className="hidden lg:flex items-center justify-end">
              <DashboardPreview />
            </div>
          </div>
        </div>
      </section>

      <FeaturesSection />
      <CTASection />
      <Footer />
    </div>
  );
}
