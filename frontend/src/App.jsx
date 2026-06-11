import React, { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

const getAbsoluteUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = API_URL || window.location.origin;
  return `${base.replace(/\/$/, '')}${url}`;
};

const DATA = {
  giurisdizione: {
    l1Label: "Materia / plesso",
    options: {
      amministrativa: {
        label: "Amministrativa",
        gradi: {
          tar: {
            label: "Primo grado",
            sub: "T.A.R.",
            luoghi: ["TAR Veneto", "TAR Lazio", "TAR Lombardia", "TAR Trentino-A.A.", "TAR Emilia-Romagna", "Tutti i T.A.R."]
          },
          cds: {
            label: "Appello",
            sub: "Consiglio di Stato",
            luoghi: ["Roma — sede unica (Sez. I–VII)", "Adunanza plenaria"]
          },
          consultiva: {
            label: "Consultiva",
            sub: "Pareri CdS",
            luoghi: ["Roma — Sez. consultive"]
          }
        }
      },
      ordinaria: {
        label: "Ordinaria",
        gradi: {
          trib: {
            label: "Primo grado",
            sub: "Tribunale",
            luoghi: ["Vicenza", "Verona", "Venezia", "Padova", "Treviso", "Rovereto", "Tutti i Tribunali"]
          },
          app: {
            label: "Appello",
            sub: "Corte d'Appello",
            luoghi: ["Venezia", "Trento", "Brescia", "Milano", "Tutte le Corti d'Appello"]
          },
          cass: {
            label: "Legittimità",
            sub: "Cassazione",
            luoghi: ["Roma — Sez. civili", "Roma — Sezioni Unite"]
          }
        }
      },
      contabile: {
        label: "Contabile",
        gradi: {
          giurReg: {
            label: "Giurisdizionale reg.",
            sub: "Corte dei Conti",
            luoghi: ["Sez. Veneto", "Sez. Trentino-A.A.", "Sez. Lombardia", "Tutte le Sezioni regionali"]
          },
          giurApp: {
            label: "Giurisdizionale app.",
            sub: "Sez. centrali",
            luoghi: ["Roma — Sez. app.", "Sezioni Riunite"]
          },
          controllo: {
            label: "Controllo",
            sub: "Sez. di controllo",
            luoghi: ["Sez. Veneto", "Sez. Riunite controllo", "Tutte le Sezioni"]
          }
        }
      },
      costituzionale: {
        label: "Costituzionale",
        gradi: {
          unico: {
            label: "Giudizio cost.",
            sub: "Corte Cost.",
            luoghi: ["Roma — sede unica"]
          }
        }
      },
      tributaria: {
        label: "Tributaria",
        gradi: {
          primo: {
            label: "Primo grado",
            sub: "C.G.T. I grado",
            luoghi: ["Vicenza", "Verona", "Padova", "Tutte le sedi"]
          },
          secondo: {
            label: "Secondo grado",
            sub: "C.G.T. II grado",
            luoghi: ["Veneto", "Tutte le sedi"]
          },
          legitt: {
            label: "Legittimità",
            sub: "Cassazione trib.",
            luoghi: ["Roma — Sez. tributaria"]
          }
        }
      }
    }
  },
  autorita: {
    l1Label: "Autorità",
    options: {
      anac: { label: "ANAC", tipi: ["Delibere", "Pareri (precontenzioso)", "Atti di regolazione", "Provv. sanzionatori"] },
      agcm: { label: "AGCM", sub: "Antitrust", tipi: ["Provvedimenti", "Bollettino", "Segnalazioni AS"] },
      agcom: { label: "AGCOM", tipi: ["Delibere", "Provvedimenti"] },
      garante: { label: "Garante Privacy", tipi: ["Provvedimenti", "Pareri", "Provv. sanzionatori"] },
      arera: { label: "ARERA", tipi: ["Delibere", "Documenti per la consultazione"] },
      consob: { label: "CONSOB", tipi: ["Delibere", "Comunicazioni"] }
    }
  }
};

const ROUTE = {
  amministrativa: "giustizia-amministrativa.it",
  contabile: "banchedati.corteconti.it",
  costituzionale: "cortecostituzionale.it",
  ordinaria: "fonte autenticata — verifica accesso",
  tributaria: "def.finanze.it",
  anac: "anticorruzione.it / open-data",
  agcm: "agcm.it",
  agcom: "agcom.it",
  garante: "garanteprivacy.it",
  arera: "arera.it",
  consob: "consob.it"
};

