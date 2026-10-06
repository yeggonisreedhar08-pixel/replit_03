import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Building2,
  CalendarDays, Check, ChevronRight, CircleHelp, Clock3, Cpu,
  Gauge, LayoutDashboard, Lightbulb, LogOut, Menu, Monitor,
  PlugZap, Plus, Power, Radio, RefreshCw, Search, Settings2, ShieldCheck,
  SlidersHorizontal, Sparkles, Thermometer, Users, Wind, X, Zap,
} from 'lucide-react';
import {
  getGetAlertsQueryKey, getGetAutomationQueryKey, getGetBookingsQueryKey,
  getGetDashboardQueryKey, getGetDevicesQueryKey, getGetEnergyQueryKey,
  getGetRoomsQueryKey, useAcknowledgeAlert, useCancelBooking, useCreateBooking,
  useGetAlerts, useGetAutomation, useGetBookings, useGetDashboard, useGetDevices,
  useGetEnergy, useGetRooms, useHealthCheck, useRunSimulatorAction,
  useUpdateAutomation, useUpdateDevice, useUpdateRoomControls,
} from '@workspace/api-client-react';
import type { Booking, EnergyAnalytics, Room } from '@workspace/api-client-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchInterval: 10_000,
      refetchIntervalInBackground: true,
      retry: 1,
      staleTime: 20_000,
    },
  },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#326d58', colorForeground: '#25332f', colorMutedForeground: '#69746f',
    colorDanger: '#a9443f', colorBackground: '#fbfaf5', colorInput: '#f4f3ed',
    colorInputForeground: '#25332f', colorNeutral: '#d8ddd7', fontFamily: 'DM Sans',
    borderRadius: '0.65rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center relative z-10',
    cardBox: 'bg-[#fbfaf5] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#d8ddd7]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#25332f] font-semibold tracking-tight',
    headerSubtitle: 'text-[#69746f]',
    socialButtonsBlockButtonText: 'text-[#25332f] font-medium',
    formFieldLabel: 'text-[#34423d] font-medium',
    footerActionLink: 'text-[#326d58] font-semibold',
    footerActionText: 'text-[#69746f]',
    dividerText: 'text-[#69746f]',
    identityPreviewEditButton: 'text-[#326d58]',
    formFieldSuccessText: 'text-[#326d58]',
    alertText: 'text-[#913d39]',
    logoBox: 'rounded-lg overflow-hidden',
    logoImage: 'rounded-lg',
    socialButtonsBlockButton: 'border border-[#d8ddd7] rounded-lg',
    formButtonPrimary: 'bg-[#326d58] hover:bg-[#285b49] text-white',
    formFieldInput: 'bg-[#f4f3ed] border-[#d8ddd7] text-[#25332f]',
    footerAction: 'text-[#69746f]',
    dividerLine: 'bg-[#d8ddd7]',
    alert: 'bg-[#f8e9e5] border-[#e9c5be]',
    otpCodeFieldInput: 'bg-[#f4f3ed] border-[#d8ddd7]',
    formFieldRow: 'gap-1',
    main: 'gap-4',
  },
};

type IconType = typeof LayoutDashboard;
type NavItem = { href: string; label: string; icon: IconType; count?: number };
type OfficeRole = 'admin' | 'facility_manager' | 'manager' | 'employee';
function getOfficeRole(value: unknown): OfficeRole {
  if (typeof value !== 'string') return 'employee';
  const role = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (role === 'admin' || role === 'administrator') return 'admin';
  if (role === 'facility_manager') return 'facility_manager';
  if (role === 'manager' || role === 'department_manager') return 'manager';
  return 'employee';
}
function formatRole(role: OfficeRole) {
  return role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
const navigation: NavItem[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/rooms', label: 'Rooms', icon: Building2 },
  { href: '/meetings', label: 'Meetings', icon: CalendarDays },
  { href: '/devices', label: 'Devices', icon: Cpu },
  { href: '/energy', label: 'Energy', icon: Zap },
  { href: '/automation', label: 'Automation', icon: Settings2 },
  { href: '/alerts', label: 'Alerts', icon: AlertTriangle },
];

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) client.clear();
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function BrandMark({ light = false }: { light?: boolean }) {
  return <span className={`brand-mark ${light ? 'brand-mark-light' : ''}`}><span /><span /><span /><span /></span>;
}
function Button({ children, onClick, variant = 'primary', disabled, type = 'button', className = '', testId }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'quiet' | 'outline' | 'danger'; disabled?: boolean; type?: 'button' | 'submit'; className?: string; testId?: string;
}) {
  return <button data-testid={testId} type={type} disabled={disabled} onClick={onClick}
    className={`btn btn-${variant} ${className}`}>{children}</button>;
}
function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-title-row"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="page-action">{action}</div>}</div>;
}
function LoadingPanel({ label = 'Loading office data' }: { label?: string }) {
  return <div className="loading-panel" role="status" data-testid="status-loading"><span className="skeleton skel-short" /><span className="skeleton skel-long" /><span className="skeleton skel-long" /><span className="loading-caption">{label}…</span></div>;
}
function ErrorPanel({ retry, message = 'Could not load this view.' }: { retry: () => void; message?: string }) {
  return <div className="empty-state error-state"><span className="empty-icon"><CircleHelp size={20} /></span><strong>Connection interrupted</strong><p>{message}</p><Button variant="outline" onClick={retry}><RefreshCw size={14} /> Retry</Button></div>;
}
function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span className="empty-icon"><Radio size={20} /></span><strong>{title}</strong><p>{text}</p></div>;
}
function StatusBadge({ value }: { value: string }) {
  const cls = ['occupied', 'on', 'in-progress', 'enabled'].includes(value) ? 'status-good'
    : ['warning', 'reserved', 'preparing', 'standby'].includes(value) ? 'status-warn'
      : ['offline', 'maintenance', 'critical'].includes(value) ? 'status-bad' : 'status-neutral';
  return <span className={`status-badge ${cls}`}><i />{value.replace('-', ' ')}</span>;
}
function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const role = getOfficeRole(user?.publicMetadata?.role);
  const alerts = useGetAlerts({ query: { queryKey: getGetAlertsQueryKey(), enabled: role !== 'employee' } });
  const openAlerts = (alerts.data ?? []).filter((alert) => !alert.acknowledged).length;
  const roleLabel = formatRole(role);
  const roleRoutes = role === 'employee' ? ['/', '/rooms', '/meetings']
    : role === 'manager' ? ['/', '/rooms', '/meetings', '/energy', '/alerts']
      : null;
  const visibleNavigation = roleRoutes ? navigation.filter((item) => roleRoutes.includes(item.href)) : navigation;
  return <div className="app-layout">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <Link href="/" className="brand-lockup" onClick={() => setMobileOpen(false)}><BrandMark light /><span><b>Meridian</b><small>WORKPLACE SYSTEMS</small></span></Link>
      <div className="sidebar-caption">OFFICE OPERATIONS</div>
      <nav className="side-nav" aria-label="Main navigation">
        {visibleNavigation.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? location === '/' : location.startsWith(href);
          return <Link data-testid={`link-nav-${label.toLowerCase()}`} key={href} href={href} className={`sidebar-link ${active ? 'sidebar-link-active' : ''}`} onClick={() => setMobileOpen(false)}>
            <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
            {label === 'Alerts' && openAlerts > 0 && <span className="nav-count">{openAlerts}</span>}
            {active && <span className="nav-marker" />}
          </Link>;
        })}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-foot">
        <div className="connection-line"><span className="live-dot" /> BUILDING ONLINE</div>
        <div className="sidebar-user"><div className="user-monogram">{(user?.firstName?.[0] || 'O').toUpperCase()}{(user?.lastName?.[0] || 'P').toUpperCase()}</div><div className="user-info"><b>{user?.fullName || 'Office operator'}</b><small>{roleLabel}</small></div>
          <button aria-label="Sign out" data-testid="button-sign-out" className="icon-button signout-button" onClick={() => signOut({ redirectUrl: basePath || '/' })}><LogOut size={16} /></button></div>
      </div>
    </aside>
    {mobileOpen && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setMobileOpen(false)} />}
    <main className="app-main">
      <header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(!mobileOpen)}><Menu size={19} /></button>
        <div className="breadcrumb"><span>Meridian office</span><ChevronRight size={14} /><b>{navigation.find((item) => item.href === location)?.label || navigation.find((item) => location.startsWith(item.href) && item.href !== '/')?.label || 'Overview'}</b></div>
        <div className="topbar-meta"><span className="system-status"><span className="live-dot" /> All systems normal</span><span className="topbar-divider" /><span className="today-date">{new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span><div className="avatar-small">{(user?.firstName?.[0] || 'O').toUpperCase()}</div></div>
      </header>
      <div className="page-content">{children}</div>
    </main>
  </div>;
}

