import React, { useEffect, useState } from 'react';

export function PdfViewer({ file, pdfUrl }) {
  const [objectUrl, setObjectUrl] = useState('');

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setObjectUrl(url);
      return () => URL.revokeObjectURL(url);
    } else if (pdfUrl) {
      setObjectUrl(pdfUrl);
    }
  }, [file, pdfUrl]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>📄 Documento Original (PDF)</span>
        </div>
        {file && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{file.name}</span>}
      </div>

      {objectUrl ? (
        <iframe 
          src={objectUrl} 
          className="pdf-viewer" 
          title="Visualizador de PDF Original"
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          Nenhum arquivo PDF carregado.
        </div>
      )}
    </div>
  );
}
