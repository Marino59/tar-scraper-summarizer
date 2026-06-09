import './polyfill.js';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { GoogleGenAI } from '@google/genai';
import { createRequire } from 'module';
import { PDFParse } from 'pdf-parse';

const require = createRequire(import.meta.url);

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
async function getBrowser() {
  if (BROWSERLESS_TOKEN) {
    try {
      const maskedToken = BROWSERLESS_TOKEN.length > 8 
        ? `${BROWSERLESS_TOKEN.substring(0, 4)}...${BROWSERLESS_TOKEN.substring(BROWSERLESS_TOKEN.length - 4)}` 
        : '***';
      console.log(`[getBrowser] Attempting to connect to Browserless.io (Token: ${maskedToken})...`);
      const browser = await chromium.connect(
        `wss://production-sfo.browserless.io/playwright/chromium?token=${BROWSERLESS_TOKEN}`
      );
      console.log('[getBrowser] ✅ Browserless connected successfully!');
      return browser;
    } catch (err) {
      console.error('[getBrowser] ❌ Browserless connection failed! Details:', err);
      console.log('[getBrowser] Falling back to local Playwright Chromium...');
    }
  } else {
    console.log('[getBrowser] No BROWSERLESS_TOKEN found in environment variables. Using local browser.');
  }
  
  try {
    console.log('[getBrowser] Launching local Playwright Chromium (auto-detect)...');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    console.log('[getBrowser] ✅ Local Chromium launched successfully!');
    return browser;
  } catch (err) {
    console.error('[getBrowser] ❌ Failed to launch local Chromium! Details:', err);
    throw err;
  }
}

/**
 * POST /api/search
 * Body: { keywords, sede, tipo, anno }
 */
