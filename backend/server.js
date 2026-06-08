import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { GoogleGenAI } from '@google/genai';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Polyfill process.getBuiltinModule for Node.js versions older than 20.16.0
if (typeof process.getBuiltinModule !== 'function') {
  process.getBuiltinModule = function(id) {
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

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;
console.log(BROWSERLESS_TOKEN ? '✅ Browserless token found.' : '⚠️ No Browserless token — using local Playwright Chromium.');

// Helper: connect to Browserless (cloud) or use Playwright's auto-detected local Chromium
// In native Render: Chromium is installed to Render's default path during build via:
//   npx playwright install --with-deps chromium
async function getBrowser() {
  if (BROWSERLESS_TOKEN) {
    try {
      console.log('Connecting to Browserless.io...');
      const browser = await chromium.connect(
        `wss://production-sfo.browserless.io/playwright/chromium?token=${BROWSERLESS_TOKEN}`
      );
      console.log('✅ Browserless connected successfully!');
      return browser;
    } catch (err) {
      console.error('❌ Browserless connection failed, falling back to local:', err.message);
    }
  }
  console.log('Launching local Playwright Chromium (auto-detect)...');
  return await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
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
    browser = await getBrowser();
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
      browser = await getBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

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
        summary: `### [MOCK] Riassunto del Provvedimento (Nessuna API Key configurata)\n        \nL'applicazione ha estratto correttamente il testo del provvedimento (${judgmentText.length} caratteri).\nConfigura la variabile d'ambiente \`GEMINI_API_KEY\` nel file \`backend/.env\` per attivare i riassunti intelligenti di Google Gemini.\n\n**Anteprima del testo estratto:**\n${judgmentText.substring(0, 500)}...`
      });
    }

    const prompt = `Sei un assistente legale esperto di diritto amministrativo italiano. Analizza il seguente testo di un provvedimento (sentenza/ordinanza/decreto/parere) della Giustizia Amministrativa italiana ed elabora un riassunto estremamente chiaro, sintetico e professionale strutturato in lingua italiana.\n\nStruttura il riassunto esattamente in questo formato Markdown:\n\n# Riassunto Sentenza: [Mettere il Numero del provvedimento / Anno e il TAR/Organo Decidente]\n\n## 1. Oggetto del Contendere\n[Spiega in 2-3 frasi qual è l'oggetto della causa, la materia e il provvedimento amministrativo impugnato]\n\n## 2. Decisione dell'Organo Giudicante\n[Indica chiaramente se il ricorso è stato accolto, respinto, dichiarato improcedibile o inammissibile e la formula decisionale principale]\n\n## 3. Motivazioni Principali della Decisione\n[Fornisci un elenco puntato dettagliato dei principali punti in fatto e in diritto che hanno portato il giudice a questa decisione]\n\n## 4. Punti Chiave e Massime da Ricordare\n[Sintetizza i principi di diritto espressi o le norme chiave interpretate nella decisione]\n\n---\nEcco il testo del provvedimento:\n${judgmentText}`;

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
