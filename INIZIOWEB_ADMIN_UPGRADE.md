# InizioWeb Admin — Production Upgrade

> Context note (necessary): the shipped project is a **TanStack Start web app on Cloudflare Workers**, not an Electron app. All changes below target that codebase. Auth (Supabase + TOTP MFA) is **reused, not reimplemented**. Endpoints for inbox + campaigns are **connected as assumed-existing** (Supabase tables / Resend edge functions).

---

## 1. Implementation Plan

1. Add scoped iOS-26 glass design tokens (`.iw` layer, blue/purple/black) — non-destructive, appended to `styles.css`.
2. Refactor `admin-dashboard.tsx` auth gate to render a new `<AdminShell/>` when authorized; keep the existing auth-gate + MFA logic untouched.
3. New shell = frosted sidebar + view router (`dashboard | email | inboxes | hosting | settings`), no new route (still `/admin`).
4. New glass login card `AdminLoginGlass.tsx` reusing every handler from `lib/admin-auth.ts`.
5. Views: `DashboardView` (reuses exported `StackHero` + service cards), `EmailSendingView`, `InboxesView` (new), `HostingStackView`, `SettingsView`.
6. Data layers: `lib/inboxes.ts` (Supabase table + realtime), `lib/email-campaigns.ts` (Resend via edge function).
7. Export `StackHero` + `fetchAllStatuses` from `admin-dashboard.tsx` for reuse.

### File-level change map
```
A  src/components/admin/AdminShell.tsx
A  src/components/admin/AdminSidebar.tsx
A  src/components/admin/AdminLoginGlass.tsx
A  src/components/admin/views/DashboardView.tsx
A  src/components/admin/views/EmailSendingView.tsx
A  src/components/admin/views/InboxesView.tsx
A  src/components/admin/views/HostingStackView.tsx
A  src/components/admin/views/SettingsView.tsx
A  src/components/admin/glass.tsx        (shared Glass primitives)
A  src/lib/inboxes.ts
A  src/lib/email-campaigns.ts
M  src/components/admin-dashboard.tsx    (export hero/statuses; render AdminShell; swap login)
M  src/styles.css                        (append .iw glass tokens)
```

---

## 2. UI Spec

**Aesthetic:** iOS-26 frosted glass. Backdrop `blur(28px)`, layered translucency, soft inner + drop shadow, 1px hairline top-light border. Palette: base `#07070c`, glass `rgba(255,255,255,.045)`, accent gradient `#5b8cff → #a86bff`, success `#3ddc97`, warn `#f5b950`, danger `#ff6b6b`. Radius scale `16 / 22 / 28`. Spacing unit `4px` (gap tokens 12/16/24/32). Type: `Sora` (display), `Manrope` (body), `ui-monospace` (metrics).

**Login:** centered `420px` glass card on animated aurora backdrop; fade+blur mount (`iwFade` 480ms). Credentials → TOTP step (unchanged flow).

**Shell:** fixed `248px` frosted sidebar (logo, nav, operator footer w/ sign-out) + scrollable content. Nav items: Dashboard, Email Sending, Inboxes, Hosting Stack, Settings. Active item = accent-gradient pill + glow. View switch = 240ms fade/slide.

**Dashboard:** 3D orbital hero (reused canvas) + service cards + ops strip.
**Email Sending:** 3-pane — template list · composer (recipients chips, subject, body) · live preview + Send/track.
**Inboxes:** connected inbox selector + card list of messages, realtime badge, read/unread, preview pane.
**Hosting Stack:** full-width service telemetry grid (reuses status fetchers).
**Settings:** account, MFA state, admin roster (read-only from `admin_users`).

---

## 3. Files

