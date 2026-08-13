import React from 'react';

// Authentication is intentionally not implemented in this challenge deployment.
// A static client/server password is not security and must never be used.
export function LoginForm({ onLoginSuccess }) {
  return <div className="login-container"><div className="login-card"><p>Autenticação não configurada.</p><button className="btn-upload" onClick={onLoginSuccess}>Continuar</button></div></div>;
}