function PublicHome() {
  const health = useHealthCheck();
  return <div className="landing">
    <header className="landing-nav"><Link href="/" className="brand-lockup"><BrandMark /><span><b>Meridian</b><small>WORKPLACE SYSTEMS</small></span></Link>
      <div className="landing-nav-right"><span className="landing-health"><i className={health.data?.status === 'ok' ? 'live-dot' : 'health-muted'} /> {health.data?.status === 'ok' ? 'Building online' : 'Building intelligence'}</span><Link href="/sign-in" className="text-link">Sign in <ArrowRight size={15} /></Link><Link href="/sign-up" className="landing-cta">Access workspace</Link></div>
    </header>
    <section className="landing-hero">
      <div className="hero-copy fade-in"><div className="eyebrow"><span className="eyebrow-dash" /> SMART OFFICE OPERATIONS / 01</div><h1>A better read<br />on <em>your building.</em></h1>
        <p>Room comfort, energy performance, and the daily rhythm of your office — brought into one clear operating picture.</p>
        <div className="hero-actions"><Link href="/sign-up" className="landing-cta large-cta">Open the workspace <ArrowRight size={16} /></Link><Link href="/sign-in" className="secondary-link">I already have access <ChevronRight size={15} /></Link></div>
        <div className="hero-footnote"><ShieldCheck size={15} /> Built for the people who keep offices working.</div></div>
      <div className="hero-visual fade-in">
        <div className="visual-topline"><span>LIVE BUILDING SNAPSHOT</span><span className="snapshot-time"><i className="live-dot" /> UPDATED JUST NOW</span></div>
        <div className="floor-visual">
          <div className="floor-label floor-label-a">NORTH WING <small>LEVEL 04</small></div>
          <div className="floor-grid">
            <div className="plan-room plan-room-occupied"><small>04.01</small><b>Juniper</b><span>In use</span><div className="room-signal"><i /><i /><i /></div></div>
            <div className="plan-room plan-room-open"><small>04.02</small><b>Huddle 2</b><span>Available</span><div className="room-signal"><i /><i /><i /></div></div>
            <div className="plan-room plan-room-open plan-room-wide"><small>04.03</small><b>Studio</b><span>Comfortable · 21.4°</span><div className="room-signal"><i /><i /><i /></div></div>
            <div className="plan-hall"><span>COMMON SPINE</span><i /><i /><i /></div>
            <div className="plan-room plan-room-booked"><small>04.04</small><b>Library</b><span>Reserved · 10:30</span><div className="room-signal"><i /><i /><i /></div></div>
            <div className="plan-room plan-room-open"><small>04.05</small><b>Focus 1</b><span>Available</span><div className="room-signal"><i /><i /><i /></div></div>
            <div className="plan-room plan-room-occupied plan-room-wide"><small>04.06</small><b>Forum</b><span>Team review · 8 people</span><div className="room-signal"><i /><i /><i /></div></div>
          </div>
          <div className="floor-label floor-label-b">EAST WING <small>LEVEL 04</small></div>
        </div>
         <div className="visual-metrics"><div><span>ENERGY NOW</span><b>11.3 <small>kW</small></b><i className="metric-trend"><ArrowDownRight size={12} /> 6.4%</i></div><div><span>ROOMS IN USE</span><b>04 <small>/ 08</small></b><i className="metric-note">Across 3 zones</i></div><div><span>COMFORT INDEX</span><b>94<small>/100</small></b><i className="metric-note">Within target</i></div></div>
      </div>
      <div className="hero-index">01 <span>—</span> 04</div>
    </section>
    <section className="landing-proof"><div className="proof-head"><div className="eyebrow">OPERATIONS, IN CONTEXT</div><p>Signals that make decisions easier.</p></div>
      <article className="proof-item"><span className="proof-num">01</span><div><Lightbulb size={18} /><h3>Spaces that respond</h3><p>See conditions, availability, and controls together. Make a targeted adjustment without losing the room’s full context.</p></div></article>
      <article className="proof-item"><span className="proof-num">02</span><div><Zap size={18} /><h3>Energy you can explain</h3><p>Follow usage and cost by period, room, and system. Understand where efficiency is improving — and where to look next.</p></div></article>
      <article className="proof-item"><span className="proof-num">03</span><div><Activity size={18} /><h3>Operations with a pulse</h3><p>Meetings, devices, alerts, and automated actions share one dependable view of the workplace.</p></div></article>
    </section>
    <footer className="landing-footer"><Link href="/" className="brand-lockup"><BrandMark /><span><b>Meridian</b><small>WORKPLACE SYSTEMS</small></span></Link><span>SMART OFFICE ENERGY MANAGER</span><span>One building. A clearer picture.</span></footer>
  </div>;
}