const INTEGRATED_PLESSI = ['amministrativa', 'contabile', 'costituzionale', 'anac', 'garante', 'agcm', 'agcom', 'arera', 'consob'];

const SOURCES = [
  { k: "tar", fam: "Giurisdizione", label: "T.A.R.", sub: "Amministrativa · I grado", open: true, route: "giustizia-amministrativa.it" },
  { k: "cds", fam: "Giurisdizione", label: "Consiglio di Stato", sub: "Appello · Pareri", open: true, route: "giustizia-amministrativa.it" },
  { k: "conti", fam: "Giurisdizione", label: "Corte dei Conti", sub: "Giurisdizione · Controllo", open: true, route: "banchedati.corteconti.it" },
  { k: "cost", fam: "Giurisdizione", label: "Corte Costituzionale", sub: "Legittimità costituzionale", open: true, route: "cortecostituzionale.it" },
  { k: "cgt", fam: "Giurisdizione", label: "Giustizia Tributaria", sub: "C.G.T. I/II grado", open: false, route: "in attesa di integrazione" },
  { k: "cass", fam: "Giurisdizione", label: "Cassazione", sub: "Ordinaria · Legittimità", open: false, route: "ItalGiure — autenticato" },
  { k: "merito", fam: "Giurisdizione", label: "Merito civile", sub: "Tribunali · Corti d'Appello", open: false, route: "BDP — divieto tratt. autom." },
  { k: "anac", fam: "Autorità indipendenti", label: "ANAC", sub: "Delibere · Pareri", open: true, route: "anticorruzione.it" },
  { k: "agcm", fam: "Autorità indipendenti", label: "AGCM", sub: "Antitrust", open: true, route: "agcm.it" },
  { k: "agcom", fam: "Autorità indipendenti", label: "AGCOM", sub: "Delibere", open: true, route: "agcom.it" },
  { k: "garante", fam: "Autorità indipendenti", label: "Garante Privacy", sub: "Provvedimenti", open: true, route: "garanteprivacy.it" },
  { k: "arera", fam: "Autorità indipendenti", label: "ARERA", sub: "Delibere", open: true, route: "arera.it" },
  { k: "consob", fam: "Autorità indipendenti", label: "CONSOB", sub: "Delibere · Comunicazioni", open: true, route: "consob.it" }
];

