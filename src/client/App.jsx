import React, { useState, useEffect } from 'react';
import { UploadZone } from './components/UploadZone.jsx';
import { PdfViewer } from './components/PdfViewer.jsx';
import { EditableTable } from './components/EditableTable.jsx';
import { ExportBar } from './components/ExportBar.jsx';
import { TranscriptionProgress } from './components/TranscriptionProgress.jsx';

export default function App() {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [tipo, setTipo] = useState('holerite');
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState('idle');
  const [jobProgress, setJobProgress] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Polling de status do job assíncrono
  useEffect(() => {
    if (!jobId || jobStatus !== 'processando') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/transcricoes/${jobId}`);
        if (!res.ok) throw new Error('Falha ao consultar status da transcrição.');
        const data = await res.json();

        if (data.progress) {
          setJobProgress(data.progress);
        }

        if (data.status === 'concluido') {
          setExtractedData(data.value);
          setJobStatus('concluido');
          clearInterval(interval);
        } else if (data.status === 'erro') {
          setErrorMessage(data.erro || 'Falha ao processar documento.');
          setJobStatus('erro');
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Erro no polling:', err);
        setErrorMessage(err.message);
        setJobStatus('erro');
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [jobId, jobStatus]);

  const handleUpload = async (file, documentType) => {
    setUploadedFile(file);
    setTipo(documentType);
    setJobStatus('processando');
    setJobProgress({
      current: 0,
      total: 0,
      percentage: 0,
      message: 'Enviando arquivo ao servidor...',
      logs: [`[${new Date().toLocaleTimeString('pt-BR')}] 📤 Enviando arquivo ao servidor...`]
    });
    setErrorMessage('');
    setExtractedData(null);

    try {
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('tipo', documentType);

      const res = await fetch('/api/transcricoes', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.erro || 'Erro ao enviar arquivo.');
      }

      const { id } = await res.json();
      setJobId(id);
    } catch (err) {
      console.error('Erro de upload:', err);
      setErrorMessage(err.message);
      setJobStatus('erro');
    }
  };

  const handleSaveData = async () => {
    if (!jobId || !extractedData) return;

    const res = await fetch(`/api/transcricoes/${jobId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: extractedData }),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.erro || 'Falha ao salvar correções.');
    }
  };

  const handleReset = () => {
    setUploadedFile(null);
    setJobId(null);
    setJobStatus('idle');
    setJobProgress(null);
    setExtractedData(null);
    setErrorMessage('');
  };

  return (
    <div className={'app-shell'}>
      <main className="container" style={{ paddingTop: '2.5rem' }}>
        {jobStatus === 'idle' && (
          <UploadZone onUpload={handleUpload} isProcessing={false} />
        )}

        {jobStatus === 'processando' && (
          <TranscriptionProgress 
            file={uploadedFile} 
            tipo={tipo} 
            progress={jobProgress} 
          />
        )}

        {jobStatus === 'erro' && (
          <div className="upload-card">
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-main)' }}>Erro na Transcrição</h2>
            <p style={{ color: 'var(--text-muted)', margin: '1rem 0', fontSize: '0.875rem' }}>{errorMessage}</p>
            <button className="btn-secondary" onClick={handleReset}>Tentar Novamente</button>
          </div>
        )}

        {jobStatus === 'concluido' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div className="split-view">
              <PdfViewer file={uploadedFile} />
              <EditableTable 
                data={extractedData} 
                tipo={tipo} 
                onChangeData={setExtractedData} 
              />
            </div>

            <ExportBar 
              jobId={jobId} 
              onSave={handleSaveData} 
              onReset={handleReset} 
            />
          </div>
        )}
      </main>
    </div>
  );
}