function HomeRoute() {
  return <><Show when="signed-in"><DashboardPage /></Show><Show when="signed-out"><PublicHome /></Show></>;
}
function AuthGate({ children }: { children: ReactNode }) {
  return <><Show when="signed-in"><AppShell>{children}</AppShell></Show><Show when="signed-out"><SignedOutGate /></Show></>;
}
function RoleGate({ allowedRoles, children }: { allowedRoles: OfficeRole[]; children: ReactNode }) {
  const { user } = useUser();
  const role = getOfficeRole(user?.publicMetadata?.role);
  if (allowedRoles.includes(role)) return children;
  return <div className="not-found"><div className="eyebrow">ACCESS / RESTRICTED</div><h1>This view is not available for your office role.</h1><p>Ask an administrator to update your office access.</p><Link className="landing-cta" href="/">Return to overview <ArrowRight size={15} /></Link></div>;
}
function SignedOutGate() {
  return <main className="signed-out-gate"><BrandMark /><div className="eyebrow">MERIDIAN / WORKPLACE SYSTEMS</div><h1>Workspace access required</h1><p>Sign in with your office account to access building operations.</p><Link href="/sign-in" className="landing-cta">Continue to sign in <ArrowRight size={15} /></Link><Link href="/" className="secondary-link">Back to overview</Link></main>;
}
function SignInPage() {
  return <div className="auth-stage"><div className="auth-brand"><BrandMark /><div><b>Meridian</b><small>SMART OFFICE ENERGY MANAGER</small></div></div><div className="auth-backdrop"><span /><span /><span /></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}
