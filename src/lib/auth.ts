// Auth stub — the studio no longer needs Convex or any login.
// Only a single machine accesses the local IndexedDB, so there is no
// access-control tier. The admin email is informational.

export const ADMIN_EMAIL = "saberyyang09@gmail.com";

export interface UserContext {
  email: string;
  name: string;
  isAdmin: true;
}

export function useCurrentUser(): {
  loading: false;
  authenticated: true;
  user: UserContext;
} {
  return {
    loading: false,
    authenticated: true,
    user: {
      email: ADMIN_EMAIL,
      name: "Curator",
      isAdmin: true,
    },
  };
}

export async function getCurrentUser(): Promise<UserContext> {
  return {
    email: ADMIN_EMAIL,
    name: "Curator",
    isAdmin: true,
  };
}
