import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { GoogleGenAI } from '@google/genai';
import { createRequire } from 'module';
import fs from 'fs';

// Detect Chromium path: try system-installed chromium first (apt), then known Docker paths
function getChromiumExecutablePath() {
  const knownPaths = [
    '/usr/bin/chromium',           // apt-installed on Debian/Ubuntu (node:20-slim)
    '/usr/bin/chromium-browser',   // alternative apt path
    '/usr/bin/google-chrome',      // google-chrome if installed
  ];
  for (const p of knownPaths) {
    if (fs.existsSync(p)) {
      console.log(`Found Chromium at: ${p}`);
      return p;
    }
  }
  console.log('Chromium not found at known paths, letting Playwright auto-detect.');
  return undefined;
}
const CHROMIUM_PATH = getChromiumExecutablePath();
const require = createRequire(import.meta.url);

// Polyfill process.getBuiltinModule for Node.js versions older than 20.16.0
if (typeof process.getBuiltinModule !== 'function') {
  process.getBuiltinModule = function(id) {
    // strip 'node:' prefix if present as require() doesn't need it on older node versions
    const cleanId = id.startsWith('node:') ? id.substring(5) : id;
    return require(cleanId);
  };
}

const pdfParser = require('pdf-parse');
const pdf = typeof pdfParser === 'function' ? pdfParser : (pdfParser.default || pdfParser);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Helper to sanitize inputs and log actions
console.log('Initializing backend server...');

// Initialize Gemini Client
const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
let aiClient = null;
if (geminiKey) {
  aiClient = new GoogleGenAI({ apiKey: geminiKey });
  console.log('Gemini API client initialized successfully.');
} else {
  console.warn('WARNING: GEMINI_API_KEY is not set. Summarization feature will return placeholder text.');
}

/**
 * POST /api/search
 * Body: { keywords, sede, tipo, anno }
 */