function SignUpPage() {
  return <div className="auth-stage"><div className="auth-brand"><BrandMark /><div><b>Meridian</b><small>SMART OFFICE ENERGY MANAGER</small></div></div><div className="auth-backdrop"><span /><span /><span /></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function DashboardPage() {
  const query = useGetDashboard();
  const { data, isLoading, isError, refetch } = query;
  if (isLoading) return <LoadingPanel label="Reading building systems" />;
  if (isError || !data) return <ErrorPanel retry={() => void refetch()} />;
  const maxUsage = Math.max(...(data.energySeries ?? []).map((p) => p.actual), 1);
  const openAlerts = (data.alerts ?? []).filter((alert) => !alert.acknowledged);
  const rooms = data.rooms ?? [];
  return <div className="page-stack fade-in">
    <PageTitle eyebrow={`${new Intl.DateTimeFormat('en', { weekday: 'long' }).format(new Date()).toUpperCase()} / OPERATIONS BRIEF`} title="Good morning." description="A live read on the spaces, systems, and people in your office." action={<span className="live-pill"><i className="live-dot" /> Live building data</span>} />
    <section className="metric-grid">
      <MetricCard label="Current demand" value={data.currentKw.toFixed(1)} unit="kW" hint="Building load now" icon={Zap} accent="mint" />
      <MetricCard label="Occupied rooms" value={String(data.occupiedRooms).padStart(2, '0')} unit={`/ ${data.totalRooms}`} hint={`${data.availableRooms} spaces available`} icon={Building2} accent="blue" />
      <MetricCard label="Office temperature" value={data.temperature.toFixed(1)} unit="°C" hint="Average across zones" icon={Thermometer} accent="ochre" />
      <MetricCard label="Energy saved" value={data.savedPercent.toFixed(1)} unit="%" hint={`${data.todayKwh.toFixed(1)} kWh used today`} icon={ArrowDownRight} accent="coral" />
    </section>
    <div className="dashboard-main-grid">
      <section className="panel panel-pad energy-panel"><div className="section-head"><div><div className="eyebrow">ENERGY / TODAY</div><h2>Demand through the day</h2></div><Link href="/energy" className="small-arrow-link">View analysis <ArrowRight size={14} /></Link></div>
        <div className="chart-legend"><span><i className="legend-line legend-current" />Actual</span><span><i className="legend-line legend-baseline" />Baseline</span><b>{data.todayKwh.toFixed(1)} <small>kWh</small></b></div>
        <div className="bar-chart" role="img" aria-label="Hourly energy consumption versus baseline">{(data.energySeries ?? []).map((point, i) => <div key={`${point.label}-${i}`} className="bar-group" data-testid={`bar-energy-${i}`}><div className="bar-columns"><i className="bar-baseline" style={{ height: `${Math.max(8, point.baseline / maxUsage * 100)}%` }} /><i className="bar-actual" style={{ height: `${Math.max(8, point.actual / maxUsage * 100)}%` }} /></div><span>{point.label}</span></div>)}</div>
        <div className="chart-foot"><span><span className="chart-foot-dot" /> Demand running below weekday baseline</span><span className="chart-update">LAST SYNC 2 MIN AGO</span></div>
      </section>
      <section className="panel panel-pad occupancy-panel"><div className="section-head"><div><div className="eyebrow">SPACE UTILIZATION</div><h2>Occupancy today</h2></div><span className="muted-mini">PEOPLE</span></div>
        <div className="occupancy-plot">{(data.occupancySeries ?? []).map((p, i) => <div className="occupancy-column" key={`${p.label}-${i}`}><span>{p.people}</span><i style={{ height: `${Math.max(5, Math.min(100, p.people / Math.max(data.employees, 1) * 100))}%` }} /><small>{p.label}</small></div>)}</div>
        <div className="occupancy-total"><div><b>{data.employees}</b><span>Employees on site</span></div><div className="occupancy-stat"><span>ROOMS ACTIVE</span><b>{data.occupiedRooms}<small> / {data.totalRooms}</small></b></div></div>
      </section>
    </div>
    <div className="dashboard-lower-grid">
      <section className="panel"><div className="panel-heading"><div><div className="eyebrow">ROOM PULSE</div><h2>Spaces to know about</h2></div><Link href="/rooms" className="small-arrow-link">All rooms <ArrowRight size={14} /></Link></div>
        <div className="room-pulse-list">{rooms.slice(0, 5).map((room) => <RoomPulse key={room.id} room={room} />)}</div>
      </section>
      <section className="panel alert-panel"><div className="panel-heading"><div><div className="eyebrow">NEEDS ATTENTION</div><h2>Open alerts <span className="alert-count">{openAlerts.length}</span></h2></div><Link href="/alerts" className="small-arrow-link">Review <ArrowRight size={14} /></Link></div>
        {openAlerts.length ? <div className="alert-preview-list">{openAlerts.slice(0, 3).map((alert) => <div className="alert-preview" key={alert.id}><span className={`severity-mark severity-${alert.severity}`} /><div><b>{alert.message}</b><small>{alert.type} · {relativeTime(alert.createdAt)}</small></div><ChevronRight size={15} /></div>)}</div> : <EmptyState title="All clear" text="No open building alerts right now." />}
      </section>
    </div>
    <section className="panel activity-panel"><div className="panel-heading"><div><div className="eyebrow">SYSTEM ACTIVITY</div><h2>Recent changes</h2></div><span className="muted-mini">LATEST EVENTS</span></div>
      <div className="activity-list">{(data.activity ?? []).slice(0, 4).map((item) => <div className="activity-row" key={item.id}><span className="activity-node"><Activity size={13} /></span><div className="activity-content"><b>{item.action}</b><span>{item.detail}</span></div><span className="activity-actor">{item.actor}</span><time>{relativeTime(item.createdAt)}</time></div>)}</div>
    </section>
  </div>;
}
function MetricCard({ label, value, unit, hint, icon: Icon, accent }: { label: string; value: string; unit: string; hint: string; icon: IconType; accent: string }) {
  return <article className={`panel metric-card metric-${accent}`}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={16} /></span></div><div className="metric-reading"><b className="metric-value">{value}</b><small>{unit}</small></div><div className="metric-hint">{hint}</div></article>;
}
function RoomPulse({ room }: { room: Room }) {
  return <div className="room-pulse-row"><div className={`room-activity-mark ${room.status}`}><Building2 size={15} /></div><div className="room-name-block"><b>{room.name}</b><span>{room.zone} · {room.people}/{room.capacity} people</span></div><div className="room-temp">{room.temperature.toFixed(1)}°<small>C</small></div><StatusBadge value={room.status} /><div className="room-power">{room.energyKw.toFixed(1)} <small>kW</small></div></div>;
}
function relativeTime(value: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
function RoomPage() {
  const { user } = useUser();
  const role = getOfficeRole(user?.publicMetadata?.role);
  const canManageRooms = role !== 'employee';
  const q = useGetRooms();
  const client = useQueryClient();
  const update = useUpdateRoomControls();
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState('all');
  const [edits, setEdits] = useState<Record<string, { brightness: number; temperature: number; mode: string }>>({});
  const rooms = q.data ?? [];
  const zones = Array.from(new Set(rooms.map((room) => room.zone)));
  const filtered = rooms.filter((room) => (zone === 'all' || room.zone === zone) && `${room.name} ${room.zone} ${room.category}`.toLowerCase().includes(search.toLowerCase()));
  function edit(room: Room) { return edits[room.id] ?? { brightness: room.brightness, temperature: room.temperature, mode: room.hvacMode }; }
  function save(room: Room, patch: Record<string, unknown>) {
    update.mutate({ roomId: room.id, data: { ...patch, overrideMinutes: 60 } }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getGetRoomsQueryKey() }); void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); } });
  }
  if (q.isLoading) return <LoadingPanel label="Finding room sensors" />;
  if (q.isError) return <ErrorPanel retry={() => void q.refetch()} />;
  return <div className="page-stack fade-in"><PageTitle eyebrow="SPACE CONTROL / FLOOR 04" title="Rooms & climate" description="Live room conditions with direct, time-limited lighting and HVAC controls." action={<div className="live-pill"><i className="live-dot" /> {rooms.length} connected rooms</div>} />
    <div className="toolbar panel"><label className="search-field"><Search size={16} /><input data-testid="input-room-search" placeholder="Find a room or zone" value={search} onChange={(e) => setSearch(e.target.value)} /></label><div className="filter-controls"><SlidersHorizontal size={15} /><select data-testid="select-room-zone" value={zone} onChange={(e) => setZone(e.target.value)}><option value="all">All zones</option>{zones.map((z) => <option value={z} key={z}>{z}</option>)}</select><span className="toolbar-separator" /><span className="muted-mini">{filtered.length} SPACES</span></div></div>
    <div className="room-grid">{filtered.map((room) => {
      const values = edit(room);
      return <article className="panel room-card" key={room.id} data-testid={`card-room-${room.id}`}><div className="room-card-head"><div><span className="room-category">{room.zone} <i /> {room.category}</span><h2>{room.name}</h2></div><StatusBadge value={room.status} /></div>
        {room.currentMeeting && <div className="current-meeting"><CalendarDays size={13} /><span>{room.currentMeeting}</span></div>}
        <div className="room-stats"><div><Thermometer size={14} /><b>{room.temperature.toFixed(1)}°</b><small>temp</small></div><div><span className="humidity-icon">RH</span><b>{room.humidity}%</b><small>humidity</small></div><div><Users size={14} /><b>{room.people}<small>/{room.capacity}</small></b><small>occupancy</small></div><div><Zap size={14} /><b>{room.energyKw.toFixed(1)}</b><small>kW</small></div></div>
         {canManageRooms ? <><div className="control-section"><div className="control-heading"><Lightbulb size={15} /><b>Lighting</b><span className="control-spacer" /><button className={`toggle ${room.lightsOn ? 'toggle-on' : ''}`} role="switch" aria-checked={room.lightsOn} aria-label={`Toggle lights in ${room.name}`} data-testid={`toggle-light-${room.id}`} onClick={() => save(room, { lightsOn: !room.lightsOn })}><i /></button></div>
          <div className="range-row"><input aria-label={`${room.name} brightness`} data-testid={`range-brightness-${room.id}`} type="range" min="0" max="100" value={values.brightness} onChange={(e) => setEdits((old) => ({ ...old, [room.id]: { ...edit(room), brightness: Number(e.target.value) } }))} /><span>{values.brightness}%</span></div>
        </div>
        <div className="control-section"><div className="control-heading"><Wind size={15} /><b>Climate</b><span className="control-spacer" /><select aria-label={`${room.name} HVAC mode`} data-testid={`select-hvac-${room.id}`} value={values.mode} onChange={(e) => setEdits((old) => ({ ...old, [room.id]: { ...edit(room), mode: e.target.value } }))}><option value="auto">Auto</option><option value="comfort">Comfort</option><option value="eco">Eco</option><option value="off">Off</option></select></div>
          <div className="temp-adjust"><button aria-label={`Lower ${room.name} setpoint`} onClick={() => setEdits((old) => ({ ...old, [room.id]: { ...values, temperature: Math.max(18, values.temperature - 0.5) } }))}>−</button><span>{values.temperature.toFixed(1)}°C target</span><button aria-label={`Raise ${room.name} setpoint`} onClick={() => setEdits((old) => ({ ...old, [room.id]: { ...values, temperature: Math.min(30, values.temperature + 0.5) } }))}>+</button><Button variant="quiet" disabled={update.isPending} className="apply-control" testId={`button-apply-room-${room.id}`} onClick={() => save(room, { brightness: values.brightness, temperature: values.temperature, hvacMode: values.mode, lightsOn: room.lightsOn })}>{update.isPending ? 'Saving…' : 'Apply 1h override'}</Button></div>
          </div>{room.overrideUntil && <div className="override-note"><Clock3 size={12} /> Manual override until {new Date(room.overrideUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>}</> : <div className="footnote"><ShieldCheck size={14} /> View-only room access. Contact a manager to change controls.</div>}</article>;
    })}</div>{filtered.length === 0 && <EmptyState title="No matching rooms" text="Try another zone or search term." />}
  </div>;
}

function MeetingsPage() {
  const { user } = useUser();
  const role = getOfficeRole(user?.publicMetadata?.role);
  const canCancelBookings = role === 'admin' || role === 'facility_manager';
  const roomsQuery = useGetRooms();
  const bookingsQuery = useGetBookings();
  const client = useQueryClient();
  const create = useCreateBooking();
  const cancel = useCancelBooking();
  const [showForm, setShowForm] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
  const [capacity, setCapacity] = useState(1);
  const [notice, setNotice] = useState('');
  const now = new Date();
  const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [form, setForm] = useState({ title: '', roomId: '', organizer: '', attendees: '4', startsAt: localInput(new Date(now.getTime() + 30 * 60_000)), endsAt: localInput(new Date(now.getTime() + 90 * 60_000)), equipment: '' });
  const rooms = roomsQuery.data ?? [];
  const bookings = bookingsQuery.data ?? [];
  const recommended = rooms.filter((room) => room.capacity >= capacity && room.status !== 'maintenance' && room.status !== 'offline' && `${room.name} ${room.zone} ${room.category}`.toLowerCase().includes(roomSearch.toLowerCase())).sort((a, b) => Number(a.status !== 'available') - Number(b.status !== 'available'));
  const activeBookings = bookings.filter((booking) => new Date(booking.endsAt) > new Date()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  function submit(event: FormEvent) {
    event.preventDefault();
    const room = rooms.find((item) => item.id === form.roomId);
    if (!room) { setNotice('Choose an available room before booking.'); return; }
    create.mutate({ data: { title: form.title, roomId: room.id, organizer: form.organizer, attendees: Number(form.attendees), startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(), equipment: form.equipment.split(',').map((s) => s.trim()).filter(Boolean) } }, {
      onSuccess: () => { setShowForm(false); setNotice('Room booking created.'); void client.invalidateQueries({ queryKey: getGetBookingsQueryKey() }); void client.invalidateQueries({ queryKey: getGetRoomsQueryKey() }); void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); },
      onError: () => setNotice('Booking could not be created. Please review the room and times.'),
    });
  }
  if (roomsQuery.isLoading || bookingsQuery.isLoading) return <LoadingPanel label="Checking room availability" />;
  if (roomsQuery.isError || bookingsQuery.isError) return <ErrorPanel retry={() => { void roomsQuery.refetch(); void bookingsQuery.refetch(); }} />;
  return <div className="page-stack fade-in"><PageTitle eyebrow="ROOM DISCOVERY / SCHEDULING" title="Meetings" description="Find the right space, check availability, and manage upcoming room bookings." action={<Button testId="button-new-booking" onClick={() => { setNotice(''); setShowForm(!showForm); }}>{showForm ? <X size={15} /> : <Plus size={15} />}{showForm ? 'Close form' : 'Book a room'}</Button>} />
    {notice && <div className="inline-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={14} /></button></div>}
    {showForm && <form onSubmit={submit} className="panel booking-form"><div className="form-heading"><div><div className="eyebrow">NEW RESERVATION</div><h2>Book a meeting room</h2></div><span className="muted-mini">TIMES ARE LOCAL</span></div>
      <div className="form-grid"><label>Meeting title<input required maxLength={120} data-testid="input-booking-title" placeholder="e.g. Product planning" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label>Organizer<input required maxLength={120} data-testid="input-booking-organizer" placeholder="Name" value={form.organizer} onChange={(e) => setForm({ ...form, organizer: e.target.value })} /></label><label>Attendees<input type="number" min="1" max="100" data-testid="input-booking-attendees" value={form.attendees} onChange={(e) => { setForm({ ...form, attendees: e.target.value }); setCapacity(Number(e.target.value) || 1); }} /></label><label>Choose room<select required data-testid="select-booking-room" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}><option value="">Select an available room</option>{recommended.filter((r) => r.status === 'available').map((r) => <option key={r.id} value={r.id}>{r.name} · {r.zone} · {r.capacity} seats</option>)}</select></label><label>Starts<input type="datetime-local" required data-testid="input-booking-start" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label><label>Ends<input type="datetime-local" required data-testid="input-booking-end" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label><label className="form-span">Equipment (comma separated)<input data-testid="input-booking-equipment" placeholder="Video conferencing, whiteboard" value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} /></label></div>
      <div className="form-actions"><Button type="submit" disabled={create.isPending} testId="button-submit-booking">{create.isPending ? 'Booking…' : 'Confirm booking'} <ArrowRight size={15} /></Button></div>
    </form>}
    <section className="meeting-discovery"><div className="section-head"><div><div className="eyebrow">ROOM FINDER</div><h2>Spaces for your team</h2></div><div className="finder-filters"><label className="search-field"><Search size={14} /><input data-testid="input-meeting-search" placeholder="Search rooms" value={roomSearch} onChange={(e) => setRoomSearch(e.target.value)} /></label><label className="attendee-filter"><Users size={14} /><input aria-label="Minimum room capacity" type="number" min="1" value={capacity} onChange={(e) => setCapacity(Number(e.target.value) || 1)} /><span>seats</span></label></div></div>
      <div className="meeting-room-grid">{recommended.slice(0, 4).map((room) => <article className="panel meeting-room" key={room.id}><div className={`room-availability ${room.status}`}><Building2 size={17} /></div><div className="meeting-room-info"><span className="room-category">{room.zone} · {room.category}</span><h3>{room.name}</h3><span>{room.capacity} seats <i /> {room.temperature.toFixed(1)}°C</span></div><div className="meeting-room-right"><StatusBadge value={room.status} /><Button variant="outline" className="compact-btn" disabled={room.status !== 'available'} onClick={() => { setForm({ ...form, roomId: room.id }); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Select</Button></div></article>)}</div>
      {recommended.length === 0 && <EmptyState title="No rooms fit that search" text="Change the room name or reduce the attendee count." />}
    </section>
    <section className="panel meeting-list"><div className="panel-heading"><div><div className="eyebrow">UPCOMING</div><h2>Room bookings</h2></div><span className="muted-mini">{activeBookings.length} SCHEDULED</span></div>
      {activeBookings.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>MEETING</th><th>ROOM</th><th>WHEN</th><th>ATTENDEES</th><th>STATUS</th><th /></tr></thead><tbody>{activeBookings.map((booking) => <BookingRow key={booking.id} booking={booking} cancel={() => {
       if (canCancelBookings && window.confirm(`Cancel “${booking.title}”?`)) cancel.mutate({ bookingId: booking.id }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getGetBookingsQueryKey() }); void client.invalidateQueries({ queryKey: getGetRoomsQueryKey() }); void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); } });
       }} pending={cancel.isPending} canCancel={canCancelBookings} />)}</tbody></table></div> : <EmptyState title="No upcoming bookings" text="A quiet calendar. Book a room whenever you need one." />}
    </section>
  </div>;
}
function BookingRow({ booking, cancel, pending, canCancel }: { booking: Booking; cancel: () => void; pending: boolean; canCancel: boolean }) {
  return <tr data-testid={`row-booking-${booking.id}`}><td><div className="table-primary">{booking.title}</div><small>{booking.organizer}</small></td><td>{booking.roomName}</td><td><div className="table-primary">{new Date(booking.startsAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</div><small>{new Date(booking.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–{new Date(booking.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></td><td>{booking.attendees}</td><td><StatusBadge value={booking.status} /></td><td>{canCancel && <Button variant="quiet" className="table-action" disabled={pending} onClick={cancel}>Cancel</Button>}</td></tr>;
}

function DevicesPage() {
  const q = useGetDevices();
  const client = useQueryClient();
  const mutation = useUpdateDevice();
  const [filter, setFilter] = useState('all');
  const devices = q.data ?? [];
  const filtered = devices.filter((device) => filter === 'all' || device.state === filter);
  const activePower = devices.filter((device) => device.state === 'on').reduce((sum, device) => sum + device.watts, 0);
  if (q.isLoading) return <LoadingPanel label="Connecting to office equipment" />;
  if (q.isError) return <ErrorPanel retry={() => void q.refetch()} />;
  const nextState = (state: string) => state === 'on' ? 'standby' : 'on';
  return <div className="page-stack fade-in"><PageTitle eyebrow="CONNECTED EQUIPMENT / OPERATIONS" title="Devices" description="Review connected equipment and make a controlled power-state change." action={<span className="live-pill"><i className="live-dot" /> {devices.length} devices connected</span>} />
    <div className="device-summary-row"><div className="panel device-summary"><span className="summary-icon"><Cpu size={17} /></span><div><small>CONNECTED EQUIPMENT</small><b>{devices.length} <span>devices</span></b></div></div><div className="panel device-summary"><span className="summary-icon summary-icon-mint"><PlugZap size={17} /></span><div><small>ACTIVE DEVICE LOAD</small><b>{(activePower / 1000).toFixed(2)} <span>kW</span></b></div></div><div className="panel device-summary"><span className="summary-icon summary-icon-ochre"><ShieldCheck size={17} /></span><div><small>ESSENTIAL DEVICES</small><b>{devices.filter((d) => d.essential).length} <span>protected</span></b></div></div></div>
    <section className="panel equipment-panel"><div className="panel-heading"><div><div className="eyebrow">OFFICE EQUIPMENT</div><h2>Device inventory</h2></div><label className="select-filter"><SlidersHorizontal size={14} /><select data-testid="select-device-state" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All states</option><option value="on">On</option><option value="standby">Standby</option><option value="off">Off</option><option value="offline">Offline</option><option value="maintenance">Maintenance</option></select></label></div>
      {filtered.length ? <div className="table-scroll"><table className="data-table device-table"><thead><tr><th>EQUIPMENT</th><th>LOCATION</th><th>CATEGORY</th><th>POWER</th><th>STATE</th><th>LAST CHANGE</th><th /></tr></thead><tbody>{filtered.map((device) => <tr key={device.id} data-testid={`row-device-${device.id}`}><td><div className="device-name"><span className="device-glyph"><Monitor size={15} /></span><div><b>{device.name}</b>{device.essential && <small className="essential-label"><ShieldCheck size={11} /> ESSENTIAL</small>}</div></div></td><td>{device.roomName}</td><td>{device.category}</td><td className="mono">{device.watts} W</td><td><StatusBadge value={device.state} /></td><td>{relativeTime(device.updatedAt)}</td><td><Button variant={device.state === 'on' ? 'quiet' : 'outline'} className="compact-btn" disabled={mutation.isPending || ['offline', 'maintenance'].includes(device.state)} testId={`button-device-${device.id}`} onClick={() => mutation.mutate({ deviceId: device.id, data: { state: nextState(device.state) as 'on' | 'off' | 'standby', overrideMinutes: 60 } }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getGetDevicesQueryKey() }); void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); } })}>{device.state === 'on' ? <><Power size={13} /> Standby</> : <><Power size={13} /> Turn on</>}</Button></td></tr>)}</tbody></table></div> : <EmptyState title="No equipment in this state" text="Change the filter to see other connected devices." />}
    </section><div className="footnote"><ShieldCheck size={14} /> Device overrides expire automatically after one hour. Essential equipment is marked and should remain available.</div>
  </div>;
}

function EnergyPage() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const q = useGetEnergy({ period }, { query: { queryKey: getGetEnergyQueryKey({ period }) } });
  const data = q.data as EnergyAnalytics | undefined;
  if (q.isLoading) return <LoadingPanel label="Calculating energy performance" />;
  if (q.isError || !data) return <ErrorPanel retry={() => void q.refetch()} />;
  const chartMax = Math.max(...data.series.map((p) => Math.max(p.actual, p.baseline)), 1);
  const roomMax = Math.max(...data.byRoom.map((r) => r.kwh), 1);
  const periodLabel = period === 'day' ? 'today' : period === 'week' ? 'this week' : 'this month';
  const breakdownTotal = data.breakdown.lighting + data.breakdown.hvac + data.breakdown.equipment || 1;
  return <div className="page-stack fade-in"><PageTitle eyebrow="ENERGY INTELLIGENCE / PERFORMANCE" title="Energy" description="Consumption, cost, and savings—filtered to the period that matters." action={<div className="segmented" role="group" aria-label="Analytics period">{(['day', 'week', 'month'] as const).map((value) => <button key={value} data-testid={`button-period-${value}`} className={period === value ? 'segment-active' : ''} onClick={() => setPeriod(value)}>{value === 'day' ? 'Day' : value === 'week' ? 'Week' : 'Month'}</button>)}</div>} />
     <section className="energy-kpi-grid"><MetricCard label="Energy consumed" value={data.totalKwh.toLocaleString(undefined, { maximumFractionDigits: 1 })} unit="kWh" hint={`Across the building ${periodLabel}`} icon={Zap} accent="mint" /><MetricCard label="Estimated cost" value={new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(data.cost)} unit="" hint={`At ₹${data.tariff.toFixed(3)} / kWh`} icon={Gauge} accent="blue" /><MetricCard label="Peak demand" value={data.peakKw.toFixed(1)} unit="kW" hint="Maximum recorded load" icon={ArrowUpRight} accent="ochre" /><MetricCard label="Below baseline" value={data.savedPercent.toFixed(1)} unit="%" hint="Estimated energy saved" icon={ArrowDownRight} accent="coral" /></section>
    <div className="energy-detail-grid"><section className="panel panel-pad large-energy-chart"><div className="section-head"><div><div className="eyebrow">USAGE TREND / {period.toUpperCase()}</div><h2>Actual against baseline</h2></div><div className="chart-legend"><span><i className="legend-line legend-current" />Actual</span><span><i className="legend-line legend-baseline" />Baseline</span></div></div>
      <div className="large-chart">{data.series.map((point, i) => <div className="large-chart-group" key={`${point.label}-${i}`}><div className="large-chart-bars"><i className="large-baseline" style={{ height: `${Math.max(3, point.baseline / chartMax * 100)}%` }} /><i className="large-actual" style={{ height: `${Math.max(3, point.actual / chartMax * 100)}%` }} /></div><span>{point.label}</span></div>)}</div><div className="chart-y-labels"><span>{chartMax.toFixed(0)} kWh</span><span>0</span></div>
      <div className="chart-foot"><span><span className="chart-foot-dot" /> {data.savedPercent.toFixed(1)}% lower than baseline</span><span className="chart-update">TARIFF ${data.tariff.toFixed(3)} / KWH</span></div>
    </section><section className="panel panel-pad breakdown-panel"><div className="eyebrow">ENERGY MIX</div><h2>By system</h2><p className="section-subcopy">Share of total usage {periodLabel}.</p>
      <div className="donut-wrap"><div className="donut-chart" style={{ background: `conic-gradient(#326d58 0 ${(data.breakdown.lighting / breakdownTotal) * 100}%, #c79643 ${(data.breakdown.lighting / breakdownTotal) * 100}% ${((data.breakdown.lighting + data.breakdown.hvac) / breakdownTotal) * 100}%, #728c9d ${((data.breakdown.lighting + data.breakdown.hvac) / breakdownTotal) * 100}% 100%)` }}><div><b>{data.totalKwh.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b><small>kWh total</small></div></div></div>
      <div className="breakdown-list"><BreakdownRow label="Lighting" amount={data.breakdown.lighting} total={breakdownTotal} color="green" /><BreakdownRow label="HVAC" amount={data.breakdown.hvac} total={breakdownTotal} color="ochre" /><BreakdownRow label="Equipment" amount={data.breakdown.equipment} total={breakdownTotal} color="slate" /></div>
    </section></div>
    <section className="panel room-energy-panel"><div className="panel-heading"><div><div className="eyebrow">ENERGY BY SPACE</div><h2>Highest-consuming rooms</h2></div><span className="muted-mini">KWH / {period.toUpperCase()}</span></div>
      {data.byRoom.length ? <div className="room-energy-list">{data.byRoom.map((room) => <div className="room-energy-row" key={room.roomId}><span className="room-energy-name">{room.roomName}</span><div className="room-energy-track"><i style={{ width: `${room.kwh / roomMax * 100}%` }} /></div><b>{room.kwh.toLocaleString(undefined, { maximumFractionDigits: 1 })}<small> kWh</small></b></div>)}</div> : <EmptyState title="No room data yet" text="Energy by room will appear once usage is recorded." />}
    </section>
  </div>;
}
function BreakdownRow({ label, amount, total, color }: { label: string; amount: number; total: number; color: string }) {
  return <div className="breakdown-row"><span className={`breakdown-dot ${color}`} /><span>{label}</span><b>{(amount / total * 100).toFixed(0)}%</b><small>{amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh</small></div>;
}

function AutomationPage() {
  const q = useGetAutomation();
  const roomsQuery = useGetRooms();
  const client = useQueryClient();
  const update = useUpdateAutomation();
  const run = useRunSimulatorAction();
  const [selectedRoom, setSelectedRoom] = useState('');
  const snapshot = q.data;
  const rooms = roomsQuery.data ?? [];
  if (q.isLoading) return <LoadingPanel label="Reading automation state" />;
  if (q.isError || !snapshot) return <ErrorPanel retry={() => void q.refetch()} />;
  const runAction = (action: 'start' | 'stop' | 'reset' | 'occupancy' | 'meeting' | 'high-energy' | 'sensor-failure') => {
    run.mutate({ data: { action, ...(selectedRoom ? { roomId: selectedRoom } : {}) } }, { onSuccess: () => {
      void client.invalidateQueries({ queryKey: getGetAutomationQueryKey() });
      void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      void client.invalidateQueries({ queryKey: getGetRoomsQueryKey() });
      void client.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
    } });
  };
  return <div className="page-stack fade-in"><PageTitle eyebrow="BUILDING INTELLIGENCE / CONTROLS" title="Automation" description="Set the building-wide automatic-control posture and safely exercise response scenarios." action={<span className={`mode-pill ${snapshot.enabled ? 'mode-live' : 'mode-paused'}`}><i /> AUTOMATION {snapshot.enabled ? 'ACTIVE' : 'PAUSED'}</span>} />
    <section className="panel automation-status"><div className="automation-emblem"><Sparkles size={22} /></div><div className="automation-description"><div className="eyebrow">AUTOMATIC CONTROL</div><h2>{snapshot.enabled ? 'Building automation is on' : 'Building automation is paused'}</h2><p>{snapshot.enabled ? 'Rules can make small, context-aware adjustments across the office.' : 'Rooms will maintain their current settings until automation resumes.'}</p></div>
      <div className="automation-toggle-wrap"><span>{snapshot.enabled ? 'Enabled' : 'Paused'}</span><button role="switch" aria-checked={snapshot.enabled} aria-label="Toggle building automation" data-testid="toggle-automation" className={`toggle toggle-large ${snapshot.enabled ? 'toggle-on' : ''}`} disabled={update.isPending} onClick={() => update.mutate({ data: { enabled: !snapshot.enabled } }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getGetAutomationQueryKey() }); void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); } })}><i /></button></div>
    </section>
    <div className="automation-grid"><section className="panel rules-panel"><div className="panel-heading"><div><div className="eyebrow">CONTROL LOGIC</div><h2>Active rules</h2></div><span className="muted-mini">{snapshot.rules.filter((r) => r.enabled).length} / {snapshot.rules.length} RUNNING</span></div>
      {snapshot.rules.length ? <div className="rules-list">{snapshot.rules.map((rule, index) => <div className="rule-row" key={rule.id}><span className={`rule-index ${rule.enabled && snapshot.enabled ? 'rule-index-active' : ''}`}>{String(index + 1).padStart(2, '0')}</span><div className="rule-copy"><b>{rule.name}</b><p>{rule.description}</p></div><StatusBadge value={rule.enabled && snapshot.enabled ? 'enabled' : 'paused'} /></div>)}</div> : <EmptyState title="No automation rules configured" text="Your building has no active rules to display." />}
    </section><section className="panel simulator-panel"><div className="panel-heading"><div><div className="eyebrow">SIMULATOR / TEST ENVIRONMENT</div><h2>Run a scenario</h2></div><span className={`simulator-state ${snapshot.simulationRunning ? 'sim-running' : ''}`}><i />{snapshot.simulationRunning ? 'RUNNING' : 'IDLE'}</span></div><p className="section-subcopy">Exercise system responses using a simulated office event. Changes are reflected in the live operations views.</p>
      <label className="sim-room-select">ROOM CONTEXT<select data-testid="select-simulator-room" value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}><option value="">Use building default</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name} · {room.zone}</option>)}</select></label>
      <div className="sim-primary-actions"><Button variant={snapshot.simulationRunning ? 'danger' : 'primary'} disabled={run.isPending} testId="button-sim-start-stop" onClick={() => runAction(snapshot.simulationRunning ? 'stop' : 'start')}><Power size={14} />{snapshot.simulationRunning ? 'Stop simulation' : 'Start simulation'}</Button><Button variant="outline" disabled={run.isPending} testId="button-sim-reset" onClick={() => runAction('reset')}><RefreshCw size={14} /> Reset state</Button></div>
      <div className="scenario-label">TRIGGER AN EVENT</div><div className="scenario-list"><ScenarioButton icon={Users} title="Occupancy change" description="Simulate a room filling up" action={() => runAction('occupancy')} disabled={run.isPending} /><ScenarioButton icon={CalendarDays} title="Meeting begins" description="Start a room booking scenario" action={() => runAction('meeting')} disabled={run.isPending} /><ScenarioButton icon={Zap} title="High energy use" description="Raise a demand alert" action={() => runAction('high-energy')} disabled={run.isPending} /><ScenarioButton icon={AlertTriangle} title="Sensor failure" description="Test fault response" action={() => runAction('sensor-failure')} disabled={run.isPending} /></div>
    </section></div><div className="footnote"><ShieldCheck size={14} /> Rules are displayed from the building configuration. Changes to rule definitions are managed at the automation service.</div>
  </div>;
}
function ScenarioButton({ icon: Icon, title, description, action, disabled }: { icon: IconType; title: string; description: string; action: () => void; disabled: boolean }) {
  return <button className="scenario-button" disabled={disabled} onClick={action}><span className="scenario-icon"><Icon size={15} /></span><span><b>{title}</b><small>{description}</small></span><ChevronRight size={14} /></button>;
}

