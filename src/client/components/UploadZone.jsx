import React, { useState } from 'react';

export function UploadZone({ onUpload, isProcessing }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [tipo, setTipo] = useState('cartao-ponto');
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
      <h2>📁 Selecionar Documento para Transcrição</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
        Arraste e solte seu arquivo PDF aqui ou clique para procurar no seu computador.
      </p>

      <form onSubmit={handleSubmit} style={{ marginTop: '1.5rem' }}>
        <input 
          type="file" 
          id="pdf-input" 
          accept=".pdf" 
          onChange={handleFileChange} 
          style={{ display: 'none' }} 
        />
        
        <label htmlFor="pdf-input" className="btn-secondary" style={{ display: 'inline-block', cursor: 'pointer', marginBottom: '1rem' }}>
          {selectedFile ? `📄 ${selectedFile.name}` : '🔍 Escolher Arquivo PDF'}
        </label>

        <div className="type-selector">
          <label className={`radio-btn ${tipo === 'cartao-ponto' ? 'selected' : ''}`}>
            <input 
              type="radio" 
              name="tipo" 
              value="cartao-ponto" 
              checked={tipo === 'cartao-ponto'} 
              onChange={() => setTipo('cartao-ponto')} 
            />
            ⏱️ Cartão de Ponto
          </label>

          <label className={`radio-btn ${tipo === 'holerite' ? 'selected' : ''}`}>
            <input 
              type="radio" 
              name="tipo" 
              value="holerite" 
              checked={tipo === 'holerite'} 
              onChange={() => setTipo('holerite')} 
            />
            🧾 Holerite (Payroll)
          </label>
        </div>

        {error && <p style={{ color: '#f87171', marginTop: '0.5rem', fontWeight: 500 }}>⚠️ {error}</p>}

        <button 
          type="submit" 
          className="btn-upload" 
          disabled={isProcessing || !selectedFile}
          style={{ opacity: isProcessing || !selectedFile ? 0.6 : 1, marginTop: '1rem' }}
        >
          {isProcessing ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
              <span className="spinner"></span> Processando Transcrição...
            </span>
          ) : (
            '🚀 Transcrever Documento'
          )}
        </button>
      </form>
    </div>
  );
}
