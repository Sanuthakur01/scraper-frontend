'use client';

import { ClerkFailed, ClerkLoaded, ClerkLoading, ClerkProvider, SignIn, SignOutButton, UserButton, useUser } from '@clerk/react';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { can, rawRole, ROLE_LABELS, ROLES, roleFrom, type Permission, type Role } from '@/lib/access';
import { AlertIcon, LockIcon } from './Icons';

// The dashboard is static files (no server of its own), so sign-in happens in the browser with Clerk.
// The publishable key is read when the dashboard is built (client/.env.local, or the host's settings).
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

// Test sign-in, development only (see lib/session.ts; checked here too so a normal build drops it).
const TEST_SIGN_IN = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_TEST_SIGN_IN === '1';

export interface Access {
  role: Role;
  label: string; // "Research team"
  can: (permission: Permission) => boolean;
}

const AccessContext = createContext<Access | null>(null);

// The signed-in person's role and what it may do. null outside the gate (then nothing is allowed).
export const useAccess = () => useContext(AccessContext);

// The account menu in the top bar (profile, sign out); in test sign-in, just who is "signed in".
export function UserMenu() {
  if (TEST_SIGN_IN) {
    return (
      <span className="test-user" title="Test sign-in: tester@example.com">
        T
      </span>
    );
  }
  return <UserButton />;
}

// Clerk's sign-in box in the dashboard's colours, light or dark like the rest of the page.
const LIGHT = {
  colorPrimary: '#4f46e5',
  colorPrimaryForeground: '#ffffff',
  colorBackground: '#ffffff',
  colorForeground: '#101828',
  colorMutedForeground: '#667085',
  colorMuted: '#f8f9fb',
  colorInput: '#ffffff',
  colorInputForeground: '#101828',
  colorBorder: '#98a2b3',
  colorNeutral: '#101828',
  colorDanger: '#b42318',
};
const DARK = {
  colorPrimary: '#6366f1',
  colorPrimaryForeground: '#ffffff',
  colorBackground: '#14171d',
  colorForeground: '#f2f4f7',
  colorMutedForeground: '#8f97a4',
  colorMuted: '#1a1e25',
  colorInput: '#1a1e25',
  colorInputForeground: '#f2f4f7',
  colorBorder: '#5b6474',
  colorNeutral: '#f2f4f7',
  colorDanger: '#f97066',
};

// Whether the page is dark: the light/dark switch's choice, else the computer's setting. Follows changes.
function useDarkPage() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const read = () => {
      const chosen = document.documentElement.dataset.theme;
      setDark(chosen ? chosen === 'dark' : media.matches);
    };
    read();
    media.addEventListener('change', read);
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      media.removeEventListener('change', read);
      observer.disconnect();
    };
  }, []);
  return dark;
}

function Brand() {
  return (
    <div className="auth-brand">
      <span className="brand-mark" aria-hidden="true">
        IJF
      </span>
      <span className="brand-text">
        <span className="brand-name">Job Tracker</span>
        <span className="brand-tag">India hiring insights</span>
      </span>
    </div>
  );
}

// A full-page message: no access, sign-in not set up, or sign-in couldn't load.
function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <main className="auth-screen">
      <Brand />
      <section className="auth-card" aria-labelledby="auth-title">
        <span className="auth-icon" aria-hidden="true">
          {icon}
        </span>
        <h1 id="auth-title">{title}</h1>
        {children}
      </section>
    </main>
  );
}

function Checking() {
  return (
    <main className="auth-screen" aria-busy="true">
      <Brand />
      <p className="auth-checking" role="status">
        <span className="spinner dark" aria-hidden="true" /> Checking your sign-in…
      </p>
    </main>
  );
}

function SignInScreen() {
  // After signing in, stay on the page that was opened (e.g. a course page link).
  const here = `${window.location.pathname}${window.location.search}`;
  return (
    <main className="auth-screen">
      <Brand />
      <SignIn
        routing="hash"
        withSignUp={false}
        fallbackRedirectUrl={here}
        appearance={{ elements: { footerAction: { display: 'none' } } }}
      />
      <p className="auth-note">For the IJF team only. Accounts are created by an admin.</p>
    </main>
  );
}