function App() {
  // Search engine state
  const [mode, setMode] = useState('guidata'); // 'guidata' | 'global'
  const [macro, setMacro] = useState(null); // 'giurisdizione' | 'autorita'
  const [l1, setL1] = useState(null);
  const [l2, setL2] = useState(null);
  const [l3, setL3] = useState(null);
  const [globalSources, setGlobalSources] = useState(new Set(SOURCES.filter(s => s.open).map(s => s.k)));
  const [terms, setTerms] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [combo, setCombo] = useState('and'); // 'and' | 'or' | 'phrase'

  // Results & APIs state
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const pageSize = 60;

  const [selectedSummary, setSelectedSummary] = useState(null);
  const [selectedJudgments, setSelectedJudgments] = useState({});
  const [loadingExport, setLoadingExport] = useState(false);
  const [selectedJudgment, setSelectedJudgment] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState(null);

  const [autoSummaries, setAutoSummaries] = useState({});
  const [loadingAutoSummaries, setLoadingAutoSummaries] = useState({});

  // Helper functions for tags
  const addTerm = (text) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    const parts = cleanText.split(',').map(s => s.trim()).filter(Boolean);
    setTerms(prev => {
      const next = [...prev];
      parts.forEach(p => {
        if (!next.includes(p)) next.push(p);
      });
      return next;
    });
    setInputValue('');
  };

  const removeTerm = (index) => {
    setTerms(prev => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTerm(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && terms.length > 0) {
      removeTerm(terms.length - 1);
    }
  };

  const handleBlur = () => {
    addTerm(inputValue);
  };

  const resetGuided = () => {
    setMacro(null);
    setL1(null);
    setL2(null);
    setL3(null);
    setResults([]);
    setSearched(false);
  };

  // Breadcrumbs logic
  const getGuidedLabels = () => {
    if (!macro) return {};
    const b = DATA[macro];
    const o = b.options[l1] || {};
    const out = {};
    out.macro = macro === "giurisdizione" ? "Giurisdizione" : "Autorità indipendenti";
    if (l1) {
      out.l1 = o.label + (o.sub ? ` ${o.sub}` : "");
      if (macro === "giurisdizione") {
        if (l2) {
          const gr = o.gradi[l2];
          out.l2 = `${gr.label} · ${gr.sub}`;
          if (l3 != null) out.l3 = gr.luoghi[+l3];
        }
      } else if (l2 != null) {
        out.l2 = o.tipi[+l2];
      }
    }
    return out;
  };

  // Build query display markup (React elements)
  const renderQueryString = () => {
    let head = null;
    if (mode === "guidata") {
      if (!macro) {
        return <span className="q-empty">Scegli un percorso o le fonti, poi aggiungi le parole.</span>;
      }
      const L = getGuidedLabels();
      const parts = [<span key="macro" className="q-label">{L.macro.toUpperCase()}</span>];
      if (L.l1) parts.push(<span key="sep-1" className="q-sep">›</span>, <span key="l1">{L.l1.toUpperCase()}</span>);
      if (L.l2) parts.push(<span key="sep-2" className="q-sep">›</span>, <span key="l2">{L.l2.toUpperCase()}</span>);
      if (L.l3) parts.push(<span key="sep-3" className="q-sep">›</span>, <span key="l3">{L.l3.toUpperCase()}</span>);
      head = <React.Fragment>{parts}</React.Fragment>;
    } else {
      head = (
        <React.Fragment>
          <span className="q-label">TUTTE LE FONTI</span>
          <span className="q-sep">›</span>
          {globalSources.size} selezionate
        </React.Fragment>
      );
    }

    if (terms.length === 0) {
      return head;
    }

    const opSymbol = combo === "and" ? "+" : combo === "or" ? "/" : " ";
    const kwElements = [];
    
    if (combo === "phrase") {
      const phraseText = terms.map(t => t.replace(/^-/, '')).join(' ');
      kwElements.push(<span key="phrase" className="q-kw">"{phraseText}"</span>);
    } else {
      terms.forEach((t, i) => {
        if (i > 0) {
          kwElements.push(<span key={`sep-kw-${i}`} className="q-op">{opSymbol}</span>);
        }
        if (t.startsWith("-")) {
          kwElements.push(<span key={`kw-${i}`} className="q-ex">{t.slice(1)}</span>);
        } else {
          kwElements.push(<span key={`kw-${i}`} className="q-kw">"{t}"</span>);
        }
      });
    }

    return (
      <React.Fragment>
        {head}
        <span className="q-sep">›</span>
        {kwElements}
      </React.Fragment>
    );
  };

  // Check search button disabled state
  const isSearchDisabled = () => {
    if (mode === "guidata") {
      if (!macro) return true;
      if (macro === "giurisdizione") return l3 == null;
      return l2 == null;
    }
    return globalSources.size === 0;
  };

  const triggerAutoSummaries = async (items) => {
    const firstFive = items.slice(0, 5);
    for (const item of firstFive) {
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
          body: JSON.stringify({ url: getAbsoluteUrl(item.url), format: 'quick' })
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
    setLoadingSearch(true);
    setError(null);
    setSearched(true);
    setResults([]);
    setAutoSummaries({});
    setLoadingAutoSummaries({});
    setPage(pageToFetch);
    setSelectedJudgments({});

    let currentTerms = [...terms];
    if (inputValue.trim()) {
      const cleanText = inputValue.trim();
      const parts = cleanText.split(',').map(s => s.trim()).filter(Boolean);
      parts.forEach(p => {
        if (!currentTerms.includes(p)) currentTerms.push(p);
      });
      setTerms(currentTerms);
      setInputValue('');
    }

    let bodyParams = {};
    if (mode === "guidata") {
      const L = getGuidedLabels();
      bodyParams = {
        modo: "guidato",
        fonte: macro,
        plesso: l1,
        grado: macro === "giurisdizione" ? l2 : null,
        sede: macro === "giurisdizione" && l3 != null ? L.l3 : null,
        tipo: macro === "autorita" && l2 != null ? L.l2 : null
      };
    } else {
      bodyParams = {
        modo: "globale",
        fonti: Array.from(globalSources)
      };
    }
    bodyParams.parole = currentTerms.length ? currentTerms : null;
    bodyParams.logica = currentTerms.length ? combo : null;
    bodyParams.page = pageToFetch;
    bodyParams.pageSize = pageSize;

    try {
      const response = await fetch(`${API_URL}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyParams)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Errore durante la ricerca.');
      }

      setResults(data.results || []);
      setTotalResults(data.totalResults || 0);
      triggerAutoSummaries(data.results || []);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoadingSearch(false);
    }
  };

  const toggleSelect = (judgment) => {
    setSelectedJudgments(prev => {
      const next = { ...prev };
      if (next[judgment.id]) {
        delete next[judgment.id];
      } else {
        if (Object.keys(prev).length >= 60) {
          alert("Attenzione: puoi selezionare al massimo 60 sentenze alla volta.");
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
            if (count >= 60) {
              alert("Attenzione: è stato raggiunto il limite massimo di 60 sentenze selezionabili.");
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
        body: JSON.stringify({ url: getAbsoluteUrl(judgment.url), format })
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

  const toggleGlobalSource = (key) => {
    setGlobalSources(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectOnlyOpenSources = () => {
    setGlobalSources(new Set(SOURCES.filter(s => s.open).map(s => s.k)));
  };

  const clearGlobalSources = () => {
    setGlobalSources(new Set());
  };

  // Cascade selection handlers
  const handleMacroClick = (m) => {
    setMacro(m);
    setL1(null);
    setL2(null);
    setL3(null);
  };

  const handleL1Click = (val) => {
    setL1(val);
    setL2(null);
    setL3(null);
  };

  const handleL2Click = (val) => {
    setL2(val);
    setL3(null);
  };

  const handleL3Click = (val) => {
    setL3(val);
  };

  return (
    <React.Fragment>
      <header className="topbar">
        <div className="wordmark">Studio Legale <span>Francesco Poli</span></div>
        <div className="addr">Corso Palladio 134 — Vicenza</div>
      </header>

      <main className="wrap">
        <div className="eyebrow">Banche dati · accesso unificato</div>
        <h1>Ricerca giurisprudenziale</h1>
        <p className="lede">Segui un percorso guidato — fonte, grado, sede — oppure cerca su tutte le banche dati insieme. Poi affina per una parola o per un insieme di parole.</p>

        <section className="card">
          <div className="arch" aria-hidden="true">
            <svg viewBox="0 0 200 200" fill="none" stroke="var(--ink)" strokeWidth="1.4">
              <path d="M30 195 V90 A70 70 0 0 1 170 90 V195"/>
              <path d="M52 195 V96 A48 48 0 0 1 148 96 V195"/>
              <line x1="14" y1="90" x2="186" y2="90"/><line x1="20" y1="195" x2="180" y2="195"/>
            </svg>
          </div>

          <div className="card-inner">
            <div className="modebar" role="tablist">
              <button 
                className={`seg ${mode === 'guidata' ? 'active' : ''}`}
                onClick={() => { setMode('guidata'); setResults([]); setSearched(false); }}
              >
                Percorso guidato
              </button>
              <button 
                className={`seg ${mode === 'global' ? 'active' : ''}`}
                onClick={() => { setMode('global'); setResults([]); setSearched(false); }}
              >
                Tutte le fonti
              </button>
            </div>

            {/* Breadcrumbs */}
            <div className="crumbs" aria-live="polite">
              {mode === "global" ? (
                <span className="crumb"><b>Tutte le fonti</b>{terms.length > 0 && <span className="crumb"><span className="sep">›</span> {terms.length} parole</span>}</span>
              ) : (
                macro && (
                  <React.Fragment>
                    <span className="crumb"><b>{getGuidedLabels().macro}</b></span>
                    {getGuidedLabels().l1 && <span className="crumb"><span className="sep">›</span> {getGuidedLabels().l1}</span>}
                    {getGuidedLabels().l2 && <span className="crumb"><span className="sep">›</span> {getGuidedLabels().l2}</span>}
                    {getGuidedLabels().l3 && <span className="crumb"><span className="sep">›</span> {getGuidedLabels().l3}</span>}
                    <button className="crumb reset" onClick={resetGuided}>↺ azzera percorso</button>
                  </React.Fragment>
                )
              )}
            </div>

            {/* GUIDED PATH MODE */}
            {mode === 'guidata' && (
              <div id="guided">
                <div className="step">
                  <div className="step-label"><span className="step-num">1</span> Fonte</div>
                  <div className="macro">
                    <button 
                      className={`macro-btn ${macro === 'giurisdizione' ? 'active' : ''}`}
                      onClick={() => handleMacroClick('giurisdizione')}
                    >
                      <div className="macro-kicker">01</div>
                      <div className="macro-title">Giurisdizione</div>
                      <div className="macro-sub">Amministrativa, ordinaria, contabile, costituzionale, tributaria</div>
                    </button>
                    <button 
                      className={`macro-btn ${macro === 'autorita' ? 'active' : ''}`}
                      onClick={() => handleMacroClick('autorita')}
                    >
                      <div className="macro-kicker">02</div>
                      <div className="macro-title">Autorità indipendenti</div>
                      <div className="macro-sub">ANAC, AGCM, AGCOM, Garante Privacy, ARERA, CONSOB</div>
                    </button>
                  </div>
                </div>

                {macro && (
                  <div className="step">
                    <div className="step-label"><span className="step-num">2</span> {DATA[macro].l1Label}</div>
                    <div className="chips">
                      {Object.keys(DATA[macro].options).map(key => {
                        const o = DATA[macro].options[key];
                        const isIntegrated = INTEGRATED_PLESSI.includes(key);
                        return (
                          <button 
                            key={key} 
                            className={`chip ${l1 === key ? 'active' : ''} ${isIntegrated ? '' : 'locked'}`}
                            disabled={!isIntegrated}
                            onClick={() => handleL1Click(key)}
                            title={isIntegrated ? '' : 'In attesa di integrazione'}
                            style={isIntegrated ? {} : { opacity: 0.5, cursor: 'not-allowed' }}
                          >
                            {o.label}
                            {o.sub && <small>{o.sub}</small>}
                            {!isIntegrated && <small style={{ color: 'var(--stone-light)', fontStyle: 'italic' }}> (non disp.)</small>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {macro && l1 && (
                  <div className="step">
                    <div className="step-label">
                      <span className="step-num">3</span> {macro === 'giurisdizione' ? 'Grado' : 'Tipo di provvedimento'}
                    </div>
                    <div className="chips">
                      {macro === 'giurisdizione' ? (
                        Object.keys(DATA[macro].options[l1].gradi).map(key => {
                          const gr = DATA[macro].options[l1].gradi[key];
                          return (
                            <button 
                              key={key} 
                              className={`chip ${l2 === key ? 'active' : ''}`}
                              onClick={() => handleL2Click(key)}
                            >
                              {gr.label}
                              {gr.sub && <small>{gr.sub}</small>}
                            </button>
                          );
                        })
                      ) : (
                        DATA[macro].options[l1].tipi.map((t, idx) => (
                          <button 
                            key={idx} 
                            className={`chip ${l2 === String(idx) ? 'active' : ''}`}
                            onClick={() => handleL2Click(String(idx))}
                          >
                            {t}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {macro === 'giurisdizione' && l1 && l2 && (
                  <div className="step">
                    <div className="step-label"><span className="step-num">4</span> Sede</div>
                    <div className="chips">
                      {DATA[macro].options[l1].gradi[l2].luoghi.map((l, idx) => (
                        <button 
                          key={idx} 
                          className={`chip ${l3 === String(idx) ? 'active' : ''}`}
                          onClick={() => handleL3Click(String(idx))}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* GLOBAL SOURCES MODE */}
            {mode === 'global' && (
              <div id="global">
                <div className="cat-tools">
                  <div className="cat-count"><b>{globalSources.size}</b> fonti selezionate</div>
                  <div>
                    <button className="linkbtn" onClick={selectOnlyOpenSources}>Solo fonti aperte</button>
                    &nbsp;·&nbsp;
                    <button className="linkbtn" onClick={clearGlobalSources}>Azzera</button>
                  </div>
                </div>

                {/* Grouped sources layout */}
                {Object.values(SOURCES.reduce((acc, curr) => {
                  if (!acc[curr.fam]) acc[curr.fam] = { fam: curr.fam, items: [] };
                  acc[curr.fam].items.push(curr);
                  return acc;
                }, {})).map((group, gIdx) => (
                  <div key={gIdx}>
                    <div className="fam-title">{group.fam}</div>
                    <div className="cat-grid">
                      {group.items.map(s => {
                        const on = globalSources.has(s.k);
                        return (
                          <button 
                            key={s.k} 
                            className={`src ${on ? 'on' : ''} ${s.open ? '' : 'locked'}`}
                            onClick={() => toggleGlobalSource(s.k)}
                          >
                            <span className="dot"></span>
                            <span>
                              <span className="src-name">
                                {s.label}
                                {!s.open && <span className="lock">auth</span>}
                              </span>
                              <span className="src-sub">{s.sub}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* KEYWORDS BLOCK */}
            <div className="kw-block">
              <div className="kw-head">
                <label>Parole della ricerca</label>
                <div className="combo">
                  <button className={combo === 'and' ? 'on' : ''} onClick={() => setCombo('and')}>Tutte (AND)</button>
                  <button className={combo === 'or' ? 'on' : ''} onClick={() => setCombo('or')}>Almeno una (OR)</button>
                  <button className={combo === 'phrase' ? 'on' : ''} onClick={() => setCombo('phrase')}>Frase esatta</button>
                </div>
              </div>

              <div className="tagbox" onClick={() => document.getElementById('kw-input')?.focus()}>
                {terms.map((term, i) => {
                  const excl = term.startsWith("-");
                  return (
                    <span key={i} className={`tag ${excl ? 'excl' : ''}`}>
                      <b>{excl ? term.slice(1) : term}</b>
                      <button onClick={(e) => { e.stopPropagation(); removeTerm(i); }} aria-label="rimuovi">×</button>
                    </span>
                  );
                })}
                <input 
                  id="kw-input"
                  type="text" 
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleBlur}
                  placeholder="scrivi una parola e premi Invio — aggiungine quante vuoi"
                  autocomplete="off"
                />
              </div>

              <div className="kw-hint">
                Invio o virgola per aggiungere un termine. Anteponi <code>-</code> per escludere una parola (es. <code>-marittimo</code>).
              </div>
            </div>

            <div className="submit-row">
              <button 
                className="cerca" 
                disabled={isSearchDisabled() || loadingSearch}
                onClick={() => executeSearch(1)}
              >
                {loadingSearch ? "Cerca in corso..." : "Cerca"}
              </button>
            </div>

            <div className="query">
              {renderQueryString()}
            </div>
          </div>
        </section>

        {/* RESULTS SECTION */}
        {error && !drawerOpen && (
          <div className="drawer-error" style={{ marginTop: '20px' }}>
            <strong>Errore:</strong> {error}
          </div>
        )}

        {loadingSearch && (
          <div className="loading-container">
            <div className="spinner"></div>
            <p className="pulse">Navigazione e recupero delle banche dati in corso...</p>
          </div>
        )}

        {searched && !loadingSearch && (
          <section className="results-section">
            <div className="results-header-container">
              <h2 className="results-title">Risultati della Ricerca</h2>
              <span className="results-count-badge">{results.length} trovati</span>
            </div>

            {results.length > 0 ? (
              <React.Fragment>
                {/* Bulk Actions */}
                <div className="bulk-actions-bar">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                    />
                    Seleziona tutti i provvedimenti ({results.length})
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '12.5px' }}>
                      Selezionati: <b>{Object.keys(selectedJudgments).length}</b> / 60 max
                    </span>
                    <button 
                      className="btn-action btn-action-primary"
                      disabled={Object.keys(selectedJudgments).length === 0 || loadingExport}
                      onClick={handleExportSelected}
                    >
                      {loadingExport ? "Esportazione..." : "Scarica Testo Unificato (.txt)"}
                    </button>
                  </div>
                </div>

                {/* Results Cards List */}
                <div className="results-list">
                  {results.map((item) => (
                    <article key={item.id} className="judgment-card" style={{ paddingLeft: '54px' }}>
                      <input 
                        type="checkbox" 
                        className="judgment-card-select"
                        checked={!!selectedJudgments[item.id]}
                        onChange={() => toggleSelect(item)}
                      />

                      <div className="card-top">
                        <div className="tag-container">
                          <span className="badge badge-tipo">{item.tipo || 'Provvedimento'}</span>
                          <span className="badge badge-sede">{item.sede || 'N/A'}</span>
                          {item.ricorso && <span className="badge badge-ricorso">Ric. {item.ricorso}</span>}
                        </div>
                        <span className="card-number">N. {item.numeroProvv}</span>
                      </div>

                      <h3 className="card-title">
                        {item.tipo} {item.sede} Sez. {item.sezione} - N. {item.numeroProvv}
                      </h3>

                      {item.snippet && (
                        <p className="card-snippet" dangerouslySetInnerHTML={{ __html: item.snippet }}></p>
                      )}

                      {/* Auto Quick Summary Box */}
                      {(autoSummaries[item.id] || loadingAutoSummaries[item.id]) && (
                        <div className="auto-summary-box">
                          <div className="auto-summary-title">
                            <span className="pulse-dot"></span>
                            Sintesi Veloce Automatica
                          </div>
                          {loadingAutoSummaries[item.id] ? (
                            <p className="pulse">Generazione sintesi in corso...</p>
                          ) : (
                            <div 
                              className="summary-body" 
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(autoSummaries[item.id]) }}
                            ></div>
                          )}
                        </div>
                      )}

                      <div className="card-footer">
                        <span className="ecli-text">{item.ecli}</span>
                        <div className="card-actions">
                          {item.url && (
                            item.url.includes('simulazione-') ? (
                              <button 
                                className="btn-action" 
                                style={{ opacity: 0.6, cursor: 'help' }}
                                onClick={() => alert("Questo è un provvedimento simulato dal sistema basandosi sulle tue parole chiave. Non esiste un indirizzo web originale.")}
                              >
                                Link Non Disponibile (Simulato)
                              </button>
                            ) : (
                              <a 
                                href={getAbsoluteUrl(item.url)} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="btn-action"
                              >
                                Apri Originale
                              </a>
                            )
                          )}
                          <button 
                            className="btn-action" 
                            style={{ borderColor: 'var(--brass)', color: 'var(--brass)' }}
                            onClick={() => handleSummarize(item, 'quick')}
                          >
                            Sintesi Veloce
                          </button>
                          <button 
                            className="btn-action btn-action-primary"
                            onClick={() => handleSummarize(item, 'detailed')}
                          >
                            Riassunto Completo
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {/* Pagination */}
                {totalResults > pageSize && (
                  <div className="pagination-controls">
                    <button 
                      className="btn-action"
                      disabled={page <= 1}
                      onClick={() => executeSearch(page - 1)}
                    >
                      &larr; Precedente
                    </button>
                    <span style={{ fontSize: '13px' }}>
                      Pagina <b>{page}</b> di <b>{Math.ceil(totalResults / pageSize)}</b> ({totalResults} risultati)
                    </span>
                    <button 
                      className="btn-action"
                      disabled={page >= Math.ceil(totalResults / pageSize)}
                      onClick={() => executeSearch(page + 1)}
                    >
                      Successiva &rarr;
                    </button>
                  </div>
                )}
              </React.Fragment>
            ) : (
              <div className="empty-state">
                <h3>Nessun risultato trovato</h3>
                <p>Nessun provvedimento corrisponde ai criteri inseriti. Prova a modificare le parole chiave o a cambiare i filtri.</p>
              </div>
            )}
          </section>
        )}

        {!searched && !loadingSearch && (
          <div className="empty-state" style={{ marginTop: '36px' }}>
            <h3>Pronto per la ricerca</h3>
            <p>Seleziona una delle modalità qui sopra per iniziare la ricerca giurisprudenziale unificata.</p>
          </div>
        )}

        <p className="note">Concept front-end collegato alle banche dati ufficiali. Per le fonti non ancora integrate, il sistema genera una simulazione intelligente basata sulle parole chiave fornite.</p>
      </main>

      {/* Summary Slide-out Drawer */}
      <aside className={`summary-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <h2 className="drawer-title">Riassunto Provvedimento</h2>
          <button className="btn-close" onClick={() => setDrawerOpen(false)}>&times;</button>
        </div>

        {error && drawerOpen && (
          <div className="drawer-error">
            <strong>Errore:</strong> {error}
          </div>
        )}

        {loadingSummary ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p className="pulse">Estrazione del testo del provvedimento e generazione del riassunto tramite Google Gemini API...</p>
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
    </React.Fragment>
  );
}

export default App;
