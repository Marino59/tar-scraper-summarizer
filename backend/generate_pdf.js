import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: 'Times New Roman', Times, serif;
    line-height: 1.6;
    color: #000;
    margin: 40px;
    font-size: 11.5pt;
  }
  h1 {
    font-size: 18pt;
    text-align: center;
    margin-bottom: 30px;
    text-transform: uppercase;
    border-bottom: 2px solid #000;
    padding-bottom: 10px;
  }
  h2 {
    font-size: 13pt;
    margin-top: 24px;
    margin-bottom: 10px;
    border-bottom: 1px solid #ddd;
    padding-bottom: 4px;
  }
  p {
    margin-bottom: 14px;
    text-align: justify;
  }
  ul {
    margin-bottom: 14px;
    padding-left: 24px;
  }
  li {
    margin-bottom: 8px;
    text-align: justify;
  }
  .footer {
    margin-top: 50px;
    border-top: 1px dashed #000;
    padding-top: 10px;
    font-size: 10pt;
    text-align: right;
    font-style: italic;
  }
</style>
</head>
<body>

<h1>Termini di Servizio, Avvertenze Legali e Disclaimer Assoluto di Responsabilità</h1>

<h2>1. Oggetto del servizio e descrizione tecnica dell'applicativo</h2>
<p>
  Il presente applicativo informatico, denominato convenzionalmente <strong>“TAR Scraper & Summarizer”</strong> (di seguito, per brevità, "l'Applicativo" o "il Software"), è un mero strumento digitale automatizzato finalizzato all'ausilio della ricerca documentale e redazionale in materia di diritto amministrativo.
</p>
<p>
  L’Applicativo esegue, su input autonomo ed esclusivo dell’utente, un’operazione tecnica di recupero automatico (scraping) di provvedimenti giurisprudenziali (sentenze, ordinanze, decreti) pubblicati e resi accessibili sui canali ufficiali della Giustizia Amministrativa. Successivamente al recupero del testo originale, il Software elabora una sintesi testuale astratta (comprendente la massimazione del principio di diritto, il riassunto della fattispecie di fatto e l'esito del gravame) mediante l'ausilio di modelli di computazione linguistica basati su Intelligenza Artificiale (IA).
</p>

<h2>2. Natura puramente indicativa e divieto di utilizzo professionale</h2>
<p>
  In conformità con lo stile delle utilità d'uso e delle piattaforme di ausilio per professionisti si fa espressa avvertenza che:
</p>
<ul>
  <li>
    <strong>Uso non professionale e non vincolante:</strong> L’Applicativo è strutturato e messo a disposizione per un utilizzo esclusivamente orientativo, preliminare e di carattere didattico o illustrativo. Nessun risultato generato dall'algoritmo può essere inteso, interpretato o utilizzato come surrogato di un’attività di consulenza legale, di un parere pro-veritate, o di una valutazione strategica circa la fondatezza o l'esito di un contenzioso pendente o futuro.
  </li>
  <li>
    <strong>Nessun esonero dall'onere di verifica:</strong> I risultati visualizzati a schermo non esonerano in alcun modo l’utente – sia esso un privato cittadino, un funzionario pubblico o un professionista del diritto – dall'onere tassativo e inderogabile di reperire, leggere, analizzare e verificare il testo integrale e ufficiale del provvedimento giurisprudenziale citato. La giurisprudenza è soggetta a mutamenti repentini e interpretazioni complesse che nessuna sintesi algoritmica può ponderare.
  </li>
</ul>

<h2>3. Esclusione totale di garanzie e clausola di irresponsabilità per "allucinazioni" dell'IA</h2>
<p>
  I processi di massimazione e riassunto avvengono in tempo reale senza il controllo preventivo o la validazione umana da parte di operatori giuridici. Pertanto:
</p>
<ul>
  <li>
    <strong>Inaccuratezza intrinseca dei modelli IA:</strong> L’utente prende atto che i modelli di Intelligenza Artificiale, per loro natura statistico-computazionale, possono generare testi parziali, distorti, imprecisi o totalmente errati (fenomeno tecnicamente noto come "allucinazione del modello"). L'algoritmo potrebbe confondere le posizioni delle parti (ricorrente, resistente, controinteressato), travisare l'esito del giudizio (es. scambiare una declaratoria di inammissibilità per un accoglimento nel merito) o citare riferimenti normativi abrogati o inesistenti.
  </li>
  <li>
    <strong>Negazione di garanzia:</strong> Lo Studio Legale dello sviluppatore, i programmatori e i titolari del dominio web non rilasciano alcuna garanzia, espressa o implicita, circa la commerciabilità, l'idoneità a scopi specifici, la correttezza formale, la completezza testuale, la precisione e l'aggiornamento dei riassunti mostrati. Il servizio viene fornito nello stato di fatto e di diritto in cui si trova ("as is"), con tutti i suoi potenziali difetti.
  </li>
</ul>

<h2>4. Clausola di manleva e limitazione della responsabilità risarcitoria</h2>
<p>
  L'utente è l'unico ed esclusivo responsabile dell'utilizzo dell'Applicativo, nonché di qualsiasi decisione, azione, omissione, transazione o strategia processuale intrapresa sulla base dei dati visualizzati.
</p>
<p>
  <strong>Esclusione dei danni:</strong> Nei limiti massimi consentiti dagli articoli 1229 e seguenti del Codice Civile italiano, lo Studio Legale Poli, l'Avvocato Francesco Poli, i programmatori e i titolari del dominio web non saranno in alcun caso responsabili per danni diretti, indiretti, speciali, incidentali, consequenziali o punitivi (inclusi, a titolo esemplificativo, perdita di profitto, interruzione dell'attività, perdita di informazioni o altre perdite pecuniarie) derivanti dall'uso o dall'impossibilità di usare l'Applicativo, anche qualora fossero stati informati della possibilità di tali danni.
</p>

<div class="footer">
  Studio Legale Francesco Poli — Corso Palladio 134, Vicenza
</div>

</body>
</html>
`;

async function main() {
  console.log('Launching browser to generate PDF...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.setContent(htmlContent);
  
  const destDir = path.resolve(__dirname, '../frontend/public');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const destPath = path.join(destDir, 'termini_di_servizio.pdf');
  
  console.log(`Saving PDF to ${destPath}...`);
  await page.pdf({
    path: destPath,
    format: 'A4',
    margin: {
      top: '20mm',
      bottom: '20mm',
      left: '20mm',
      right: '20mm'
    }
  });
  
  await browser.close();
  console.log('PDF generated successfully!');
}

main().catch(err => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