### /src/styles.css  (append)
```css
/* ===== InizioWeb admin · iOS-26 glass layer (scoped to .iw) ===== */
.iw {
  --iw-bg: #07070c;
  --iw-glass: rgba(255, 255, 255, 0.045);
  --iw-glass-2: rgba(255, 255, 255, 0.07);
  --iw-border: rgba(255, 255, 255, 0.12);
  --iw-hair: rgba(255, 255, 255, 0.22);
  --iw-text: #f4f5fb;
  --iw-muted: rgba(244, 245, 251, 0.62);
  --iw-accent: #5b8cff;
  --iw-accent-2: #a86bff;
  --iw-grad: linear-gradient(135deg, #5b8cff 0%, #a86bff 100%);
  --iw-ok: #3ddc97;
  --iw-warn: #f5b950;
  --iw-bad: #ff6b6b;
  --iw-r-sm: 16px;
  --iw-r-md: 22px;
  --iw-r-lg: 28px;
  --iw-blur: saturate(140%) blur(28px);
  --iw-shadow: 0 24px 60px -24px rgba(0, 0, 0, 0.65), inset 0 1px 0 var(--iw-hair);
  color: var(--iw-text);
}
.iw-glass {
  background: var(--iw-glass);
  border: 1px solid var(--iw-border);
  border-radius: var(--iw-r-lg);
  backdrop-filter: var(--iw-blur);
  -webkit-backdrop-filter: var(--iw-blur);
  box-shadow: var(--iw-shadow);
}
.iw-grad-text {
  background: var(--iw-grad);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.iw-aurora::before {
  content: "";
  position: fixed;
  inset: -20% -10% auto -10%;
  height: 70vh;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(40% 55% at 25% 20%, rgba(91, 140, 255, 0.35), transparent 70%),
    radial-gradient(45% 60% at 80% 10%, rgba(168, 107, 255, 0.3), transparent 70%),
    radial-gradient(50% 50% at 50% 90%, rgba(59, 90, 200, 0.22), transparent 70%);
  filter: blur(40px);
  animation: iwDrift 18s ease-in-out infinite alternate;
}
@keyframes iwDrift { from { transform: translate3d(0,0,0) } to { transform: translate3d(0,-4%,0) scale(1.05) } }
@keyframes iwFade { from { opacity: 0; transform: translateY(12px); filter: blur(8px) } to { opacity: 1; transform: none; filter: none } }
.iw-fade { animation: iwFade 0.48s cubic-bezier(0.22, 1, 0.36, 1) both; }
.iw-scroll::-webkit-scrollbar { width: 8px }
.iw-scroll::-webkit-scrollbar-thumb { background: var(--iw-border); border-radius: 8px }
```

### /src/components/admin/glass.tsx
```tsx
import type { ReactNode } from "react";
import { clsx } from "clsx";

export function Glass({
  className,
  children,
  as: Tag = "div",
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "article" | "aside" | "header";
}) {
  return <Tag className={clsx("iw-glass", className)}>{children}</Tag>;
}

export function GlassButton({
  children,
  onClick,
  variant = "ghost",
  type = "button",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "accent" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-50";
  const styles = {
    ghost: "border border-[var(--iw-border)] bg-[var(--iw-glass)] hover:bg-[var(--iw-glass-2)]",
    accent: "text-white shadow-[0_8px_24px_-8px_rgba(91,140,255,0.7)] [background:var(--iw-grad)] hover:brightness-110",
    danger: "border border-[rgba(255,107,107,0.4)] bg-[rgba(255,107,107,0.1)] text-[var(--iw-bad)] hover:bg-[rgba(255,107,107,0.18)]",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={clsx(base, styles, className)}>
      {children}
    </button>
  );
}

export function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--iw-muted)]">{eyebrow}</p>
      <h2 className="mt-1 font-display text-2xl iw-grad-text">{title}</h2>
    </div>
  );
}
```

### /src/components/admin/AdminSidebar.tsx
```tsx
import { LayoutDashboard, Send, Inbox, Server, Settings, LogOut } from "lucide-react";
import { clsx } from "clsx";
import { signOutAdmin } from "@/lib/admin-auth";

export type AdminView = "dashboard" | "email" | "inboxes" | "hosting" | "settings";

const NAV: { key: AdminView; label: string; icon: typeof Inbox }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "email", label: "Email Sending", icon: Send },
  { key: "inboxes", label: "Inboxes", icon: Inbox },
  { key: "hosting", label: "Hosting Stack", icon: Server },
  { key: "settings", label: "Settings", icon: Settings },
];

export function AdminSidebar({
  active,
  onSelect,
  email,
}: {
  active: AdminView;
  onSelect: (v: AdminView) => void;
  email: string | null;
}) {
  return (
    <aside className="iw-glass sticky top-0 flex h-screen w-[248px] flex-shrink-0 flex-col gap-6 rounded-none rounded-r-[var(--iw-r-lg)] p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl font-display text-sm text-white [background:var(--iw-grad)]">
          IW
        </span>
        <div className="leading-tight">
          <p className="font-display text-sm">InizioWeb</p>
          <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--iw-muted)]">Admin</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1.5">
        {NAV.map(({ key, label, icon: Icon }) => {
          const on = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={clsx(
                "group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm transition",
                on
                  ? "text-white shadow-[0_8px_24px_-10px_rgba(91,140,255,0.8)] [background:var(--iw-grad)]"
                  : "text-[var(--iw-muted)] hover:bg-[var(--iw-glass-2)] hover:text-[var(--iw-text)]",
              )}
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="iw-glass rounded-2xl p-3.5">
        <p className="truncate text-xs text-[var(--iw-text)]">{email ?? "—"}</p>
        <p className="text-[10px] text-[var(--iw-muted)]">MFA verified</p>
        <button
          type="button"
          onClick={() => signOutAdmin().then(() => window.location.assign("/"))}
          className="mt-3 flex items-center gap-2 text-[11px] text-[var(--iw-muted)] transition hover:text-[var(--iw-bad)]"
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </aside>
  );
}
```

