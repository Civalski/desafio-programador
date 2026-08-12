import React, { useState } from 'react';

export function ExportBar({ jobId, onSave, onReset }) {
  const [formato, setFormato] = useState('xlsx');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSaveClick = async () => {
    setIsSaving(true);
    setMessage('');
    try {
      await onSave();
      setMessage('Alterações salvas com sucesso.');
    } catch (err) {
      setMessage(`Erro ao salvar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (!jobId) return;
    const url = `/api/transcricoes/${jobId}/planilha?formato=${formato}`;
    window.open(url, '_blank');
  };

  return (
    <div className="action-bar" style={{ marginTop: '1rem' }}>
      <button className="btn-secondary" onClick={onReset}>
        Novo Documento
      </button>

      {message && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>{message}</span>}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>Formato:</span>
          <select 
            value={formato} 
            onChange={(e) => setFormato(e.target.value)}
            className="input-cell"
            style={{ width: '85px', height: '34px', padding: '0 0.4rem' }}
          >
            <option value="xlsx">.xlsx</option>
            <option value="csv">.csv</option>
            <option value="json">.json</option>
          </select>
        </div>

        <button 
          className="btn-secondary" 
          onClick={handleSaveClick}
          disabled={isSaving}
        >
          {isSaving ? 'Salvando...' : 'Salvar Alterações'}
        </button>

        <button className="btn-success" onClick={handleDownload}>
          Baixar Planilha
        </button>
      </div>
    </div>
  );
}
