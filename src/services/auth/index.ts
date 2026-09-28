/**
 * Auth seam. SlideQuiz currently runs as a single local profile. Replace LocalAuth with
 * Clerk/Auth.js/Supabase Auth; the store only depends on this interface.
 */
export interface AuthSession {
  userId: string;
  token: string | null;
}

export interface AuthService {
  current(): AuthSession;
  signOut(): Promise<void>;
}

class LocalAuth implements AuthService {
  current() {
    return { userId: "local-user", token: null };
  }
  async signOut() {
    /* nothing to do for a local profile */
  }
}

export const auth: AuthService = new LocalAuth();