function NoAccess({ email, found, onRecheck }: { email: string; found: string; onRecheck: () => Promise<void> }) {
  const [checking, setChecking] = useState(false);
  const [stillNo, setStillNo] = useState(false);
  return (
    <Notice icon={<LockIcon size={22} />} title="No access yet">
      <p>
        You&apos;re signed in as <strong>{email}</strong>, but this account doesn&apos;t have a role that can use the dashboard.
      </p>
      <p className="auth-muted">
        Ask an admin to set your role in Clerk (public metadata) to one of: {ROLES.map((r) => ROLE_LABELS[r]).join(', ')}.
        {found ? ` Its role now: "${found}".` : ' It has no role yet.'}
      </p>
      {stillNo && <p className="auth-muted" role="status">Still no access. Once the role is set, check again.</p>}
      <div className="auth-actions">
        <SignOutButton>
          <button type="button" className="btn">
            Sign out
          </button>
        </SignOutButton>
        <button
          type="button"
          className="btn btn-primary"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            setStillNo(false);
            await onRecheck().catch(() => {});
            setChecking(false);
            setStillNo(true); // if access came through, this screen is gone by now
          }}
        >
          {checking ? 'Checking…' : 'Check again'}
        </button>
      </div>
    </Notice>
  );
}

// Signed in with an allowed role: the dashboard. Signed out: the sign-in box. Signed in without an
// allowed role: "No access". Nothing of the dashboard (or its data) loads until access is allowed.
function Gate({ children }: { children: ReactNode }) {
  const { isSignedIn, user } = useUser();
  const role = isSignedIn && user ? roleFrom(user.publicMetadata) : null;
  const access = useMemo<Access | null>(() => (role ? { role, label: ROLE_LABELS[role], can: (p) => can(role, p) } : null), [role]);

  if (!isSignedIn || !user) return <SignInScreen />;
  if (!access || !access.can('view')) {
    return (
      <NoAccess
        email={user.primaryEmailAddress?.emailAddress ?? user.username ?? 'this account'}
        found={rawRole(user.publicMetadata)}
        onRecheck={async () => {
          await user.reload();
        }}
      />
    );
  }
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dark = useDarkPage();

  // Development only (lib/session.ts): no Clerk; the role from NEXT_PUBLIC_TEST_ROLE.
  if (TEST_SIGN_IN) {
    const role = roleFrom({ role: process.env.NEXT_PUBLIC_TEST_ROLE || 'ADMIN' }) ?? 'ADMIN';
    return (
      <AccessContext.Provider value={{ role, label: ROLE_LABELS[role], can: (p) => can(role, p) }}>
        <p className="test-sign-in-note">Test sign-in (development only): tester@example.com · {ROLE_LABELS[role]}</p>
        {children}
      </AccessContext.Provider>
    );
  }

  if (!PUBLISHABLE_KEY) {
    return (
      <Notice icon={<AlertIcon size={22} />} title="Sign-in isn't set up">
        <p>
          The dashboard was built without <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code>. Add it to <code>client/.env.local</code> (or the
          host&apos;s environment settings), then build again.
        </p>
      </Notice>
    );
  }

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => router.push(to)}
      routerReplace={(to) => router.replace(to)}
      afterSignOutUrl="/"
      appearance={{ variables: { ...(dark ? DARK : LIGHT), fontFamily: 'var(--font-inter), system-ui, sans-serif', borderRadius: '10px' } }}
    >
      <ClerkLoading>
        <Checking />
      </ClerkLoading>
      <ClerkFailed>
        <Notice icon={<AlertIcon size={22} />} title="Sign-in couldn't load">
          <p>Check the internet connection. A firewall or ad blocker may also be blocking Clerk (the sign-in service).</p>
          <div className="auth-actions">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </Notice>
      </ClerkFailed>
      <ClerkLoaded>
        <Gate>{children}</Gate>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