app.post('/api/search', async (req, res) => {
  const { keywords, sede, tipo, anno } = req.body;
  
  if (!keywords) {
    return res.status(400).json({ error: 'Parole chiave di ricerca obbligatorie (keywords).' });
  }

  console.log(`Starting search for: "${keywords}" (Sede: ${sede || 'Tutte'}, Tipo: ${tipo || 'Tutti'}, Anno: ${anno || 'Tutti'})`);

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // Go to search page
    await page.goto('https://www.giustizia-amministrativa.it/web/guest/dcsnprr', {
      waitUntil: 'domcontentloaded',
      timeout: 25000
    });

    const searchInputSelector = 'input[id$="searchtextProvvedimenti"]';
    await page.waitForSelector(searchInputSelector);

    // Apply Sede (Court) if specified
    if (sede && sede !== 'all') {
      const sedeSelector = 'select[id$="sedeProvvedimenti"]';
      await page.selectOption(sedeSelector, { label: sede });
    }

    // Apply Tipo (Type) if specified
    if (tipo && tipo !== 'all') {
      const tipoSelector = 'select[id$="TipoProvvedimentoItem"]';
      await page.selectOption(tipoSelector, { label: tipo });
    }

    // Apply Anno (Year) if specified
    if (anno && anno !== 'all') {
      const annoSelector = 'select[id$="DataYearItem2"]';
      await page.selectOption(annoSelector, { value: String(anno) });
    }

    // Fill search text and submit
    await page.fill(searchInputSelector, keywords);
    
    const submitBtnSelector = 'button[id$="submitButton"]';
    await page.click(submitBtnSelector);

    // Wait for the results to update.
    // Liferay updates the DOM dynamically. We can wait for network idle or a short delay.
    // Waiting for either the result list items or a text "Trovati"
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Scrape results
    const results = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.ricerca--item__footer'));
      return cards.map((card, index) => {
        const textLines = Array.from(card.querySelectorAll('.col-sm-12'));
        
        const infoLine = textLines.find(el => el.innerText.includes('sede di') && el.innerText.includes('sezione'));
        let tipo = '';
        let sede = '';
        let sezione = '';
        let numeroProvv = '';
        
        if (infoLine) {
          const boldElements = Array.from(infoLine.querySelectorAll('b'));
          tipo = boldElements[0] ? boldElements[0].innerText.trim() : '';
          sede = boldElements[1] ? boldElements[1].innerText.trim() : '';
          sezione = boldElements[2] ? boldElements[2].innerText.trim() : '';
          numeroProvv = boldElements[3] ? boldElements[3].innerText.trim() : '';
        } else {
          // Fallback parsing from text content
          const text = card.innerText;
          const match = text.match(/(SENTENZA|ORDINANZA|DECRETO|PARERE)\s+sede\s+di\s+([^,]+),\s+sezione\s+([^,]+),\s+numero\s+provv\.:\s*(\d+)/i);
          if (match) {
            tipo = match[1];
            sede = match[2];
            sezione = match[3];
            numeroProvv = match[4];
          }
        }

        const printLink = card.querySelector('a[href*="/visualizza/"]');
        const url = printLink ? printLink.href : '';

        const snippetEl = card.querySelector('.snippet');
        const snippet = snippetEl ? snippetEl.innerText.trim() : '';

        const ricorsoEl = textLines.find(el => el.innerText.includes('Numero ricorso:'));
        const ricorso = ricorsoEl ? ricorsoEl.querySelector('b')?.innerText.trim() || '' : '';

        const ecliEl = textLines.find(el => el.innerText.includes('ECLI:'));
        const ecli = ecliEl ? ecliEl.querySelector('b')?.innerText.trim() || '' : '';

        return {
          id: `${numeroProvv || index}-${sede || 'unknown'}-${ricorso || 'unknown'}`,
          tipo,
          sede,
          sezione,
          numeroProvv,
          url,
          snippet,
          ricorso,
          ecli
        };
      }).filter(item => item.url !== '');
    });

    console.log(`Successfully scraped ${results.length} results.`);
    res.json({ success: true, count: results.length, results });

  } catch (error) {
    console.error('Error in search endpoint:', error);
    res.status(500).json({ error: 'Errore durante la ricerca automatizzata delle sentenze.', details: error.stack || error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

/**
 * POST /api/summarize
 * Body: { url }
 */
app.post('/api/summarize', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL del provvedimento obbligatorio.' });
  }

  console.log(`Requesting summary for URL: ${url}`);

  let browser;
  try {
    let judgmentText = '';

    // Check if the URL is a PDF
    if (url.toLowerCase().includes('.pdf')) {
      console.log('URL is a PDF. Downloading and parsing...');
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to download PDF: ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const pdfData = await pdf(buffer);
      judgmentText = pdfData.text;
    } else {
      browser = await chromium.launch({
        headless: true,
        executablePath: CHROMIUM_PATH,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      // Navigate to judgment page
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });

      await page.waitForSelector('body');
      await page.waitForTimeout(2000);

      judgmentText = await page.evaluate(() => {
        return document.body ? document.body.innerText : '';
      });
    }

    if (!judgmentText || judgmentText.trim().length < 200) {
      return res.status(422).json({ error: 'Impossibile estrarre un testo sufficiente da questo provvedimento.' });
    }

    console.log(`Extracted judgment text. Length: ${judgmentText.length} characters.`);

    // If Gemini key is missing, return fallback mock summary
    if (!aiClient) {
      console.warn('Gemini client not initialized. Returning mock summary.');
      return res.json({
        success: true,
        summary: `### [MOCK] Riassunto del Provvedimento (Nessuna API Key configurata)
        
L'applicazione ha estratto correttamente il testo del provvedimento (${judgmentText.length} caratteri).
Configura la variabile d'ambiente \`GEMINI_API_KEY\` nel file \`backend/.env\` per attivare i riassunti intelligenti di Google Gemini.

**Anteprima del testo estratto:**
${judgmentText.substring(0, 500)}...`
      });
    }

    const prompt = `Sei un assistente legale esperto di diritto amministrativo italiano. Analizza il seguente testo di un provvedimento (sentenza/ordinanza/decreto/parere) della Giustizia Amministrativa italiana ed elabora un riassunto estremamente chiaro, sintetico e professionale strutturato in lingua italiana.

Struttura il riassunto esattamente in questo formato Markdown:

# Riassunto Sentenza: [Mettere il Numero del provvedimento / Anno e il TAR/Organo Decidente]

## 1. Oggetto del Contendere
[Spiega in 2-3 frasi qual è l'oggetto della causa, la materia e il provvedimento amministrativo impugnato]

## 2. Decisione dell'Organo Giudicante
[Indica chiaramente se il ricorso è stato accolto, respinto, dichiarato improcedibile o inammissibile e la formula decisionale principale]

## 3. Motivazioni Principali della Decisione
[Fornisci un elenco puntato dettagliato dei principali punti in fatto e in diritto che hanno portato il giudice a questa decisione]

## 4. Punti Chiave e Massime da Ricordare
[Sintetizza i principi di diritto espressi o le norme chiave interpretate nella decisione]

---
Ecco il testo del provvedimento:
${judgmentText}`;

    console.log('Sending prompt to Gemini API...');
    const modelToUse = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    let response;
    try {
      console.log(`Attempting generation with model: ${modelToUse}`);
      response = await aiClient.models.generateContent({
        model: modelToUse,
        contents: prompt
      });
    } catch (apiErr) {
      console.warn(`Primary model ${modelToUse} failed. Trying fallback model...`, apiErr.message);
      // Fallback model
      const fallbackModel = modelToUse === 'gemini-2.0-flash' ? 'gemini-2.5-flash' : 'gemini-2.0-flash';
      console.log(`Attempting generation with fallback model: ${fallbackModel}`);
      response = await aiClient.models.generateContent({
        model: fallbackModel,
        contents: prompt
      });
    }

    console.log('Summary generated successfully.');
    res.json({ success: true, summary: response.text });

  } catch (error) {
    console.error('Error in summarize endpoint:', error);
    res.status(500).json({ error: 'Errore durante la generazione del riassunto tramite Gemini API.', details: error.stack || error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});