function AlertsPage() {
  const q = useGetAlerts();
  const client = useQueryClient();
  const ack = useAcknowledgeAlert();
  const [filter, setFilter] = useState<'all' | 'open' | 'acknowledged'>('open');
  const alerts = q.data ?? [];
  const visible = alerts.filter((alert) => filter === 'all' || (filter === 'open' ? !alert.acknowledged : alert.acknowledged)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (q.isLoading) return <LoadingPanel label="Reviewing system alerts" />;
  if (q.isError) return <ErrorPanel retry={() => void q.refetch()} />;
  const counts = { open: alerts.filter((a) => !a.acknowledged).length, critical: alerts.filter((a) => a.severity === 'critical' && !a.acknowledged).length, acknowledged: alerts.filter((a) => a.acknowledged).length };
  return <div className="page-stack fade-in"><PageTitle eyebrow="SYSTEM HEALTH / RESPONSE QUEUE" title="Alerts" description="Prioritized building signals with a clear path to acknowledge and move on." action={<span className="live-pill"><i className="live-dot" /> Monitoring active</span>} />
    <div className="alert-kpi-row"><div className="panel alert-kpi"><span className="alert-kpi-icon alert-icon-red"><AlertTriangle size={16} /></span><div><small>OPEN ALERTS</small><b>{counts.open}</b></div></div><div className="panel alert-kpi"><span className="alert-kpi-icon alert-icon-amber"><Activity size={16} /></span><div><small>CRITICAL</small><b>{counts.critical}</b></div></div><div className="panel alert-kpi"><span className="alert-kpi-icon alert-icon-green"><Check size={16} /></span><div><small>ACKNOWLEDGED</small><b>{counts.acknowledged}</b></div></div></div>
    <section className="panel alerts-panel"><div className="panel-heading"><div><div className="eyebrow">BUILDING EVENT LOG</div><h2>Alert review</h2></div><div className="segmented small-segment" role="group" aria-label="Alert filter">{(['open', 'all', 'acknowledged'] as const).map((value) => <button key={value} data-testid={`button-alert-filter-${value}`} className={filter === value ? 'segment-active' : ''} onClick={() => setFilter(value)}>{value === 'open' ? `Open ${counts.open}` : value === 'acknowledged' ? 'Resolved' : 'All events'}</button>)}</div></div>
      {visible.length ? <div className="alerts-list">{visible.map((alert) => <article className={`alert-row ${alert.acknowledged ? 'alert-row-done' : ''}`} key={alert.id} data-testid={`alert-${alert.id}`}><span className={`alert-severity-block severity-${alert.severity}`}><AlertTriangle size={17} /></span><div className="alert-main"><div className="alert-title-line"><StatusBadge value={alert.severity} /><span className="alert-type">{alert.type}</span></div><h3>{alert.message}</h3><div className="alert-meta">{alert.roomId && <span><Building2 size={12} /> {alert.roomId}</span>}<span><Clock3 size={12} /> {new Date(alert.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div></div><div className="alert-row-action">{alert.acknowledged ? <span className="acknowledged-label"><Check size={14} /> Acknowledged</span> : <Button variant="outline" disabled={ack.isPending} testId={`button-ack-${alert.id}`} onClick={() => ack.mutate({ alertId: alert.id }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getGetAlertsQueryKey() }); void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); } })}><Check size={14} /> Acknowledge</Button>}</div></article>)}</div> : <EmptyState title={filter === 'open' ? 'No open alerts' : 'Nothing to show'} text={filter === 'open' ? 'No active signals need your attention.' : 'Try another filter to review building events.'} />}
    </section><div className="footnote"><CircleHelp size={14} /> Acknowledging an alert records that it has been reviewed. It does not alter room or device controls.</div>
  </div>;
}

