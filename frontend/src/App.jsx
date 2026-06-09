import React, { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

function App() {
  const [keywords, setKeywords] = useState('');
  const [sede, setSede] = useState('all');
  const [tipo, setTipo] = useState('all');
  const [anno, setAnno] = useState('all');

  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [selectedJudgments, setSelectedJudgments] = useState({});
  const [loadingExport, setLoadingExport] = useState(false);
  const [selectedJudgment, setSelectedJudgment] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState(null);

  const [autoSummaries, setAutoSummaries] = useState({});
  const [loadingAutoSummaries, setLoadingAutoSummaries] = useState({});

  // List of administrative court divisions
  const sediList = [
    { value: 'all', label: 'Tutte le Sedi' },
    { value: 'Consiglio di Stato', label: 'Consiglio di Stato' },
    { value: 'C.G.A.R.S', label: 'C.G.A.R.S (Sicilia)' },
    { value: 'Roma', label: 'Roma (Lazio)' },
    { value: 'Milano', label: 'Milano (Lombardia)' },
    { value: 'Napoli', label: 'Napoli (Campania)' },
    { value: 'Bari', label: 'Bari (Puglia)' },
    { value: 'Bologna', label: 'Bologna (Emilia-Romagna)' },
    { value: 'Catania', label: 'Catania (Sicilia - Sez. Staccata)' },
    { value: 'Firenze', label: 'Firenze (Toscana)' },
    { value: 'Genova', label: 'Genova (Liguria)' },
    { value: 'Palermo', label: 'Palermo (Sicilia)' },
    { value: 'Torino', label: 'Torino (Piemonte)' },
    { value: 'Venezia', label: 'Venezia (Veneto)' }
  ];

  // List of decision types
  const tipiList = [
    { value: 'all', label: 'Tutti i Provvedimenti' },
    { value: 'Sentenza', label: 'Sentenza' },
    { value: 'Ordinanza', label: 'Ordinanza' },
    { value: 'Decreto', label: 'Decreto' },
    { value: 'Parere', label: 'Parere' },
    { value: 'Adunanza Plenaria', label: 'Adunanza Plenaria' }
  ];

  // List of years
  const anniList = ['all', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018'];

  const triggerAutoSummaries = async (items) => {
    const firstFive = items.slice(0, 5);
    for (const item of firstFive) {
      // Add a 3-second delay between requests to respect Gemini free-tier rate limits
      if (item !== firstFive[0]) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      setLoadingAutoSummaries(prev => ({ ...prev, [item.id]: true }));
      try {
        const response = await fetch(`${API_URL}/api/summarize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url: item.url, format: 'quick' })
        });
        const data = await response.json();
        if (response.ok && data.summary) {
          setAutoSummaries(prev => ({ ...prev, [item.id]: data.summary }));
        }
      } catch (err) {
        console.error('Failed auto-summary for:', item.id, err);
      } finally {
        setLoadingAutoSummaries(prev => ({ ...prev, [item.id]: false }));
      }
    }
  };

  const executeSearch = async (pageToFetch = 1) => {
    if (!keywords.trim()) return;

    setLoadingSearch(true);
    setError(null);
    setSearched(true);
    setResults([]);
    setAutoSummaries({});
    setLoadingAutoSummaries({});
    setPage(pageToFetch);
    setSelectedJudgments({}); // Reset selection on new search

    try {
      const response = await fetch(`${API_URL}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ keywords, sede, tipo, anno, page: pageToFetch })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Errore durante la ricerca.');
      }

      setResults(data.results || []);
      setTotalResults(data.totalResults || 0);
      // Avvia la generazione automatica delle sintesi veloci per i primi 5 risultati
      triggerAutoSummaries(data.results || []);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    executeSearch(1);
  };

  const toggleSelect = (judgment) => {
    setSelectedJudgments(prev => {
      const next = { ...prev };
      if (next[judgment.id]) {
        delete next[judgment.id];
      } else {
        // Enforce safety limit on selection
        if (Object.keys(prev).length >= 50) {
          alert("Attenzione: puoi selezionare al massimo 50 sentenze alla volta per evitare sovraccarichi o blocchi del portale.");
          return prev;
        }
        next[judgment.id] = judgment;
      }
      return next;
    });
  };

  const isAllSelected = results.length > 0 && results.every(item => selectedJudgments[item.id]);

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedJudgments(prev => {
        const next = { ...prev };
        results.forEach(item => {
          delete next[item.id];
        });
        return next;
      });
    } else {
      setSelectedJudgments(prev => {
        const next = { ...prev };
        let count = Object.keys(prev).length;
        for (const item of results) {
          if (!next[item.id]) {
            if (count >= 50) {
              alert("Attenzione: è stato raggiunto il limite massimo di 50 sentenze selezionabili contemporaneamente.");
              break;
            }
            next[item.id] = item;
            count++;
          }
        }
        return next;
      });
    }
  };

  const handleExportSelected = async () => {
    const selectedList = Object.values(selectedJudgments);
    if (selectedList.length === 0) return;

    if (selectedList.length > 50) {
      alert(`Attenzione: puoi esportare al massimo 50 sentenze alla volta. Attualmente ne hai selezionate ${selectedList.length}. Deseleziona alcune sentenze prima di procedere.`);
      return;
    }

    setLoadingExport(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ judgments: selectedList })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Errore durante la generazione dell\'esportazione.');
      }

      const blob = new Blob([data.text], { type: 'text/plain;charset=utf-8' });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `sentenze_unificate_${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoadingExport(false);
    }
  };

  const handleSummarize = async (judgment, format = 'detailed') => {
    setLoadingSummary(true);
    setSelectedJudgment(judgment);
    setSelectedSummary(null);
    setDrawerOpen(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: judgment.url, format })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Errore durante la generazione del riassunto.');
      }

      setSelectedSummary(data.summary);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoadingSummary(false);
    }
  };

  // Safe simple Markdown parser
  const renderMarkdown = (text) => {
    if (!text) return '';
    return text
      .split('\n')
      .map(line => {
        let cleanLine = line.trim();
        if (cleanLine.startsWith('# ')) {
          return `<h1>${cleanLine.substring(2)}</h1>`;
        }
        if (cleanLine.startsWith('## ')) {
          return `<h2>${cleanLine.substring(3)}</h2>`;
        }
        if (cleanLine.startsWith('### ')) {
          return `<h3>${cleanLine.substring(4)}</h3>`;
        }
        if (cleanLine.startsWith('- ') || cleanLine.startsWith('* ')) {
          return `<li>${cleanLine.substring(2)}</li>`;
        }
        return line ? `<p>${line}</p>` : '';
      })
      .join('')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  };

  return (
    <div className="app-container">
      {/* Sidebar Controls */}
      <aside className="sidebar">
        <div className="brand-section">
          <h1 className="brand-logo">
            Lex<span>Summarizer</span>
          </h1>
        </div>
        <div className="brand-subtitle">Ricerca Sentenze TAR</div>

        <form onSubmit={handleSearchSubmit} className="search-form">
          <div className="form-group">
            <label className="form-label" htmlFor="keywords">Parole chiave</label>
            <input
              id="keywords"
              type="text"
              className="form-input"
              placeholder="es. silenzio assenso espropriazione"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="sede">Sede Giudiziaria</label>
            <select
              id="sede"
              className="form-select"
              value={sede}
              onChange={(e) => setSede(e.target.value)}
            >
              {sediList.map(item => (
                <option key={item.value} value={item.value} style={{ color: '#111827', backgroundColor: '#ffffff' }}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="tipo">Tipologia Provvedimento</label>
            <select
              id="tipo"
              className="form-select"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              {tipiList.map(item => (
                <option key={item.value} value={item.value} style={{ color: '#111827', backgroundColor: '#ffffff' }}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="anno">Anno</label>
            <select
              id="anno"
              className="form-select"
              value={anno}
              onChange={(e) => setAnno(e.target.value)}
            >
              {anniList.map(year => (
                <option key={year} value={year} style={{ color: '#111827', backgroundColor: '#ffffff' }}>{year === 'all' ? 'Tutti gli Anni' : year}</option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn-search" disabled={loadingSearch}>
            {loadingSearch ? (
              <>
                <span className="pulse">Ricerca in corso...</span>
              </>
            ) : (
              <>Cerca Sentenze</>
            )}
          </button>
        </form>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {error && !drawerOpen && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-error)', padding: '1rem', borderRadius: 'var(--radius-md)', color: 'var(--color-error)' }}>
            <strong>Errore:</strong> {error}
          </div>
        )}

        {/* Results Header */}
        {searched && (
          <div className="results-header">
            <h2 className="results-title">Risultati della Ricerca</h2>
            <span className="results-count">
              {loadingSearch ? '...' : `${results.length} trovati`}
            </span>
          </div>
        )}

        {/* Loading Indicator */}
        {loadingSearch && (
          <div className="loading-container">
            <div className="spinner"></div>
            <p className="pulse">Navigazione sul portale della Giustizia Amministrativa...</p>
          </div>
        )}

        {/* Selection Bulk Actions Bar */}
        {!loadingSearch && results.length > 0 && (
          <div className="bulk-actions-bar" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            marginBottom: '1rem',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              Seleziona tutte le sentenze della pagina ({results.length})
            </label>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-muted)' }}>
                Selezionate: <strong style={{ color: 'var(--color-accent)' }}>{Object.keys(selectedJudgments).length}</strong> / 50 max
              </span>
              
              <button
                onClick={handleExportSelected}
                disabled={Object.keys(selectedJudgments).length === 0 || loadingExport}
                className="btn-action btn-action-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  opacity: (Object.keys(selectedJudgments).length === 0 || loadingExport) ? 0.5 : 1,
                  cursor: (Object.keys(selectedJudgments).length === 0 || loadingExport) ? 'not-allowed' : 'pointer'
                }}
              >
                {loadingExport ? 'Esportazione in corso...' : 'Scarica Testo Unificato (.txt)'}
              </button>
            </div>
          </div>
        )}

        {/* Results List */}
        {!loadingSearch && results.length > 0 && (
          <div className="results-list">
            {results.map((item) => (
              <article key={item.id} className="judgment-card" style={{ position: 'relative', paddingLeft: '3.5rem' }}>
                <input
                  type="checkbox"
                  checked={!!selectedJudgments[item.id]}
                  onChange={() => toggleSelect(item)}
                  style={{
                    position: 'absolute',
                    left: '1.2rem',
                    top: '1.5rem',
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer'
                  }}
                />
                <div className="card-top">
                  <div className="tag-container">
                    <span className="badge badge-tipo">{item.tipo || 'Provvedimento'}</span>
                    <span className="badge badge-sede">{item.sede || 'N/A'}</span>
                    {item.ricorso && <span className="badge badge-ricorso">Ric. {item.ricorso}</span>}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-accent)', fontWeight: 600 }}>
                    N. {item.numeroProvv}
                  </div>
                </div>

                <h3 className="card-title">
                  {item.tipo} {item.sede} Sez. {item.sezione} - N. {item.numeroProvv}
                </h3>

                {item.snippet && (
                  <p className="card-snippet" dangerouslySetInnerHTML={{ __html: item.snippet }}></p>
                )}

                {/* Auto Quick Summary Box */}
                {(autoSummaries[item.id] || loadingAutoSummaries[item.id]) && (
                  <div className="auto-summary-box" style={{ 
                    marginTop: '0.5rem', 
                    padding: '1rem', 
                    borderRadius: 'var(--radius-md)', 
                    backgroundColor: 'rgba(212, 175, 55, 0.05)', 
                    border: '1px dashed rgba(212, 175, 55, 0.2)' 
                  }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-accent)', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="pulse-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-accent)', display: 'inline-block' }}></span>
                      Sintesi Veloce Automatica
                    </div>
                    {loadingAutoSummaries[item.id] ? (
                      <p className="pulse" style={{ fontSize: '0.9rem', color: 'var(--color-muted)' }}>Generazione sintesi in corso...</p>
                    ) : (
                      <div 
                        className="summary-body" 
                        style={{ fontSize: '0.9rem', color: 'var(--color-text)' }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(autoSummaries[item.id]) }}
                      ></div>
                    )}
                  </div>
                )}

                <div className="card-footer">
                  <span className="ecli-text">{item.ecli}</span>
                  <div className="card-actions">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-action"
                    >
                      Apri Originale
                    </a>
                    <button
                      onClick={() => handleSummarize(item, 'quick')}
                      className="btn-action"
                      style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
                    >
                      Sintesi Veloce
                    </button>
                    <button
                      onClick={() => handleSummarize(item, 'detailed')}
                      className="btn-action btn-action-primary"
                    >
                      Riassunto Completo
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Controlli Paginazione */}
        {!loadingSearch && results.length > 0 && totalResults > 20 && (
          <div className="pagination-controls" style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '1.5rem',
            marginTop: '2rem',
            padding: '1rem',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            <button
              onClick={() => executeSearch(page - 1)}
              disabled={page <= 1}
              className="btn-action"
              style={{
                padding: '0.5rem 1rem',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                opacity: page <= 1 ? 0.5 : 1
              }}
            >
              &larr; Precedente
            </button>
            
            <span style={{ fontSize: '0.9rem', color: 'var(--color-muted)' }}>
              Pagina <strong style={{ color: 'var(--color-text)' }}>{page}</strong> di{' '}
              <strong style={{ color: 'var(--color-text)' }}>{Math.ceil(totalResults / 20)}</strong>{' '}
              ({totalResults} risultati)
            </span>
            
            <button
              onClick={() => executeSearch(page + 1)}
              disabled={page >= Math.ceil(totalResults / 20)}
              className="btn-action"
              style={{
                padding: '0.5rem 1rem',
                cursor: page >= Math.ceil(totalResults / 20) ? 'not-allowed' : 'pointer',
                opacity: page >= Math.ceil(totalResults / 20) ? 0.5 : 1
              }}
            >
              Successiva &rarr;
            </button>
          </div>
        )}

        {/* Empty States */}
        {!loadingSearch && !searched && (
          <div className="empty-state">
            <h3>Nessuna ricerca effettuata</h3>
            <p>Inserisci delle parole chiave nella barra laterale per cercare provvedimenti ufficiali del TAR e del Consiglio di Stato.</p>
          </div>
        )}

        {!loadingSearch && searched && results.length === 0 && (
          <div className="empty-state">
            <h3>Nessun risultato trovato</h3>
            <p>Prova ad utilizzare parole chiave diverse o a rimuovere i filtri di Sede, Tipo o Anno.</p>
          </div>
        )}
      </main>

      {/* Summary Slide-out Drawer */}
      <aside className={`summary-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <h2 className="drawer-title">Riassunto Sentenza</h2>
          <button className="btn-close" onClick={() => setDrawerOpen(false)}>
            &times;
          </button>
        </div>

        {error && drawerOpen && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-error)', padding: '1rem', borderRadius: 'var(--radius-md)', color: 'var(--color-error)' }}>
            <strong>Errore:</strong> {error}
          </div>
        )}

        {loadingSummary ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p className="pulse">Estrazione del testo della sentenza e generazione del riassunto tramite Google Gemini API...</p>
          </div>
        ) : (
          selectedSummary && (
            <div
              className="summary-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedSummary) }}
            ></div>
          )
        )}
      </aside>
    </div>
  );
}

export default App;