### /src/components/admin/AdminShell.tsx
```tsx
import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AdminSidebar, type AdminView } from "@/components/admin/AdminSidebar";
import { DashboardView } from "@/components/admin/views/DashboardView";
import { EmailSendingView } from "@/components/admin/views/EmailSendingView";
import { InboxesView } from "@/components/admin/views/InboxesView";
import { HostingStackView } from "@/components/admin/views/HostingStackView";
import { SettingsView } from "@/components/admin/views/SettingsView";

export function AdminShell({ session }: { session: Session | null }) {
  const [view, setView] = useState<AdminView>("dashboard");
  const email = session?.user?.email ?? null;

  return (
    <div className="iw iw-aurora relative min-h-screen bg-[var(--iw-bg)]">
      <div className="relative z-10 flex">
        <AdminSidebar active={view} onSelect={setView} email={email} />
        <main className="iw-scroll h-screen flex-1 overflow-y-auto px-6 py-8 md:px-10">
          <div key={view} className="iw-fade mx-auto max-w-6xl">
            {view === "dashboard" && <DashboardView session={session} />}
            {view === "email" && <EmailSendingView session={session} />}
            {view === "inboxes" && <InboxesView />}
            {view === "hosting" && <HostingStackView />}
            {view === "settings" && <SettingsView session={session} />}
          </div>
        </main>
      </div>
    </div>
  );
}
```

### /src/components/admin/AdminLoginGlass.tsx
```tsx
import { useState, type FormEvent } from "react";
import {
  fetchAdminRole,
  getCurrentSession,
  getMfaStatus,
  signInWithPassword,
  signOutAdmin,
  verifyTotpCode,
} from "@/lib/admin-auth";
import { GlassButton } from "@/components/admin/glass";

type Step = "credentials" | "totp";

export function AdminLoginGlass({ onVerified }: { onVerified: () => void }) {
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const field =
    "mt-2 w-full rounded-2xl border border-[var(--iw-border)] bg-black/30 px-4 py-3 text-[var(--iw-text)] outline-none transition focus:border-[var(--iw-accent)]";

  const handleCredentials = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithPassword(email, password);
      const role = await fetchAdminRole(await getCurrentSession());
      if (!role) {
        await signOutAdmin();
        throw new Error("This email isn't an InizioWeb admin account.");
      }
      const mfa = await getMfaStatus();
      if (mfa.needsChallenge && mfa.factorId) {
        setFactorId(mfa.factorId);
        setStep("totp");
      } else onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleTotp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!factorId) return;
    setLoading(true);
    try {
      await verifyTotpCode(factorId, code.trim());
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work — try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="iw iw-aurora relative flex min-h-screen items-center justify-center bg-[var(--iw-bg)] px-6">
      <div className="iw-glass iw-fade relative z-10 w-full max-w-[420px] p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl font-display text-sm text-white [background:var(--iw-grad)]">
            IW
          </span>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--iw-muted)]">
            InizioWeb Admin
          </p>
        </div>

        {step === "credentials" ? (
          <form onSubmit={handleCredentials} className="space-y-4">
            <h1 className="font-display text-2xl iw-grad-text">Sign in to continue</h1>
            <label className="block text-sm text-[var(--iw-muted)]">
              Email
              <input type="email" required autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)} className={field} />
            </label>
            <label className="block text-sm text-[var(--iw-muted)]">
              Password
              <input type="password" required autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} className={field} />
            </label>
            {error && <p className="rounded-2xl border border-[rgba(255,107,107,0.3)] bg-[rgba(255,107,107,0.1)] p-3 text-sm text-red-100">{error}</p>}
            <GlassButton type="submit" variant="accent" disabled={loading} className="w-full py-3">
              {loading ? "Checking…" : "Sign in"}
            </GlassButton>
          </form>
        ) : (
          <form onSubmit={handleTotp} className="space-y-4">
            <h1 className="font-display text-2xl iw-grad-text">Authenticator code</h1>
            <p className="text-sm text-[var(--iw-muted)]">Enter the 6-digit code for InizioWeb admin.</p>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              className={`${field} text-center font-display text-2xl tracking-[0.4em]`} />
            {error && <p className="rounded-2xl border border-[rgba(255,107,107,0.3)] bg-[rgba(255,107,107,0.1)] p-3 text-sm text-red-100">{error}</p>}
            <GlassButton type="submit" variant="accent" disabled={loading || code.length !== 6} className="w-full py-3">
              {loading ? "Verifying…" : "Verify & sign in"}
            </GlassButton>
            <button type="button" onClick={() => { setStep("credentials"); setCode(""); setError(null); }}
              className="w-full text-center text-xs text-[var(--iw-muted)] hover:text-[var(--iw-text)]">
              Back to email &amp; password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

### /src/lib/inboxes.ts
```ts
import { supabase } from "@/lib/supabase-client";

