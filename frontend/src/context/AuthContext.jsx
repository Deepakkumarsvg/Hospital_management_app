import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as authService from '../services/authService.js';
import { getToken, setToken } from '../services/api.js';
import { identifyUser } from '../services/errorReporting.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, if a token exists, restore the session.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await authService.fetchMe();
        if (active) setUser(me);
      } catch {
        setToken(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: u } = await authService.login(email, password);
    setToken(token);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setToken(null);
    setUser(null);
  }, []);

  // Attach the signed-in account (id and role only) to anything reported from
  // here on, so a crash report can answer "how many people is this hitting"
  // rather than just "it happened". Cleared on sign-out for the same reason it
  // is set: the next person at that terminal is not the previous one.
  useEffect(() => {
    identifyUser(user);
  }, [user]);

  // The permissions the API will actually honour for this account, as returned
  // by /auth/me. Gating the UI on these rather than on hard-coded role lists is
  // what makes the editable permission matrix visible: granting a nurse
  // billing:view has to open the Billing screen for her, not just stop the API
  // refusing her.
  const permissions = user?.permissions || [];

  // SUPER_ADMIN bypasses the matrix server-side, so it must bypass it here too
  // or the UI would hide screens the API would happily serve.
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const can = useCallback(
    (...keys) => isSuperAdmin || keys.some((k) => permissions.includes(k)),
    [isSuperAdmin, permissions]
  );

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    role: user?.role || null,
    permissions,
    can,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
