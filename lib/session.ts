import { getToken } from '@clerk/react';

// TEST SIGN-IN, for trying the dashboard locally without a Clerk account: only under `next dev` with
// NEXT_PUBLIC_TEST_SIGN_IN=1 (and NEXT_PUBLIC_TEST_ROLE, default ADMIN). A normal build (`next build`)
// never has it: NODE_ENV is 'production' there, so the check is false and its code is left out. The
// check is repeated in each file that uses it (here and AuthGate.tsx), so the build can drop that code
// entirely. Its token ("test:ROLE:email") is refused by the real backend, which checks tokens with Clerk.
const TEST_SIGN_IN = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_TEST_SIGN_IN === '1';

// The signed-in person's Clerk session token, for the server to check who is asking. null when there
// is none (signed out, Clerk not loaded).
export async function sessionToken(): Promise<string | null> {
  if (TEST_SIGN_IN) return `test:${process.env.NEXT_PUBLIC_TEST_ROLE || 'ADMIN'}:tester@example.com`;
  try {
    return await getToken();
  } catch {
    return null;
  }
}

export async function signInHeader(): Promise<Record<string, string>> {
  const token = await sessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
