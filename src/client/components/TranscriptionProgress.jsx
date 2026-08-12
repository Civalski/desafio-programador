import React from 'react';

export function TranscriptionProgress({ file, tipo, progress }) {
  const percentage = Math.min(100, Math.max(0, progress?.percentage || 0));
  const current = progress?.current || 0;
  const total = progress?.total || 0;
  const message = progress?.message || 'Processando transcrição do documento...';

  const docTypeName = tipo === 'holerite' ? 'Holerite' : 'Cartão de Ponto';

  // Define os 3 passos visuais para o usuário final
  const steps = [
    {
      id: 1,
      title: 'Leitura do Documento',
      desc: total > 0 ? `${total} página(s) identificada(s)` : 'Analisando páginas do PDF',
      isCompleted: percentage >= 15,
      isActive: percentage < 15
    },
    {
      id: 2,
      title: 'Extração Inteligente (IA)',
      desc: current > 0 && total > 0 ? `Processando página ${current} de ${total}` : 'Reconhecendo dados e verbas',
      isCompleted: percentage >= 90,
      isActive: percentage >= 15 && percentage < 90
    },
    {
      id: 3,
      title: 'Estruturação da Tabela',
      desc: 'Organizando resultados para conferência',
      isCompleted: percentage === 100,
      isActive: percentage >= 90 && percentage < 100
    }
  ];

  return (
    <div className="upload-card progress-card-user" style={{ textAlign: 'left', padding: '2.5rem', maxWidth: '680px', margin: '0 auto 1.5rem auto' }}>
      
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span className="user-live-spinner"></span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
              Transcrevendo Documento
            </h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.35rem' }}>
            {file?.name ? `📄 ${file.name}` : 'Processando arquivo PDF...'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="user-doc-badge">
            {docTypeName}
          </span>
          {total > 0 && (
            <span className="user-step-badge">
              {current > 0 ? `Página ${current} de ${total}` : `${total} pág(s)`}
            </span>
          )}
        </div>
      </div>

      {/* Porcentagem e Barra de Carregamento Principal */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {message}
          </span>
          <span style={{ fontSize: '1.65rem', fontWeight: 700, color: 'var(--accent-black)', letterSpacing: '-0.02em' }}>
            {percentage}%
          </span>
        </div>

        {/* Trilha da Barra de Progresso */}
        <div className="user-progress-track">
          <div 
            className="user-progress-fill" 
            style={{ width: `${percentage}%` }}
          >
            <div className="user-progress-shimmer"></div>
          </div>
        </div>
      </div>

      {/* Etapas de Processamento para Usuário Final */}
      <div className="user-steps-container">
        {steps.map((step) => (
          <div 
            key={step.id} 
            className={`user-step-item ${step.isCompleted ? 'completed' : ''} ${step.isActive ? 'active' : ''}`}
          >
            <div className="user-step-icon-col">
              <div className="user-step-circle">
                {step.isCompleted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : step.isActive ? (
                  <span className="user-step-pulse"></span>
                ) : (
                  <span className="user-step-dot"></span>
                )}
              </div>
              {step.id < steps.length && <div className="user-step-line"></div>}
            </div>

            <div className="user-step-text-col">
              <div className="user-step-title">{step.title}</div>
              <div className="user-step-desc">{step.desc}</div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
