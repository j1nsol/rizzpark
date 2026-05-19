import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { auth, onAuthStateChanged } from '../utils/firebase';

export default function ProtectedRoute({ children }) {
  const [user, setUser]       = useState(undefined);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  if (user === undefined) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#F5F4F1',
        fontFamily: "'DM Sans', sans-serif", color: '#888',
      }}>
        Checking authentication…
      </div>
    );
  }

  if (!user) return <Navigate to="/admin/login" replace />;

  return children;
}
