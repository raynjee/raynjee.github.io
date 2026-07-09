// Lightweight wrapper around the project's existing use-auth helper plus
// a local admin gate. The admin email is fixed by the spec.

import { api } from "@/convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";

export const ADMIN_EMAIL = "saberyyang09@gmail.com";

export interface UserContext {
  email: string | null;
  name: string | null;
  isAdmin: boolean;
}

export function useCurrentUser(): {
  loading: boolean;
  authenticated: boolean;
  user: UserContext | null;
} {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const loading = isLoading || user === undefined;
  if (!isAuthenticated || user === null || user === undefined) {
    return { loading, authenticated: false, user: null };
  }
  const email = (user as { email?: string | null }).email ?? null;
  const name = (user as { name?: string | null }).name ?? null;
  return {
    loading,
    authenticated: true,
    user: {
      email,
      name,
      isAdmin: !!email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
    },
  };
}

// Best effort: pull from cache outside React context.
export async function getCurrentUser(): Promise<UserContext | null> {
  // The project uses Convex hooks for user lookup; outside React there's no
  // direct path, so callers should rely on useCurrentUser() in components.
  return null;
}
