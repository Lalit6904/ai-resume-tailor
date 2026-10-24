import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Plus,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import clsx from 'clsx';
import Logo from './Logo.jsx';
import { Button } from './ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

const NAV_ITEMS = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/upload', label: 'Upload resume', icon: UploadCloud, end: true },
  { to: '/app/privacy', label: 'Privacy & data', icon: ShieldCheck, end: true },
];

function navClass({ isActive }) {
  return clsx(
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-accent-50 text-accent-800'
      : 'text-ink-600 hover:bg-slate-100 hover:text-ink-900',
  );
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    toast.info('You have been signed out.');
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-100 px-5 py-5">
          <Logo to="/app" />
        </div>

        <div className="px-3 pt-4">
          <Button
            variant="primary"
            className="w-full justify-start"
            onClick={() => navigate('/app/upload')}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New tailoring
          </Button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
          <NavLink to="/app/upload" className="hidden" aria-hidden="true" tabIndex={-1}>
            Upload
          </NavLink>
        </nav>

        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white">
              {initials(user?.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">{user?.name}</p>
              <p className="truncate text-xs text-ink-400">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-1.5 text-ink-400 transition hover:bg-slate-100 hover:text-ink-700"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <p className="px-2 pt-2 text-[11px] leading-relaxed text-ink-400">
            Suggestions are drafts. Review every change before exporting.
          </p>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Logo to="/app" compact />
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    'rounded-lg p-2 transition',
                    isActive
                      ? 'bg-accent-50 text-accent-800'
                      : 'text-ink-500 hover:bg-slate-100 hover:text-ink-800',
                  )
                }
                aria-label={item.label}
                title={item.label}
              >
                <item.icon className="h-5 w-5" />
              </NavLink>
            ))}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-2 text-ink-500 transition hover:bg-slate-100 hover:text-ink-800"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <Outlet />
        </main>
        <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pb-8 text-[11px] text-ink-400 sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Your original DOCX is never modified.
          </span>
          <span>No ATS score, no guarantees.</span>
        </footer>
      </div>
    </div>
  );
}