export type InboxMessage = {
  id: string;
  inbox: string;        // e.g. "hello@inizioweb.co.uk"
  from_email: string;
  from_name: string | null;
  subject: string;
  preview: string;
  body_html: string | null;
  read: boolean;
  received_at: string;  // ISO
};

function client() {
  if (!supabase) throw new Error("Supabase env vars missing.");
  return supabase;
}

/** Connected inbox addresses (assumed backend table: public.inboxes). */
export async function listInboxes(): Promise<{ address: string; unread: number }[]> {
  const { data, error } = await client()
    .from("inbox_messages")
    .select("inbox, read");
  if (error) throw error;
  const map = new Map<string, number>();
  for (const r of data ?? []) {
    const cur = map.get(r.inbox) ?? 0;
    map.set(r.inbox, cur + (r.read ? 0 : 1));
  }
  return [...map.entries()].map(([address, unread]) => ({ address, unread }));
}

export async function listMessages(inbox: string): Promise<InboxMessage[]> {
  const { data, error } = await client()
    .from("inbox_messages")
    .select("*")
    .eq("inbox", inbox)
    .order("received_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as InboxMessage[];
}

export async function markRead(id: string): Promise<void> {
  await client().from("inbox_messages").update({ read: true }).eq("id", id);
}

/** Realtime: fires on any insert/update to inbox_messages. Returns unsubscribe. */
export function subscribeInbox(onChange: () => void): () => void {
  const ch = client()
    .channel("inbox_messages_rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "inbox_messages" }, onChange)
    .subscribe();
  return () => {
    client().removeChannel(ch);
  };
}
```

### /src/lib/email-campaigns.ts
```ts
import { supabase } from "@/lib/supabase-client";

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body_html: string;
};

export type SendResult = { id: string; delivered: number; failed: number };

function client() {
  if (!supabase) throw new Error("Supabase env vars missing.");
  return supabase;
}

/** Assumed backend table: public.email_templates. */
export async function listTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await client()
    .from("email_templates")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as EmailTemplate[];
}

/**
 * Sends via assumed Supabase Edge Function `send-campaign`, which wraps Resend
 * server-side (keeps the API key off the client). Auth is forwarded from the
 * current Supabase session automatically by invoke().
 */
export async function sendCampaign(input: {
  subject: string;
  bodyHtml: string;
  recipients: string[];
  templateId?: string;
}): Promise<SendResult> {
  const { data, error } = await client().functions.invoke("send-campaign", { body: input });
  if (error) throw error;
  return data as SendResult;
}
```

### /src/components/admin/views/InboxesView.tsx
```tsx
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { Glass, SectionTitle } from "@/components/admin/glass";
import {
  listInboxes,
  listMessages,
  markRead,
  subscribeInbox,
  type InboxMessage,
} from "@/lib/inboxes";

