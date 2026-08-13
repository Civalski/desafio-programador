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

  const handleDownload = async () => {
    if (!jobId) return;
    setIsSaving(true);
    setMessage('');
    try {
      await onSave();
      const response = await fetch(`/api/transcricoes/${jobId}/planilha?formato=${formato}`);
      if (!response.ok) throw new Error('Não foi possível gerar a planilha.');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `transcricao.${formato}`;
      link.click();
      URL.revokeObjectURL(link.href);
      setMessage('Alterações salvas e planilha baixada.');
    } catch (err) {
      setMessage(`Erro ao baixar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
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

        <button className="btn-success" onClick={handleDownload} disabled={isSaving}>
          Baixar Planilha
        </button>
      </div>
    </div>
  );
}
