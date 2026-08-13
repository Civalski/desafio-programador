import React, { useState } from 'react';

export function UploadZone({ onUpload, isProcessing }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState('');

  const selectFile = (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
      setSelectedFile(null);
      setError('Selecione um arquivo PDF válido.');
      return;
    }
    setError('');
    setSelectedFile(file);
  };

  const submit = (event) => {
    event.preventDefault();
    if (!selectedFile) return setError('Selecione um PDF para continuar.');
    onUpload(selectedFile);
  };

  return <div className={`upload-card ${isDragOver ? 'drag-over' : ''}`}
    onDragOver={(event) => { event.preventDefault(); setIsDragOver(true); }}
    onDragLeave={() => setIsDragOver(false)}
    onDrop={(event) => { event.preventDefault(); setIsDragOver(false); selectFile(event.dataTransfer.files?.[0]); }}>
    <div style={{ textAlign: 'center', marginBottom: '1rem' }}><span className="user-doc-badge">FOLHA DE PAGAMENTO</span></div>
    <h2 className="upload-title">Transcrição e auditoria de holerites</h2>
    <p className="upload-description">Envie um holerite em PDF para extrair verbas, referências, bases e totais.</p>
    <form onSubmit={submit} className="upload-form">
      <input type="file" id="pdf-input" accept="application/pdf,.pdf" onChange={(event) => selectFile(event.target.files?.[0])} style={{ display: 'none' }} />
      <label htmlFor="pdf-input" className="btn-secondary" style={{ display: 'inline-block', cursor: 'pointer', marginBottom: '1.25rem' }}>{selectedFile ? `📎 ${selectedFile.name}` : 'Escolher PDF de holerite'}</label>
      {error && <p style={{ color: '#991b1b', marginTop: '0.75rem' }}>{error}</p>}
      <button type="submit" className="btn-upload" disabled={isProcessing || !selectedFile} style={{ opacity: isProcessing || !selectedFile ? 0.4 : 1, width: '100%' }}>{isProcessing ? 'Processando folha de pagamento...' : 'Transcrever folha de pagamento'}</button>
    </form>
  </div>;
}
