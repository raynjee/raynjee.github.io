// No-op auth hook — no login needed.
// Apps that still import useAuth receive a stub that always reports
// "authenticated" with an empty user object.

export function useAuth() {
  return {
    isLoading: false,
    isAuthenticated: true,
    user: null,
    signIn: async () => {},
    signOut: async () => {},
  };
}
