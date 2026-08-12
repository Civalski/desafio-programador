import React, { useState } from 'react';

export function UploadZone({ onUpload, isProcessing }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [tipo] = useState('holerite');
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    validateAndSetFile(file);
  };

  const validateAndSetFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && !file.type.includes('pdf')) {
      setError('Por favor, selecione um arquivo válido em formato PDF.');
      setSelectedFile(null);
      return;
    }
    setError('');
    setSelectedFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    validateAndSetFile(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Selecione um arquivo PDF para continuar.');
      return;
    }
    onUpload(selectedFile, tipo);
  };

  return (
    <div className={`upload-card ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <span className="user-doc-badge" style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '0.4rem', 
          padding: '0.35rem 0.85rem', 
          borderRadius: '9999px', 
          fontSize: '0.75rem', 
          fontWeight: 600, 
          letterSpacing: '0.05em', 
          color: 'var(--accent-black)', 
          border: '1px solid rgba(77,163,255,0.3)',
          background: 'rgba(77,163,255,0.08)'
        }}>
          📄 MÓDULO FOLHA DE PAGAMENTO (PAYROLL)
        </span>
      </div>

      <h2 className={'upload-title'}>
        Transcrição & Auditoria de Holerites
      </h2>
      <p className={'upload-description'}>
        Envie seu arquivo PDF contendo holerites (folha de pagamento) para extrair verbas, referências e valores automaticamente.
      </p>

      <form onSubmit={handleSubmit} className={'upload-form'}>
        <input 
          type="file" 
          id="pdf-input" 
          accept=".pdf" 
          onChange={handleFileChange} 
          style={{ display: 'none' }} 
        />
        
        <label htmlFor="pdf-input" className="btn-secondary" style={{ display: 'inline-block', cursor: 'pointer', marginBottom: '1.25rem' }}>
          {selectedFile ? `📄 ${selectedFile.name}` : 'Escolher PDF de Holerite'}
        </label>

        {error && (
          <p style={{ color: '#991b1b', marginTop: '0.75rem', fontSize: '0.85rem', background: '#fef2f2', border: '1px solid #fecaca', padding: '0.5rem', borderRadius: '6px' }}>
            {error}
          </p>
        )}

        <button 
          type="submit" 
          className="btn-upload" 
          disabled={isProcessing || !selectedFile}
          style={{ 
            opacity: isProcessing || !selectedFile ? 0.4 : 1, 
            marginTop: '1.25rem',
            width: '100%',
            cursor: isProcessing || !selectedFile ? 'not-allowed' : 'pointer'
          }}
        >
          {isProcessing ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
              <span className="spinner"></span> Processando Folha de Pagamento...
            </span>
          ) : (
            'Transcrever Folha de Pagamento'
          )}
        </button>
      </form>
    </div>
  );
}