export function InboxesView() {
  const [boxes, setBoxes] = useState<{ address: string; unread: number }[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [selected, setSelected] = useState<InboxMessage | null>(null);
  const [live, setLive] = useState(false);

  const load = async () => {
    const bx = await listInboxes();
    setBoxes(bx);
    setActive((cur) => cur ?? bx[0]?.address ?? null);
  };

  useEffect(() => {
    load().catch(() => {});
    const unsub = subscribeInbox(() => {
      setLive(true);
      load().catch(() => {});
      if (active) listMessages(active).then(setMessages).catch(() => {});
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (active) listMessages(active).then(setMessages).catch(() => {});
  }, [active]);

  const open = async (m: InboxMessage) => {
    setSelected(m);
    if (!m.read) {
      await markRead(m.id).catch(() => {});
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
    }
  };

  const totalUnread = useMemo(() => boxes.reduce((n, b) => n + b.unread, 0), [boxes]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionTitle eyebrow="Connected mailboxes" title="Inboxes" />
        <span className={clsx(
          "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px]",
          live ? "border-[var(--iw-ok)] text-[var(--iw-ok)]" : "border-[var(--iw-border)] text-[var(--iw-muted)]",
        )}>
          <span className={clsx("h-1.5 w-1.5 rounded-full", live && "animate-pulse")}
            style={{ background: live ? "var(--iw-ok)" : "var(--iw-muted)" }} />
          {live ? "Live" : "Polling"} · {totalUnread} unread
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.2fr)]">
        <Glass className="p-3">
          {boxes.map((b) => (
            <button key={b.address} type="button" onClick={() => setActive(b.address)}
              className={clsx(
                "flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition",
                active === b.address ? "[background:var(--iw-grad)] text-white" : "text-[var(--iw-muted)] hover:bg-[var(--iw-glass-2)]",
              )}>
              <span className="truncate">{b.address}</span>
              {b.unread > 0 && <span className="ml-2 rounded-full bg-black/30 px-2 text-[10px]">{b.unread}</span>}
            </button>
          ))}
          {boxes.length === 0 && <p className="p-3 text-xs text-[var(--iw-muted)]">No connected inboxes.</p>}
        </Glass>

        <Glass className="max-h-[70vh] overflow-y-auto iw-scroll p-2">
          {messages.map((m) => (
            <button key={m.id} type="button" onClick={() => open(m)}
              className={clsx(
                "mb-1.5 flex w-full flex-col rounded-2xl border p-3 text-left transition",
                selected?.id === m.id ? "border-[var(--iw-accent)] bg-[var(--iw-glass-2)]" : "border-transparent hover:bg-[var(--iw-glass)]",
              )}>
              <div className="flex items-center justify-between">
                <span className={clsx("truncate text-sm", !m.read && "font-semibold text-[var(--iw-text)]")}>
                  {m.from_name || m.from_email}
                </span>
                {!m.read && <span className="h-2 w-2 flex-shrink-0 rounded-full [background:var(--iw-grad)]" />}
              </div>
              <span className="truncate text-xs text-[var(--iw-text)]">{m.subject}</span>
              <span className="truncate text-[11px] text-[var(--iw-muted)]">{m.preview}</span>
            </button>
          ))}
          {messages.length === 0 && <p className="p-4 text-xs text-[var(--iw-muted)]">No messages.</p>}
        </Glass>

        <Glass className="max-h-[70vh] overflow-y-auto iw-scroll p-5">
          {selected ? (
            <>
              <h3 className="font-display text-lg text-[var(--iw-text)]">{selected.subject}</h3>
              <p className="mt-1 text-xs text-[var(--iw-muted)]">
                {selected.from_name ? `${selected.from_name} · ` : ""}{selected.from_email}
              </p>
              <div className="mt-4 border-t border-[var(--iw-border)] pt-4 text-sm text-[var(--iw-text)]"
                dangerouslySetInnerHTML={{ __html: selected.body_html ?? selected.preview }} />
            </>
          ) : (
            <p className="text-sm text-[var(--iw-muted)]">Select a message to preview.</p>
          )}
        </Glass>
      </div>
    </div>
  );
}
```

### /src/components/admin/views/EmailSendingView.tsx
```tsx
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { clsx } from "clsx";
import { Glass, GlassButton, SectionTitle } from "@/components/admin/glass";
import { listTemplates, sendCampaign, type EmailTemplate } from "@/lib/email-campaigns";

export function EmailSendingView({ session }: { session: Session | null }) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string | undefined>();
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [recipientInput, setRecipientInput] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    listTemplates().then(setTemplates).catch(() => {});
  }, []);

  const applyTemplate = (t: EmailTemplate) => {
    setTemplateId(t.id);
    setSubject(t.subject);
    setBodyHtml(t.body_html);
  };

  const addRecipient = () => {
    const v = recipientInput.trim();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && !recipients.includes(v)) {
      setRecipients((r) => [...r, v]);
      setRecipientInput("");
    }
  };

  const valid = useMemo(
    () => subject.trim() && bodyHtml.trim() && recipients.length > 0,
    [subject, bodyHtml, recipients],
  );

  const send = async () => {
    setSending(true);
    setStatus(null);
    try {
      const r = await sendCampaign({ subject, bodyHtml, recipients, templateId });
      setStatus(`Sent · ${r.delivered} delivered, ${r.failed} failed.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setSending(false);
    }
  };

  const field = "w-full rounded-2xl border border-[var(--iw-border)] bg-black/30 px-4 py-3 text-sm text-[var(--iw-text)] outline-none focus:border-[var(--iw-accent)]";

  return (
    <div>
      <SectionTitle eyebrow="Broadcast · Resend" title="Email Sending" />
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
        <Glass className="p-3">
          <p className="px-2 pb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--iw-muted)]">Templates</p>
          {templates.map((t) => (
            <button key={t.id} type="button" onClick={() => applyTemplate(t)}
              className={clsx(
                "mb-1 block w-full rounded-2xl px-3 py-2 text-left text-sm transition",
                templateId === t.id ? "[background:var(--iw-grad)] text-white" : "text-[var(--iw-muted)] hover:bg-[var(--iw-glass-2)]",
              )}>
              {t.name}
            </button>
          ))}
          {templates.length === 0 && <p className="p-2 text-xs text-[var(--iw-muted)]">No templates.</p>}
        </Glass>

        <Glass className="space-y-3 p-5">
          <div className="flex flex-wrap gap-1.5 rounded-2xl border border-[var(--iw-border)] bg-black/30 p-2">
            {recipients.map((r) => (
              <span key={r} className="flex items-center gap-1 rounded-full bg-[var(--iw-glass-2)] px-2.5 py-1 text-xs">
                {r}
                <button type="button" onClick={() => setRecipients((x) => x.filter((y) => y !== r))} className="text-[var(--iw-muted)] hover:text-[var(--iw-bad)]">×</button>
              </span>
            ))}
            <input value={recipientInput} onChange={(e) => setRecipientInput(e.target.value)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === ",") && (e.preventDefault(), addRecipient())}
              placeholder="Add recipient + Enter" className="flex-1 bg-transparent px-2 py-1 text-sm outline-none" />
          </div>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className={field} />
          <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} placeholder="HTML body"
            rows={12} className={`${field} resize-none font-mono text-xs`} />
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--iw-muted)]">{status}</span>
            <GlassButton variant="accent" onClick={send} disabled={!valid || sending}>
              {sending ? "Sending…" : `Send · ${recipients.length}`}
            </GlassButton>
          </div>
        </Glass>

        <Glass className="p-5">
          <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-[var(--iw-muted)]">Live preview</p>
          <div className="rounded-2xl bg-white p-5 text-black">
            <p className="mb-2 text-sm font-semibold">{subject || "Subject preview"}</p>
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml || "<p>Body preview…</p>" }} />
          </div>
          <p className="mt-3 text-[11px] text-[var(--iw-muted)]">From {session?.user?.email ?? "admin"} · via Resend</p>
        </Glass>
      </div>
    </div>
  );
}
```

### /src/components/admin/views/HostingStackView.tsx
```tsx
import { useEffect, useState } from "react";
import { Glass, SectionTitle } from "@/components/admin/glass";
import { SERVICES, fetchAllStatuses, STATE_COLOR, STATE_LABEL, type StatusMap } from "@/components/admin-dashboard";

export function HostingStackView() {
  const [statuses, setStatuses] = useState<StatusMap>({});
  useEffect(() => {
    fetchAllStatuses().then(setStatuses).catch(() => {});
    const id = setInterval(() => fetchAllStatuses().then(setStatuses).catch(() => {}), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <SectionTitle eyebrow="Infrastructure" title="Hosting Stack" />
      <div className="grid gap-4 sm:grid-cols-2">
        {SERVICES.map((svc) => {
          const st = statuses[svc.key];
          const color = STATE_COLOR[st?.state ?? "unknown"];
          return (
            <Glass key={svc.key} className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: svc.brand, boxShadow: `0 0 12px ${svc.brand}` }} />
                  <h3 className="font-display text-sm">{svc.name}</h3>
                </div>
                <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color, background: `${color}14`, border: `1px solid ${color}44` }}>
                  {STATE_LABEL[st?.state ?? "unknown"]}
                </span>
              </div>
              <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--iw-muted)]">{svc.role}</p>
              <p className="mt-3 min-h-[2.25rem] text-xs text-[var(--iw-text)]">{st?.description ?? "Scanning…"}</p>
              <div className="mt-3 border-t border-[var(--iw-border)] pt-3 font-mono text-[11px] text-[var(--iw-muted)]">
                {st?.latencyMs != null ? `${st.latencyMs} ms` : "— ms"}
              </div>
            </Glass>
          );
        })}
      </div>
    </div>
  );
}
```

### /src/components/admin/views/DashboardView.tsx
```tsx
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Glass, SectionTitle } from "@/components/admin/glass";
import { StackHero, fetchAllStatuses, SERVICES, STATE_COLOR, STATE_LABEL, type StatusMap } from "@/components/admin-dashboard";
import { supabase } from "@/lib/supabase-client";

export function DashboardView({ session }: { session: Session | null }) {
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [inquiryCount, setInquiryCount] = useState<number | null>(null);

  useEffect(() => {
    const run = async () => {
      setStatuses(await fetchAllStatuses());
      if (supabase) {
        const { count } = await supabase.from("inquiries").select("*", { count: "exact", head: true });
        setInquiryCount(count ?? null);
      }
    };
    run().catch(() => {});
    const id = setInterval(() => run().catch(() => {}), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <SectionTitle eyebrow="Orbital view" title="Your stack, in real time" />
      <Glass className="relative mb-4 h-[46vh] min-h-[20rem] overflow-hidden">
        <StackHero statuses={statuses} />
      </Glass>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map((svc) => {
          const st = statuses[svc.key];
          const color = STATE_COLOR[st?.state ?? "unknown"];
          return (
            <Glass key={svc.key} className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm">{svc.name}</h3>
                <span className="text-[11px] font-semibold" style={{ color }}>{STATE_LABEL[st?.state ?? "unknown"]}</span>
              </div>
              <p className="mt-2 text-[11px] text-[var(--iw-muted)]">{st?.latencyMs != null ? `${st.latencyMs} ms` : "— ms"}</p>
            </Glass>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Glass className="p-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--iw-muted)]">Total enquiries</p>
          <p className="mt-2 font-display text-3xl iw-grad-text">{inquiryCount ?? "—"}</p>
        </Glass>
        <Glass className="p-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--iw-muted)]">Operator</p>
          <p className="mt-2 truncate font-display text-lg">{session?.user?.email ?? "—"}</p>
        </Glass>
        <Glass className="p-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--iw-muted)]">Auto-refresh</p>
          <p className="mt-2 font-display text-3xl">30s</p>
        </Glass>
      </div>
    </div>
  );
}
```

### /src/components/admin/views/SettingsView.tsx
```tsx
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Glass, SectionTitle } from "@/components/admin/glass";
import { getMfaStatus } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase-client";

export function SettingsView({ session }: { session: Session | null }) {
  const [mfa, setMfa] = useState<string>("—");
  const [roster, setRoster] = useState<{ email: string; role: string }[]>([]);

  useEffect(() => {
    getMfaStatus().then((m) => setMfa(m.hasVerifiedFactor ? "Enrolled" : "Not enrolled")).catch(() => {});
    if (supabase) {
      supabase.from("admin_users").select("email, role").then(({ data }) => setRoster((data ?? []) as any));
    }
  }, []);

  return (
    <div>
      <SectionTitle eyebrow="Configuration" title="Settings" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Glass className="p-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--iw-muted)]">Account</p>
          <p className="mt-2 font-display text-lg">{session?.user?.email ?? "—"}</p>
          <p className="mt-3 text-xs text-[var(--iw-muted)]">Two-factor auth: <span className="text-[var(--iw-text)]">{mfa}</span></p>
        </Glass>
        <Glass className="p-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--iw-muted)]">Admin roster</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {roster.map((r) => (
              <li key={r.email} className="flex justify-between">
                <span className="truncate">{r.email}</span>
                <span className="text-[var(--iw-muted)]">{r.role}</span>
              </li>
            ))}
            {roster.length === 0 && <li className="text-xs text-[var(--iw-muted)]">Loading…</li>}
          </ul>
        </Glass>
      </div>
    </div>
  );
}
```

### /src/components/admin-dashboard.tsx  (patch-style diff)
```diff
@@ export component definitions
-const STATE_COLOR: Record<StackState, string> = {
+export type { StatusMap };
+export const STATE_COLOR: Record<StackState, string> = {
@@
-const STATE_LABEL: Record<StackState, string> = {
+export const STATE_LABEL: Record<StackState, string> = {
@@
-const SERVICES = [
+export const SERVICES = [
@@ the aggregate fetcher used by refresh()
-async function fetchAllStatuses(): Promise<StatusMap> {
+export async function fetchAllStatuses(): Promise<StatusMap> {
@@ the 3D hero component
-function StackHero({ statuses }: { statuses: StatusMap }) {
+export function StackHero({ statuses }: { statuses: StatusMap }) {
@@ auth gate: swap login + authorized render
-import { AdminLogin } from "@/components/admin-login";
+import { AdminLoginGlass } from "@/components/admin/AdminLoginGlass";
+import { AdminShell } from "@/components/admin/AdminShell";
@@ inside AdminDashboard(): not-authorized branch
-      <div className="relative min-h-screen bg-background">
-        <div
-          className="pointer-events-none absolute inset-x-0 top-0 h-[28rem]"
-          style={{ background: "var(--gradient-glow)" }}
-        />
-        <AdminLogin
-          onVerified={async () => {
-            const next = await getCurrentSession();
-            setSession(next);
-            setAuthorized(await sessionIsFullyVerifiedAdmin(next));
-          }}
-          onCancel={() => window.location.assign("/")}
-        />
-      </div>
+      <AdminLoginGlass
+        onVerified={async () => {
+          const next = await getCurrentSession();
+          setSession(next);
+          setAuthorized(await sessionIsFullyVerifiedAdmin(next));
+        }}
+      />
@@ authorized render
-  return <StackDashboard session={session} />;
+  return <AdminShell session={session} />;
```
> `StackDashboard` and the `<canvas>` renderer stay in the file (StackHero is exported and reused). The old top-bar `StackDashboard` is now dead code — safe to delete once verified.

### /src/routes/admin.tsx  (patch-style diff)
```diff
-import { AdminDashboard } from "@/components/admin-dashboard";
-import { AdminPanel } from "@/components/admin-panel";
-import { GlassCursor } from "@/components/glass-cursor";
+import { AdminDashboard } from "@/components/admin-dashboard";
+import { AdminPanel } from "@/components/admin-panel";
@@
 function AdminRoute() {
   return (
     <>
       <AdminDashboard />
       <AdminPanel />
-      <GlassCursor />
     </>
   );
 }
```
> `GlassCursor` removed inside the admin surface (native cursor restored for form-heavy panels). Keep it site-wide elsewhere.

---

## 4. Assumed Backend Contracts (connect-only)

```sql
-- public.inbox_messages  (Resend inbound webhook → row insert; Realtime enabled)
id uuid pk, inbox text, from_email text, from_name text, subject text,
preview text, body_html text, read bool default false, received_at timestamptz

-- public.email_templates
id uuid pk, name text, subject text, body_html text

-- Edge Function: send-campaign  (POST { subject, bodyHtml, recipients[], templateId? })
--   → Resend batch send server-side; returns { id, delivered, failed }
--   → re-checks ADMIN_EMAILS allowlist (same pattern as inquiry-flow fn)
```
RLS reuses existing `public.is_admin()`. No new auth. TOTP/MFA flow unchanged.
```
```

## 5. Verification checklist
- `npm run lint` — new files typecheck (exports resolve from `admin-dashboard.tsx`).
- Login → TOTP → shell renders; sign-out returns to `/`.
- Non-admin email rejected (fetchAdminRole path unchanged).
- Inboxes realtime badge flips to "Live" on `inbox_messages` change.
- Email preview mirrors composer; Send disabled until subject+body+≥1 recipient.
```
