import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Spinner from '../components/ui/Spinner.jsx';

// Guards routes: waits for session restore, then redirects unauthenticated
// users to /login. Optionally restricts to specific roles.
export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, loading, role } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner full />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && roles.length && role !== 'SUPER_ADMIN' && !roles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
