import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, signInWithEmailAndPassword } from '../utils/firebase';

const S = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#F5F4F1', fontFamily: "'DM Sans', sans-serif",
  },
  card: {
    background: '#fff', borderRadius: 16, padding: '40px 36px',
    boxShadow: '0 2px 16px rgba(0,0,0,.08)', width: '100%', maxWidth: 380,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 },
  logoText: { fontWeight: 700, fontSize: 18, color: '#111' },
  heading: { fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 6 },
  sub: { fontSize: 13, color: '#888', marginBottom: 28 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #E4E1DA',
    fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none',
    background: '#FAFAF8', boxSizing: 'border-box', marginBottom: 16,
    transition: 'border-color .15s',
  },
  btn: {
    width: '100%', padding: '11px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: '#F5A623', color: '#fff', fontWeight: 700, fontSize: 15,
    fontFamily: "'DM Sans', sans-serif", marginTop: 4, transition: 'opacity .15s',
  },
  error: {
    fontSize: 13, color: '#D93A3A', background: '#FFF0F0', border: '1px solid #F5C6CB',
    borderRadius: 8, padding: '9px 12px', marginBottom: 16,
  },
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>
          <img src="/topbar-logo.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          <span style={S.logoText}>RizzPark Admin</span>
        </div>

        <div style={S.heading}>Sign in</div>
        <div style={S.sub}>Admin access only. Contact the system administrator for credentials.</div>

        {error && <div style={S.error}>{error}</div>}

        <form onSubmit={handleSubmit} autoComplete="on">
          <label style={S.label} htmlFor="email">Email</label>
          <input
            id="email"
            style={S.input}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="username"
            required
          />

          <label style={S.label} htmlFor="password">Password</label>
          <input
            id="password"
            style={S.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <button style={{ ...S.btn, opacity: loading ? 0.6 : 1 }} type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
