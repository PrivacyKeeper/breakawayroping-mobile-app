// src/lib/auth.tsx
//
// Session state for the whole app.
//
// Two decisions worth stating, because both are easy to get wrong in a way
// that only shows up in an arena with no signal:
//
// 1. THE SESSION IS RESTORED FROM DISK BEFORE ANYTHING RENDERS. supabase-js
//    persists to AsyncStorage, but the read is asynchronous, so for the first
//    frame or two `getSession()` has not resolved and the user looks signed
//    out. Routing on that state bounces somebody who is signed in to the login
//    screen every cold start. `loading` exists to hold the gate shut until we
//    actually know, and no route decision is made while it is true.
//
// 2. SIGNING OUT NEVER FAILS. `supabase.auth.signOut()` calls the server to
//    revoke the refresh token, and in an arena that call times out. If we
//    surfaced that error the user would be stuck signed in on a shared phone.
//    So a failed revoke is logged and the local session is cleared anyway --
//    the token expires on its own, and the person holding the handset matters
//    more than the token in the database.

import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { registerForPush, unregisterPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';

export type AuthResult = { ok: true } | { ok: false; message: string };

type SessionValue = {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been read. Gate routing on this. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    profile: { firstName: string; lastName: string },
  ) => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /**
   * Close the account for good.
   *
   * App Store Guideline 5.1.1(v) requires this to be reachable from inside the
   * app, not an email to support. It is not a row delete: the ledger is
   * append-only and a producer's tax obligation for a closed year outlives the
   * account, so the server de-identifies the contestant and destroys the
   * login. What is left points at money and cannot name anybody.
   */
  deleteAccount: () => Promise<AuthResult>;
};

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Supabase's auth errors are written for developers. These are the four a
 * contestant will actually hit, rewritten for somebody standing at a gate.
 * Anything unrecognised passes through rather than being flattened into
 * "something went wrong", which helps nobody diagnose anything.
 */
function readableAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'That email and password do not match an account.';
  }
  if (m.includes('email not confirmed')) {
    return 'Check your email and confirm the address before signing in.';
  }
  if (m.includes('user already registered')) {
    return 'There is already an account with that email. Try signing in.';
  }
  if (m.includes('password should be at least')) {
    return 'Pick a password of at least 8 characters.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'No connection. This needs signal — try again once you have a bar.';
  }
  return message;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .catch((error) => {
        // A failed restore is not a signed-in state. Log it and let the user
        // sign in rather than leaving the gate open on an unknown session.
        console.warn('[auth] could not restore the stored session', error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Fires on sign-in, sign-out, and every token refresh, including refreshes
    // that happen while the app is backgrounded.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(false);

      // Registered here rather than at launch: iOS grants exactly one shot at
      // the notification prompt, so it is asked once somebody has an account
      // and a reason to want the draw — not in front of a login screen. Fire
      // and forget; a declined prompt is a worse app, not a broken one.
      if (event === 'SIGNED_IN' && next) {
        void registerForPush().then((result) => {
          if (!result.ok && result.reason === 'error') {
            console.warn('[push] could not register this device', result.message);
          }
        });
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return error ? { ok: false, message: readableAuthError(error.message) } : { ok: true };
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      profile: { firstName: string; lastName: string },
    ): Promise<AuthResult> => {
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          // Carried on the auth user so the trigger that creates the public
          // `users` row has a name to work with. Sending it here rather than
          // writing the profile from the client keeps the two in one step:
          // a client-side follow-up insert can fail and leave an auth user
          // with no profile, which is unrecoverable without support.
          data: {
            first_name: profile.firstName.trim(),
            last_name: profile.lastName.trim(),
          },
        },
      });
      return error ? { ok: false, message: readableAuthError(error.message) } : { ok: true };
    },
    [],
  );

  const sendPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    return error ? { ok: false, message: readableAuthError(error.message) } : { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    // Before the session goes, or the delete has no credentials to authorise
    // it. Leaving the token behind would send the next person to sign in on a
    // shared phone the previous contestant's draw.
    await unregisterPush();
    try {
      await supabase.auth.signOut();
    } catch (error) {
      // See the note at the top: the handset wins over the token.
      console.warn('[auth] sign-out could not reach the server; clearing locally', error);
    }
    setSession(null);
  }, []);

  const deleteAccount = useCallback(async (): Promise<AuthResult> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, message: 'Sign in again before closing your account.' };

    const endpoint = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
    } catch {
      return {
        ok: false,
        message: 'Could not reach the server. Closing an account needs signal — try again on a bar.',
      };
    }

    let payload: { success?: boolean; error?: string } = {};
    try {
      payload = await response.json();
    } catch {
      return { ok: false, message: `The server returned an unexpected response (${response.status}).` };
    }

    if (!response.ok || !payload.success) {
      return { ok: false, message: payload.error ?? 'The account could not be closed.' };
    }

    // The login is gone server-side; clear it here too rather than leaving a
    // dead token in storage that fails on the next request.
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // Already revoked. Nothing to recover.
    }
    return { ok: true };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signIn,
      signUp,
      sendPasswordReset,
      signOut,
      deleteAccount,
    }),
    [session, loading, signIn, signUp, sendPasswordReset, signOut, deleteAccount],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside a SessionProvider');
  }
  return value;
}
