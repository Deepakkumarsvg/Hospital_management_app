import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PageLoader from '../components/PageLoader.jsx';

// Guards routes: waits for session restore, then redirects unauthenticated
// users to /login.
//
// Access is decided by permission, not by role. The two used to be the same
// thing here — a hard-coded list of role names per route, mirroring an
// identical list on the server. Now that the server enforces an editable
// permission matrix, gating the UI on role names would mean granting a nurse
// billing:view opened the API but not the screen.
//
// `anyOf` matches the server's requirePermission(): holding any one of the
// listed permissions is enough.
export default function ProtectedRoute({ children, anyOf }) {
  const { isAuthenticated, loading, can } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader label="Restoring your session…" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (anyOf?.length && !can(...anyOf)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
