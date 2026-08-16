import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PageLoader from '../components/PageLoader.jsx';

// Guards routes: waits for session restore, then redirects unauthenticated
// users to /login. Optionally restricts to specific roles.
export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, loading, role } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader label="Restoring your session…" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && roles.length && role !== 'SUPER_ADMIN' && !roles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