function HomeRedirect() {
  return <><Show when="signed-in"><DashboardPage /></Show><Show when="signed-out"><PublicHome /></Show></>;
}
function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access building operations' } }, signUp: { start: { title: 'Get your office online', subtitle: 'Create your Meridian workspace account' } } }}
    routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><ClerkQueryClientCacheInvalidator />
      <Switch>
        <Route path="/" component={() => <><Show when="signed-in"><AppShell><HomeRedirect /></AppShell></Show><Show when="signed-out"><PublicHome /></Show></>} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/rooms" component={() => <AuthGate><RoomPage /></AuthGate>} />
        <Route path="/meetings" component={() => <AuthGate><MeetingsPage /></AuthGate>} />
        <Route path="/devices" component={() => <AuthGate><RoleGate allowedRoles={['admin', 'facility_manager']}><DevicesPage /></RoleGate></AuthGate>} />
        <Route path="/energy" component={() => <AuthGate><RoleGate allowedRoles={['admin', 'facility_manager', 'manager']}><EnergyPage /></RoleGate></AuthGate>} />
        <Route path="/automation" component={() => <AuthGate><RoleGate allowedRoles={['admin', 'facility_manager']}><AutomationPage /></RoleGate></AuthGate>} />
        <Route path="/alerts" component={() => <AuthGate><RoleGate allowedRoles={['admin', 'facility_manager', 'manager']}><AlertsPage /></RoleGate></AuthGate>} />
        <Route component={() => <AuthGate><div className="not-found"><div className="eyebrow">404 / NO SUCH VIEW</div><h1>We can’t find that page.</h1><Link className="landing-cta" href="/">Return to overview <ArrowRight size={15} /></Link></div></AuthGate>} />
      </Switch>
    </QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}

export default App;
