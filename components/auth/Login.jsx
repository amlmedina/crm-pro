'use client';

import { useState } from 'react';
import { loginApi } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    if (e) e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError('');

    try {
      const resp = await loginApi(email, password);
      // Wait a moment for cookie to settle before reload
      if (resp.success) {
         router.refresh();
      } else {
        setError(resp.message || 'Credenciales incorrectas');
        setLoading(false);
      }
    } catch (err) {
      setError('Error de conexión con el proxy de servidor');
      setLoading(false);
    }
  }

  return (
    <div id="pglogin">
      <div className="lbox">
        <h1>CRM<span>Pro</span></h1>
        <p className="mono">Sistema de Seguridad Estricta · Palmer ISO 27001</p>
        <form onSubmit={handleLogin}>
          <div className="fg">
            <label>Correo electrónico Corporativo</label>
            <input 
              type="email" 
              placeholder="agente@empresa.com" 
              autoComplete="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="fg">
            <label>Contraseña</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button 
            type="submit" 
            className="btn btng btnw" 
            disabled={loading}
          >
            {loading ? <><span className="spin"></span> Verificando…</> : 'Ingresar al Portal Seguro'}
          </button>
        </form>
        {error && (
          <p style={{ color: 'var(--red)', fontSize: '.8rem', marginTop: '12px', textAlign: 'center' }} className="mono">
            🚨 {error}
          </p>
        )}
      </div>
    </div>
  );
}