app.post('/api/search', async (req, res) => {
  const { keywords, sede, tipo, anno, page = 1 } = req.body;
  
  if (!keywords) {
    console.warn('[Search API] ⚠️ Rejected: Missing keywords.');
    return res.status(400).json({ error: 'Parole chiave di ricerca obbligatorie (keywords).' });
  }

  console.log(`[Search API] 🚀 Starting search. Keywords: "${keywords}", Sede: "${sede}", Tipo: "${tipo}", Anno: "${anno}", Page: ${page}`);

  let browser;
  try {
    console.log('[Search API] [Step 1/8] Requesting browser instance...');
    browser = await getBrowser();
    
    console.log('[Search API] [Step 2/8] Creating context and new page...');
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const pageObj = await context.newPage();

    console.log('[Search API] [Step 3/8] Navigating to search portal...');
    await pageObj.goto('https://www.giustizia-amministrativa.it/web/guest/dcsnprr', {
      waitUntil: 'domcontentloaded',
      timeout: 25000
    });
    console.log('[Search API] Portal base page loaded.');

    const searchInputSelector = 'input[id$="searchtextProvvedimenti"]';
    console.log('[Search API] [Step 4/8] Waiting for search text field...');
    await pageObj.waitForSelector(searchInputSelector, { timeout: 15000 });

    // Apply Sede (Court) if specified
    if (sede && sede !== 'all') {
      const sedeSelector = 'select[id$="sedeProvvedimenti"]';
      console.log(`[Search API] Selecting court (sede): "${sede}"`);
      await pageObj.selectOption(sedeSelector, { label: sede });
    }

    // Apply Tipo (Type) if specified
    if (tipo && tipo !== 'all') {
      const tipoSelector = 'select[id$="TipoProvvedimentoItem"]';
      console.log(`[Search API] Selecting type (tipo): "${tipo}"`);
      await pageObj.selectOption(tipoSelector, { label: tipo });
    }

    // Apply Anno (Year) if specified
    if (anno && anno !== 'all') {
      const annoSelector = 'select[id$="DataYearItem2"]';
      console.log(`[Search API] Selecting year (anno): "${anno}"`);
      await pageObj.selectOption(annoSelector, { value: String(anno) });
    }

    console.log('[Search API] [Step 5/8] Filling search keywords...');
    await pageObj.fill(searchInputSelector, keywords);
    
    const submitBtnSelector = 'button[id$="submitButton"]';
    console.log('[Search API] [Step 6/8] Clicking submit button...');
    await pageObj.click(submitBtnSelector);

    console.log('[Search API] [Step 7/8] Waiting for results to load (networkidle)...');
    await pageObj.waitForLoadState('networkidle', { timeout: 15000 });
    await pageObj.waitForTimeout(3000); // Wait extra 3s for rendering

    // Extract total results count
    const totalResultsText = await pageObj.evaluate(() => {
      return document.body.innerText.match(/Trovati \d+ risultati/i)?.[0] || '';
    });
    const totalResultsMatch = totalResultsText.match(/\d+/);
    const totalResults = totalResultsMatch ? parseInt(totalResultsMatch[0], 10) : 0;
    console.log(`[Search API] Total results found: ${totalResults}`);

    // Paginate to the requested page
    let currentPage = 1;
    const targetPage = parseInt(page, 10) || 1;
    while (currentPage < targetPage) {
      console.log(`[Search API] Navigating to next page (${currentPage + 1}/${targetPage})...`);
      
      // Check if the next button is wrapped in a disabled class (e.g. li.disabled)
      const isDisabled = await pageObj.evaluate(() => {
        const nextLink = Array.from(document.querySelectorAll('a'))
          .find(el => el.innerText.includes('Successivo'));
        if (!nextLink) return true;
        const parentLi = nextLink.closest('li');
        return parentLi ? parentLi.classList.contains('disabled') : false;
      });

      if (isDisabled) {
        console.log('[Search API] "Successivo" button is disabled or not found. Stopping pagination.');
        break;
      }

      const nextButton = pageObj.locator('a.form-group.clickable', { hasText: 'Successivo' });
      if (await nextButton.count() > 0) {
        // Wait for the navigation to complete when clicking the link
        console.log('[Search API] Clicking Successivo and waiting for navigation...');
        await Promise.all([
          pageObj.waitForNavigation({ waitUntil: 'networkidle', timeout: 25000 }).catch(err => console.log('[Search API] Navigation timeout, proceeding...')),
          nextButton.first().click({ force: true })
        ]);
        await pageObj.waitForTimeout(2000);
        currentPage++;
      } else {
        console.log('[Search API] "Successivo" button not found. Stopping pagination.');
        break;
      }
    }

    console.log('[Search API] [Step 8/8] Scraping results from the page DOM...');
    const results = await pageObj.evaluate(() => {
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

    console.log(`[Search API] ✅ Success. Scraped ${results.length} results.`);
    res.json({ success: true, count: results.length, totalResults, results });

  } catch (error) {
    console.error('[Search API] ❌ Critical Error during search operation:', error);
    res.status(500).json({ 
      error: 'Errore durante la ricerca automatizzata delle sentenze.', 
      details: error.stack || error.message 
    });
  } finally {
    if (browser) {
      console.log('[Search API] Closing browser instance...');
      await browser.close();
    }
  }
});

/**
 * POST /api/export
 * Body: { judgments }
 */
app.post('/api/export', async (req, res) => {
  const { judgments } = req.body;
  
  if (!judgments || !Array.isArray(judgments)) {
    return res.status(400).json({ error: 'Nessun provvedimento fornito per l\'esportazione.' });
  }

  // Safety check on maximum judgments to export
  if (judgments.length > 50) {
    return res.status(400).json({ 
      error: `Puoi esportare al massimo 50 sentenze alla volta. Hai selezionato ${judgments.length} sentenze.` 
    });
  }

  console.log(`[Export API] Starting export of ${judgments.length} judgments...`);
  
  let combinedText = `ESPORTAZIONE PROVVEDIMENTI GIUSTIZIA AMMINISTRATIVA\n`;
  combinedText += `Generato il: ${new Date().toLocaleString('it-IT')}\n`;
  combinedText += `Totale provvedimenti: ${judgments.length}\n`;
  combinedText += `======================================================================\n\n`;

  let browser;
  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    for (let i = 0; i < judgments.length; i++) {
      const item = judgments[i];
      console.log(`[Export API] (${i + 1}/${judgments.length}) Scraping: ${item.tipo} - ${item.sede} - N. ${item.numeroProvv}`);
      
      let judgmentText = '';
      if (item.url) {
        try {
          if (item.url.toLowerCase().includes('.pdf')) {
            const response = await fetch(item.url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });
            if (response.ok) {
              const buffer = Buffer.from(await response.arrayBuffer());
              const parser = new PDFParse({ data: buffer });
              const pdfData = await parser.getText();
              judgmentText = pdfData.text;
            } else {
              judgmentText = `[Errore caricamento PDF: HTTP ${response.status}]`;
            }
          } else {
            await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
            await page.waitForSelector('body', { timeout: 15000 });
            await page.waitForTimeout(1500);
            judgmentText = await page.evaluate(() => document.body ? document.body.innerText : '');
          }
        } catch (err) {
          console.error(`[Export API] Error fetching ${item.url}:`, err.message);
          judgmentText = `[Errore caricamento testo: ${err.message}]`;
        }
      } else {
        judgmentText = '[URL non disponibile]';
      }

      combinedText += `=== PROVVEDIMENTO ${i + 1} di ${judgments.length} ===\n`;
      combinedText += `TIPO: ${item.tipo || 'N/A'}\n`;
      combinedText += `SEDE: ${item.sede || 'N/A'}\n`;
      combinedText += `NUMERO: ${item.numeroProvv || 'N/A'}\n`;
      combinedText += `SEZIONE: ${item.sezione || 'N/A'}\n`;
      combinedText += `RICORSO: ${item.ricorso || 'N/A'}\n`;
      combinedText += `ECLI: ${item.ecli || 'N/A'}\n`;
      combinedText += `URL: ${item.url || 'N/A'}\n`;
      combinedText += `----------------------------------------------------------------------\n`;
      combinedText += `${judgmentText}\n`;
      combinedText += `======================================================================\n\n`;

      // Throttle to prevent DDOS protection triggers on the court website
      if (i < judgments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    res.json({ success: true, text: combinedText });

  } catch (error) {
    console.error('[Export API] ❌ Critical error during export:', error);
    res.status(500).json({ 
      error: 'Errore interno durante la generazione del file di testo unificato.', 
      details: error.message 
    });
  } finally {
    if (browser) {
      console.log('[Export API] Closing browser...');
      await browser.close();
    }
  }
});

/**
 * POST /api/summarize
 * Body: { url }
 */
app.post('/api/summarize', async (req, res) => {
  const { url, format } = req.body; // format: 'quick' | 'detailed'

  if (!url) {
    console.warn('[Summarize API] ⚠️ Rejected: Missing URL.');
    return res.status(400).json({ error: 'URL del provvedimento obbligatorio.' });
  }

  console.log(`[Summarize API] 🚀 Requested summary for URL: ${url} (Format: ${format || 'detailed'})`);

  let browser;
  try {
    let judgmentText = '';

    // Check if the URL is a PDF
    if (url.toLowerCase().includes('.pdf')) {
      console.log('[Summarize API] [Step 1/3] URL detected as PDF. Fetching buffer...');
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to download PDF: ${response.statusText}`);
      }
      console.log('[Summarize API] PDF buffer downloaded. Parsing content using PDFParse...');
      const buffer = Buffer.from(await response.arrayBuffer());
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      judgmentText = pdfData.text;
    } else {
      console.log('[Summarize API] [Step 1/3] URL detected as HTML. Initializing browser...');
      browser = await getBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      console.log(`[Summarize API] Navigating to page: ${url}`);
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 25000
      });

      console.log('[Summarize API] Waiting for page body selector...');
      await page.waitForSelector('body', { timeout: 15000 });
      await page.waitForTimeout(2000);

      console.log('[Summarize API] Extracting body innerText...');
      judgmentText = await page.evaluate(() => {
        return document.body ? document.body.innerText : '';
      });
    }

    if (!judgmentText || judgmentText.trim().length < 200) {
      console.warn(`[Summarize API] ⚠️ Extraction warning. Raw text was too short (${judgmentText?.length || 0} chars).`);
      return res.status(422).json({ error: 'Impossibile estrarre un testo sufficiente da questo provvedimento.' });
    }

    console.log(`[Summarize API] [Step 2/3] Text successfully extracted. Length: ${judgmentText.length} characters.`);

    // If Gemini key is missing, return fallback mock summary
    if (!aiClient) {
      console.warn('[Summarize API] ⚠️ GEMINI_API_KEY is missing. Returning pre-formatted explanation.');
      return res.json({
        success: true,
        summary: `### [MOCK] Riassunto del Provvedimento (Nessuna API Key configurata)\n        \nL'applicazione ha estratto correttamente il testo del provvedimento (${judgmentText.length} caratteri).\nConfigura la variabile d'ambiente \`GEMINI_API_KEY\` nel file \`backend/.env\` per attivare i riassunti intelligenti di Google Gemini.\n\n**Anteprima del testo estratto:**\n${judgmentText.substring(0, 500)}...`
      });
    }

    const promptDetailed = `Sei un assistente legale esperto di diritto amministrativo italiano. Analizza il seguente testo di un provvedimento (sentenza/ordinanza/decreto/parere) della Giustizia Amministrativa italiana ed elabora un riassunto estremamente chiaro, sintetico e professionale strutturato in lingua italiana.\n\nStruttura il riassunto esattamente in questo formato Markdown:\n\n# Riassunto Sentenza: [Mettere il Numero del provvedimento / Anno e il TAR/Organo Decidente]\n\n## 1. Oggetto del Contendere\n[Spiega in 2-3 frasi qual è l'oggetto della causa, la materia e il provvedimento amministrativo impugnato]\n\n## 2. Decisione dell'Organo Giudicante\n[Indica chiaramente se il ricorso è stato accolto, respinto, dichiarato improcedibile o inammissibile e la formula decisionale principale]\n\n## 3. Motivazioni Principali della Decisione\n[Fornisci un elenco puntato dettagliato dei principali punti in fatto e in diritto che hanno portato il giudice a questa decisione]\n\n## 4. Punti Chiave e Massime da Ricordare\n[Sintetizza i principi di diritto espressi o le norme chiave interpretate nella decisione]\n\n---\nEcco il testo del provvedimento:\n${judgmentText}`;

    const promptQuick = `Sei un assistente legale esperto di diritto amministrativo italiano. Analizza il seguente testo di un provvedimento (sentenza/ordinanza/decreto/parere) della Giustizia Amministrativa italiana ed elabora una sintesi ultra-rapida (massimo 100 parole) in lingua italiana.\n\nStruttura la sintesi esattamente in questo formato Markdown:\n\n# Sintesi Rapida: [Numero Provvedimento / Anno - TAR/Organo Decidente]\n\n* **Oggetto della Causa:** [Spiega in una singola frase chiara di cosa tratta la causa]\n* **Esito della Decisione:** [Indica l'esito principale: es. Accolto / Respinto / Inammissibile]\n* **Motivazione/Principio Cardine:** [Spiega il motivo principale della decisione o il principio cardine stabilito dai giudici in max due frasi]\n\n---\nEcco il testo del provvedimento:\n${judgmentText}`;

    const prompt = format === 'quick' ? promptQuick : promptDetailed;

    console.log('[Summarize API] [Step 3/3] Sending prompt to Google Gemini API...');
    const modelToUse = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    let response;
    try {
      console.log(`[Summarize API] Attempting generation with model: ${modelToUse}`);
      response = await aiClient.models.generateContent({
        model: modelToUse,
        contents: prompt
      });
    } catch (apiErr) {
      console.warn(`[Summarize API] Primary model ${modelToUse} failed. Trying fallback model... Details:`, apiErr.message);
      const fallbackModel = modelToUse === 'gemini-2.0-flash' ? 'gemini-2.5-flash' : 'gemini-2.0-flash';
      console.log(`[Summarize API] Attempting generation with fallback model: ${fallbackModel}`);
      response = await aiClient.models.generateContent({
        model: fallbackModel,
        contents: prompt
      });
    }

    console.log('[Summarize API] ✅ Summary generated successfully.');
    res.json({ success: true, summary: response.text });

  } catch (error) {
    console.error('[Summarize API] ❌ Critical Error during summarization operation:', error);
    
    const isQuotaError = error.status === 429 || 
                         (error.message && (
                           error.message.includes('429') || 
                           error.message.toLowerCase().includes('quota') || 
                           error.message.includes('RESOURCE_EXHAUSTED')
                         ));
                         
    if (isQuotaError) {
      console.warn('[Summarize API] Gracefully handling 429 Quota Exceeded error.');
      return res.json({
        success: true,
        summary: `⚠️ **Limite Quota API Gemini Raggiunto**\n\nHai temporaneamente esaurito le richieste gratuite giornaliere o al minuto messe a disposizione da Google per questo modello di IA (errore *429 Resource Exhausted*).\n\nQuesto limite si azzera automaticamente. Riprova tra poco o domani, oppure configura una chiave API differente o con fatturazione attiva.`
      });
    }

    res.status(500).json({ 
      error: 'Errore durante la generazione del riassunto tramite Gemini API.', 
      details: error.stack || error.message 
    });
  } finally {
    if (browser) {
      console.log('[Summarize API] Closing browser instance...');
      await browser.close();
    }
  }
});

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static assets from frontend build folder
const frontendDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDistPath));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});

