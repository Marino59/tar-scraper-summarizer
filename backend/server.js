import './polyfill.js';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { GoogleGenAI } from '@google/genai';
import { createRequire } from 'module';
import { PDFParse } from 'pdf-parse';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

async function scrapeCorteConti(keywords, targetSede = '', page = 1, pageSize = 60) {
  console.log(`[Corte dei Conti Scraper] 🚀 Starting search for: "${keywords}" (Target Sede: "${targetSede}")`);
  let browser;
  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const pageObj = await context.newPage();

    await pageObj.goto('https://banchedati.corteconti.it/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    await pageObj.waitForSelector('#inputRicerca', { timeout: 15000 });
    let queryStr = keywords;
    if (targetSede && !targetSede.toLowerCase().includes('tutte')) {
      const cleanRegion = targetSede.replace('Sez. ', '').replace('— ', '').trim();
      queryStr += ` ${cleanRegion}`;
    }
    await pageObj.fill('#inputRicerca', queryStr.trim());
    await pageObj.click('#buttonSearch');

    await pageObj.waitForLoadState('networkidle', { timeout: 20000 });
    await pageObj.waitForTimeout(3000);

    const results = await pageObj.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr.align-top'));
      return rows.map((row) => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 5) return null;

        const sede = cells[1] ? cells[1].innerText.trim() : '';
        const tipo = cells[2] ? cells[2].innerText.trim() : '';
        const numeroProvv = cells[3] ? cells[3].innerText.trim() : '';
        const data = cells[4] ? cells[4].innerText.trim() : '';

        const id = `corteconti-${numeroProvv}-${sede.replace(/\s+/g, '_')}`;

        return {
          id,
          tipo: tipo || 'Delibera/Sentenza',
          sede,
          sezione: sede,
          numeroProvv,
          data,
          url: `/api/corte-conti/download?sede=${encodeURIComponent(sede)}&tipo=${encodeURIComponent(tipo)}&numero=${encodeURIComponent(numeroProvv)}&data=${encodeURIComponent(data)}`,
          snippet: `Provvedimento emesso da ${sede} in data ${data}.`,
          ricorso: '',
          ecli: ''
        };
      }).filter(Boolean);
    });

    let filteredResults = results;
    if (targetSede && !targetSede.toLowerCase().includes('tutte')) {
      let regionKeyword = targetSede.replace('Sez. ', '').replace('— ', '').trim().toUpperCase();
      if (regionKeyword === 'TRENTINO-A.A.') regionKeyword = 'TRENTINO';
      
      console.log(`[Corte dei Conti Scraper] Filtering results for region keyword: "${regionKeyword}"`);
      filteredResults = results.filter(r => r.sede.toUpperCase().includes(regionKeyword));
    }

    console.log(`[Corte dei Conti Scraper] Scraped ${results.length} results, returning ${filteredResults.length} after filter.`);
    return filteredResults;
  } catch (err) {
    console.error('[Corte dei Conti Scraper] ❌ Error:', err.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeCorteCostituzionale(keywords, page = 1) {
  console.log(`[Corte Costituzionale Scraper] 🚀 Starting search for: "${keywords}" (Page: ${page})`);
  let browser;
  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const pageObj = await context.newPage();

    const searchUrl = `https://www.giurcost.org/decisioni/testuale.html?year=*&terms=${encodeURIComponent(keywords)}&pag=${page}`;
    await pageObj.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    await pageObj.waitForSelector('body', { timeout: 15000 });
    await pageObj.waitForTimeout(2000);

    const results = await pageObj.evaluate(() => {
      const items = Array.from(document.querySelectorAll('li.list-group-item'));
      return items.map((item, idx) => {
        const link = item.querySelector('a');
        if (!link) return null;

        const href = link.getAttribute('href') || '';
        const fullUrl = href.startsWith('http') ? href : `https://www.giurcost.org${href}`;
        
        const strongEl = link.querySelector('strong');
        const titleText = strongEl ? strongEl.innerText.trim() : link.innerText.trim().split('\n')[0];
        
        let tipo = 'Sentenza';
        let numeroProvv = '';
        let data = '';
        
        const match = titleText.match(/(Sentenza|Ordinanza|Decreto)\s+(?:n\.\s*)?(\d+)\s+del\s+(\d{4})/i);
        if (match) {
          tipo = match[1];
          numeroProvv = match[2];
          data = match[3];
        } else {
          if (titleText.toLowerCase().includes('ordinanza')) {
            tipo = 'Ordinanza';
          } else if (titleText.toLowerCase().includes('decreto')) {
            tipo = 'Decreto';
          }
          const numMatch = titleText.match(/\d+/g);
          if (numMatch) {
            numeroProvv = numMatch[0] || '';
            data = numMatch[1] || '';
          }
        }

        const snippetEl = link.querySelector('p.mb-1');
        const snippet = snippetEl ? snippetEl.innerText.trim() : '';

        const id = `cortecost-${numeroProvv || idx}-${data || 'year'}`;

        return {
          id,
          tipo,
          sede: 'Roma — sede unica',
          sezione: 'Corte Costituzionale',
          numeroProvv: numeroProvv ? `${numeroProvv}/${data}` : titleText,
          data: data || 'N/D',
          url: fullUrl,
          snippet: snippet || `Provvedimento costituzionale: ${titleText}`,
          ricorso: '',
          ecli: ''
        };
      }).filter(Boolean);
    });

    console.log(`[Corte Costituzionale Scraper] Scraped ${results.length} results.`);
    return results;
  } catch (err) {
    console.error('[Corte Costituzionale Scraper] ❌ Error:', err.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeANAC(keywords, page = 1) {
  console.log(`[ANAC Scraper] 🚀 Starting search for: "${keywords}" (Page: ${page})`);
  let browser;
  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const pageObj = await context.newPage();

    const searchUrl = `https://www.anticorruzione.it/risultati-ricerca?q=${encodeURIComponent(keywords)}&isDocumentSearchPortlet=true`;
    await pageObj.goto(searchUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await pageObj.waitForSelector('body', { timeout: 15000 });
    await pageObj.waitForTimeout(2000);

    const results = await pageObj.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.wd-card-doc'));
      return items.map((item, idx) => {
        const link = item.querySelector('a.linkTitle');
        if (!link) return null;

        const href = link.getAttribute('href') || '';
        let fullUrl = href;
        if (!href.startsWith('http')) {
          fullUrl = href.startsWith('/') ? `https://www.anticorruzione.it${href}` : `https://www.anticorruzione.it/${href}`;
        }
        
        const titleEl = item.querySelector('.card-title');
        const title = titleEl ? titleEl.innerText.trim() : link.innerText.trim();
        
        const dateEl = item.querySelector('.data');
        const data = dateEl ? dateEl.innerText.trim() : 'N/D';

        const snippetEl = item.querySelector('.free-text p');
        const snippet = snippetEl ? snippetEl.innerText.trim() : '';

        const tagsList = Array.from(item.querySelectorAll('.card-tags-list li'));
        const tags = tagsList.map(el => el.innerText.trim()).join(', ');

        let tipo = 'Delibera';
        if (title.toLowerCase().includes('parere')) tipo = 'Parere';
        else if (title.toLowerCase().includes('regolamento') || title.toLowerCase().includes('regolazione')) tipo = 'Atto di regolazione';
        else if (title.toLowerCase().includes('sanzione') || title.toLowerCase().includes('sanzionatorio')) tipo = 'Provv. sanzionatorio';

        const matchNum = title.match(/\b\d+\b/);
        const numeroProvv = matchNum ? matchNum[0] : '';

        const id = `anac-${numeroProvv || idx}-${data.replace(/\s+/g, '_')}`;

        return {
          id,
          tipo,
          sede: 'Roma — sede centrale',
          sezione: tags || 'Anticorruzione',
          numeroProvv: numeroProvv || 'N/D',
          data,
          url: fullUrl,
          snippet: snippet || `Provvedimento ANAC: ${title}`,
          ricorso: '',
          ecli: ''
        };
      }).filter(Boolean);
    });

    console.log(`[ANAC Scraper] Scraped ${results.length} results.`);
    return results;
  } catch (err) {
    console.error('[ANAC Scraper] ❌ Error:', err.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeGarante(keywords, page = 1) {
  console.log(`[Garante Privacy Scraper] 🚀 Starting search for: "${keywords}" (Page: ${page})`);
  let browser;
  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const pageObj = await context.newPage();

    const searchUrl = `https://www.gpdp.it/home/ricerca/-/search/key/${encodeURIComponent(keywords)}`;
    await pageObj.goto(searchUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await pageObj.waitForSelector('body', { timeout: 15000 });
    await pageObj.waitForTimeout(2000);

    const results = await pageObj.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.card-risultato'));
      return items.map((item, idx) => {
        const anchors = Array.from(item.querySelectorAll('a'));
        const docLink = anchors.find(a => a.href.includes('/docweb/'));
        if (!docLink) return null;

        const title = docLink.innerText.trim();
        const url = docLink.href;

        const dateEl = item.querySelector('.data-risultato');
        const data = dateEl ? dateEl.innerText.trim() : '';

        const typeEl = item.querySelector('.badge-pill span');
        const tipo = typeEl ? typeEl.innerText.trim() : 'Provvedimento';

        // Clean snippet by removing metadata and title
        let textContent = item.innerText || '';
        let snippetText = textContent
          .replace('Tipologia:', '')
          .replace(tipo, '')
          .replace(data, '')
          .replace(title, '')
          .replace('Argomenti:', '')
          .replace(/\n+/g, ' ')
          .trim();
          
        snippetText = snippetText.replace(/\s+/g, ' ').trim();
        
        // Remove arguments block
        const argsEl = item.querySelector('.ricercaArgomentiPar');
        if (argsEl) {
          const argsText = argsEl.parentElement ? argsEl.parentElement.innerText : '';
          if (argsText) {
            snippetText = snippetText.replace(argsText.replace(/\n+/g, ' ').trim(), '');
          }
        }
        
        snippetText = snippetText.replace(/^null\s*/, '').trim();

        // Docweb ID (extract from URL or title)
        const docwebMatch = url.match(/\/docweb\/(\d+)/);
        const docwebId = docwebMatch ? docwebMatch[1] : '';
        const id = `garante-${docwebId || idx}`;

        const finalSnippet = `<b>${title}</b><br/>${snippetText || `Provvedimento Garante Privacy del ${data || 'N/D'}.`}`;

        return {
          id,
          tipo,
          sede: 'Roma — sede Garante',
          sezione: 'Privacy',
          numeroProvv: docwebId || 'N/D',
          data: data || 'N/D',
          url,
          snippet: finalSnippet,
          ricorso: '',
          ecli: ''
        };
      }).filter(Boolean);
    });

    console.log(`[Garante Privacy Scraper] Scraped ${results.length} results.`);
    return results;
  } catch (err) {
    console.error('[Garante Privacy Scraper] ❌ Error:', err.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeAGCM(keywords, page = 1) {
  console.log(`[AGCM Scraper] 🚀 Starting search for: "${keywords}" (Page: ${page})`);
  let browser;
  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const pageObj = await context.newPage();

    const searchUrl = `https://www.agcm.it/cerca?searchword=${encodeURIComponent(keywords)}&separatore=0&numero+risultati=60`;
    await pageObj.goto(searchUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await pageObj.waitForSelector('body', { timeout: 15000 });
    await pageObj.waitForTimeout(2000);

    const results = await pageObj.evaluate(() => {
      const resultsContainer = document.querySelector('.search-results');
      if (!resultsContainer) return [];

      const rows = Array.from(resultsContainer.querySelectorAll('tr'));
      return rows.map((row, idx) => {
        const titleLink = row.querySelector('.result-title a');
        if (!titleLink) return null;

        const title = titleLink.innerText.trim();
        const relativeUrl = titleLink.getAttribute('href') || '';
        const url = relativeUrl.startsWith('http') ? relativeUrl : `https://www.agcm.it${relativeUrl}`;

        const categoryEl = row.querySelector('.result-category span');
        const category = categoryEl ? categoryEl.innerText.replace(/[()]/g, '').trim() : 'Provvedimento';

        const snippetEl = row.querySelector('.result-body');
        const snippetText = snippetEl ? snippetEl.innerText.trim() : '';

        const matchYear = title.match(/\b(20\d{2})\b/);
        const data = matchYear ? `01/01/${matchYear[1]}` : 'N/D';

        const id = `agcm-${idx}-${title.replace(/\s+/g, '_').substring(0, 30)}`;

        return {
          id,
          tipo: category || 'Provvedimento',
          sede: 'Roma — sede centrale',
          sezione: 'Concorrenza e Mercato',
          numeroProvv: title.match(/\b\d+\b/)?.[0] || 'N/D',
          data,
          url,
          snippet: `<b>${title}</b><br/>${snippetText || `Provvedimento AGCM di interesse generale.`}`,
          ricorso: '',
          ecli: ''
        };
      }).filter(Boolean);
    });

    console.log(`[AGCM Scraper] Scraped ${results.length} results.`);
    return results;
  } catch (err) {
    console.error('[AGCM Scraper] ❌ Error:', err.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeAGCOM(keywords, page = 1) {
  console.log(`[AGCOM Scraper] 🚀 Starting search for: "${keywords}" (Page: ${page})`);
  let browser;
  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const pageObj = await context.newPage();

    const searchUrl = `https://www.agcom.it/provvedimenti?p_p_id=it_agcom_provvedimenti_web_portlet_ProvvedimentiWebPortlet&p_p_lifecycle=0&_it_agcom_provvedimenti_web_portlet_ProvvedimentiWebPortlet_searchQuery=${encodeURIComponent(keywords)}`;
    await pageObj.goto(searchUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    await pageObj.waitForSelector('body', { timeout: 15000 });
    await pageObj.waitForTimeout(2000);

    const results = await pageObj.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('article.card'));
      return articles.map((card, idx) => {
        const titleLink = card.querySelector('h3.card-title a');
        if (!titleLink) return null;

        const title = titleLink.innerText.trim();
        const url = titleLink.href;

        const categoryEl = card.querySelector('.category-top span.category');
        const tipo = categoryEl ? categoryEl.innerText.trim() : 'Provvedimento';

        const dateEl = card.querySelector('.category-top span.data');
        const data = dateEl ? dateEl.innerText.trim() : 'N/D';

        const snippetEl = card.querySelector('.card-subtitle');
        const snippetText = snippetEl ? snippetEl.innerText.trim() : '';

        const docIdMatch = url.match(/\/provvedimenti\/([^/?#]+)/);
        const docId = docIdMatch ? docIdMatch[1] : `doc-${idx}`;
        const id = `agcom-${docId}`;

        // Extract number if exists in title like "delibera n. 123/24"
        const numMatch = title.match(/\b\d+[\/\d]*\b/);
        const numeroProvv = numMatch ? numMatch[0] : 'N/D';

        return {
          id,
          tipo,
          sede: 'Napoli/Roma — Sedi AGCOM',
          sezione: 'Garanzie nelle Comunicazioni',
          numeroProvv,
          data,
          url,
          snippet: `<b>${title}</b><br/>${snippetText || `Provvedimento AGCOM.`}`,
          ricorso: '',
          ecli: ''
        };
      }).filter(Boolean);
    });

    console.log(`[AGCOM Scraper] Scraped ${results.length} results.`);
    return results;
  } catch (err) {
    console.error('[AGCOM Scraper] ❌ Error:', err.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeARERA(keywords, page = 1) {
  console.log(`[ARERA Scraper] 🚀 Starting search for: "${keywords}" (Page: ${page})`);
  let browser;
  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const pageObj = await context.newPage();

    const searchUrl = `https://www.arera.it/ricerca-google?prGoogleCseQuery=${encodeURIComponent(keywords)}`;
    await pageObj.goto(searchUrl, {
      waitUntil: 'networkidle',
      timeout: 35000
    });

    await pageObj.waitForSelector('body', { timeout: 20000 });
    await pageObj.waitForTimeout(3000);

    const results = await pageObj.evaluate(() => {
      // Google CSE usually puts results inside elements with class gs-webResult
      const elements = Array.from(document.querySelectorAll('.gs-webResult, .gsc-webResult'));
      return elements.map((el, idx) => {
        const titleLink = el.querySelector('a.gs-title, a.gsc-title');
        if (!titleLink) return null;

        const title = titleLink.innerText.trim();
        const url = titleLink.href;

        const snippetEl = el.querySelector('.gs-snippet, .gsc-table-result');
        const snippetText = snippetEl ? snippetEl.innerText.trim() : '';

        // Try parsing a date from snippet or title
        const dateMatch = snippetText.match(/\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b/) || title.match(/\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b/);
        const data = dateMatch ? dateMatch[0] : 'N/D';

        let tipo = 'Delibera';
        if (title.toLowerCase().includes('consultazione')) tipo = 'Consultazione';
        else if (title.toLowerCase().includes('parere')) tipo = 'Parere';
        else if (title.toLowerCase().includes('comunicato')) tipo = 'Comunicato';

        const numMatch = title.match(/\b\d+[\/\d]*\b/);
        const numeroProvv = numMatch ? numMatch[0] : 'N/D';

        const id = `arera-${idx}-${numeroProvv}`;

        return {
          id,
          tipo,
          sede: 'Milano/Roma — Sedi ARERA',
          sezione: 'Energia Reti e Ambiente',
          numeroProvv,
          data,
          url,
          snippet: `<b>${title}</b><br/>${snippetText || `Atto/documento ARERA.`}`,
          ricorso: '',
          ecli: ''
        };
      }).filter(Boolean);
    });

    console.log(`[ARERA Scraper] Scraped ${results.length} results.`);
    return results;
  } catch (err) {
    console.error('[ARERA Scraper] ❌ Error:', err.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeCONSOB(keywords, page = 1) {
  console.log(`[CONSOB Scraper] 🚀 Starting search for: "${keywords}" (Page: ${page})`);
  let browser;
  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const pageObj = await context.newPage();

    const searchUrl = `https://www.consob.it/web/consob/ricerca?q=${encodeURIComponent(keywords)}`;
    await pageObj.goto(searchUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    await pageObj.waitForSelector('body', { timeout: 15000 });
    await pageObj.waitForTimeout(2000);

    const results = await pageObj.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('.internet-box-ricerca'));
      return boxes.map((box, idx) => {
        const linkEl = box.querySelector('a.internet-box-ricerca__link');
        if (!linkEl) return null;

        const url = linkEl.href;
        const titleEl = box.querySelector('.internet-box-ricerca__title');
        const title = titleEl ? titleEl.innerText.trim() : linkEl.innerText.trim();

        const categoryEl = box.querySelector('.internet-box-ricerca__category');
        const tipo = categoryEl ? categoryEl.innerText.trim() : 'Delibera';

        const snippetEl = box.querySelector('.internet-box-ricerca__abstract');
        const snippetText = snippetEl ? snippetEl.innerText.trim() : '';

        // Extract dates
        const dateMatch = snippetText.match(/\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b/) || title.match(/\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b/);
        const data = dateMatch ? dateMatch[0] : 'N/D';

        const numMatch = title.match(/\b\d+[\/\d]*\b/) || snippetText.match(/\b\d+[\/\d]*\b/);
        const numeroProvv = numMatch ? numMatch[0] : 'N/D';

        const id = `consob-${idx}-${numeroProvv}`;

        return {
          id,
          tipo,
          sede: 'Roma/Milano — Sedi CONSOB',
          sezione: 'Mercato Finanziario',
          numeroProvv,
          data,
          url,
          snippet: `<b>${title}</b><br/>${snippetText || `Atto/Bollettino CONSOB.`}`,
          ricorso: '',
          ecli: ''
        };
      }).filter(Boolean);
    });

    console.log(`[CONSOB Scraper] Scraped ${results.length} results.`);
    return results;
  } catch (err) {
    console.error('[CONSOB Scraper] ❌ Error:', err.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}






/**
 * POST /api/search
 * Body: { modo, fonte, plesso, grado, sede, tipo, fonti, parole, logica, page, pageSize }
 */
app.post('/api/search', async (req, res) => {
  const { modo, fonte, plesso, grado, sede, tipo, fonti, parole, logica = 'and', page = 1, pageSize = 60 } = req.body;
  
  const keywordsArr = parole || [];

  // Format terms for real/simulated queries
  const positiveTerms = keywordsArr.filter(t => !t.startsWith('-'));
  const negativeTerms = keywordsArr.filter(t => t.startsWith('-')).map(t => t.slice(1));
  
  let formattedKeywords = positiveTerms.join(' ');
  if (negativeTerms.length > 0) {
    formattedKeywords += ' ' + negativeTerms.map(t => `-${t}`).join(' ');
  }

  console.log(`[Search API] 🚀 Starting unified search. Modo: "${modo}", Keywords: "${formattedKeywords}", Logica: "${logica}"`);

  // Determine which sources are targeted
  let targetRealScraper = false;
  let targetCorteContiScraper = false;
  let targetCorteCostituzionaleScraper = false;
  let targetANACScraper = false;
  let targetGaranteScraper = false;
  let targetAGCMScraper = false;
  let targetAGCOMScraper = false;
  let targetARERAScraper = false;
  let targetCONSOBScraper = false;
  let simulatedSources = [];

  if (modo === 'guidato') {
    if (plesso === 'amministrativa') {
      targetRealScraper = true;
    } else if (plesso === 'contabile') {
      targetCorteContiScraper = true;
    } else if (plesso === 'costituzionale') {
      targetCorteCostituzionaleScraper = true;
    } else if (plesso === 'anac') {
      targetANACScraper = true;
    } else if (plesso === 'garante') {
      targetGaranteScraper = true;
    } else if (plesso === 'agcm') {
      targetAGCMScraper = true;
    } else if (plesso === 'agcom') {
      targetAGCOMScraper = true;
    } else if (plesso === 'arera') {
      targetARERAScraper = true;
    } else if (plesso === 'consob') {
      targetCONSOBScraper = true;
    } else {
      // Any other guided plesso/authority is simulated
      simulatedSources.push(plesso || fonte || 'other');
    }
  } else {
    // Global mode: check source list
    const sourcesList = fonti || [];
    if (sourcesList.includes('tar') || sourcesList.includes('cds')) {
      targetRealScraper = true;
    }
    if (sourcesList.includes('conti')) {
      targetCorteContiScraper = true;
    }
    if (sourcesList.includes('cost')) {
      targetCorteCostituzionaleScraper = true;
    }
    if (sourcesList.includes('anac')) {
      targetANACScraper = true;
    }
    if (sourcesList.includes('garante')) {
      targetGaranteScraper = true;
    }
    if (sourcesList.includes('agcm')) {
      targetAGCMScraper = true;
    }
    if (sourcesList.includes('agcom')) {
      targetAGCOMScraper = true;
    }
    if (sourcesList.includes('arera')) {
      targetARERAScraper = true;
    }
    if (sourcesList.includes('consob')) {
      targetCONSOBScraper = true;
    }
    // Collect simulated sources
    sourcesList.forEach(s => {
      if (s !== 'tar' && s !== 'cds' && s !== 'conti' && s !== 'cost' && s !== 'anac' && s !== 'garante' && s !== 'agcm' && s !== 'agcom' && s !== 'arera' && s !== 'consob') {
        simulatedSources.push(s);
      }
    });
  }

  let finalResults = [];
  let totalResults = 0;

  // 1. Run Real Playwright Scraper if needed
  if (targetRealScraper) {
    let scraperSede = 'all';
    let scraperTipo = 'all';

    // Map guided selection to scraper parameters
    if (modo === 'guidato' && plesso === 'amministrativa') {
      if (grado === 'tar') {
        scraperTipo = 'Sentenza';
        if (sede === 'TAR Veneto') scraperSede = 'Venezia';
        else if (sede === 'TAR Lazio') scraperSede = 'Roma';
        else if (sede === 'TAR Lombardia') scraperSede = 'Milano';
        else if (sede === 'TAR Trentino-A.A.') scraperSede = 'Trento';
        else if (sede === 'TAR Emilia-Romagna') scraperSede = 'Bologna';
      } else if (grado === 'cds') {
        scraperSede = 'Consiglio di Stato';
        if (sede === 'Adunanza plenaria') scraperTipo = 'Adunanza Plenaria';
      } else if (grado === 'consultiva') {
        scraperSede = 'Consiglio di Stato';
        scraperTipo = 'Parere';
      }
    } else if (modo === 'globale') {
      // Global search defaults to searching all TAR/CdS
      scraperSede = 'all';
      scraperTipo = 'all';
    }

    console.log(`[Search API] Target contains Administrative Jurisprudence. Invoking Playwright scraper (Sede: ${scraperSede}, Tipo: ${scraperTipo})...`);
    let browser;
    try {
      browser = await getBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const pageObj = await context.newPage();

      await pageObj.goto('https://www.giustizia-amministrativa.it/web/guest/dcsnprr', {
        waitUntil: 'domcontentloaded',
        timeout: 25000
      });

      const searchInputSelector = 'input[id$="searchtextProvvedimenti"]';
      await pageObj.waitForSelector(searchInputSelector, { timeout: 15000 });

      // Page size
      const pageSizeSelector = 'select[id$="pageSize"]';
      if (await pageObj.locator(pageSizeSelector).count() > 0) {
        await pageObj.selectOption(pageSizeSelector, { value: String(pageSize) });
      }

      // Sede
      if (scraperSede && scraperSede !== 'all') {
        const sedeSelector = 'select[id$="sedeProvvedimenti"]';
        await pageObj.selectOption(sedeSelector, { label: scraperSede });
      }

      // Tipo
      if (scraperTipo && scraperTipo !== 'all') {
        const tipoSelector = 'select[id$="TipoProvvedimentoItem"]';
        await pageObj.selectOption(tipoSelector, { label: scraperTipo });
      }

      await pageObj.fill(searchInputSelector, formattedKeywords);
      
      const submitBtnSelector = 'button[id$="submitButton"]';
      await pageObj.click(submitBtnSelector);

      await pageObj.waitForLoadState('networkidle', { timeout: 15000 });
      await pageObj.waitForTimeout(2000);

      // Extract total results
      const totalResultsText = await pageObj.evaluate(() => {
        return document.body.innerText.match(/Trovati \d+ risultati/i)?.[0] || '';
      });
      const totalResultsMatch = totalResultsText.match(/\d+/);
      const realTotal = totalResultsMatch ? parseInt(totalResultsMatch[0], 10) : 0;
      totalResults += realTotal;

      // Extract results list
      const realResults = await pageObj.evaluate(() => {
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

      // Format IDs
      realResults.forEach((r, idx) => {
        r.id = `real-${r.numeroProvv}-${r.sede.replace(/\s+/g, '_')}-${idx}`;
      });

      finalResults = [...finalResults, ...realResults];
      console.log(`[Search API] Scraped ${realResults.length} real administrative results.`);
    } catch (scraperErr) {
      console.error('[Search API] ❌ Error in Playwright administrative scraper:', scraperErr.message);
    } finally {
      if (browser) await browser.close();
    }
  }

  // 1b. Run Corte dei Conti Scraper if needed
  if (targetCorteContiScraper) {
    try {
      console.log('[Search API] Target contains Corte dei Conti. Invoking scraper...');
      const ccResults = await scrapeCorteConti(formattedKeywords, sede, page, pageSize);
      finalResults = [...finalResults, ...ccResults];
      totalResults += ccResults.length;
    } catch (ccErr) {
      console.error('[Search API] ❌ Error in Corte dei Conti scraper:', ccErr.message);
    }
  }

  // 1c. Run Corte Costituzionale Scraper if needed
  if (targetCorteCostituzionaleScraper) {
    try {
      console.log('[Search API] Target contains Corte Costituzionale. Invoking scraper...');
      const costResults = await scrapeCorteCostituzionale(formattedKeywords, page);
      finalResults = [...finalResults, ...costResults];
      totalResults += costResults.length;
    } catch (costErr) {
      console.error('[Search API] ❌ Error in Corte Costituzionale scraper:', costErr.message);
    }
  }

  // 1d. Run ANAC Scraper if needed
  if (targetANACScraper) {
    try {
      console.log('[Search API] Target contains ANAC. Invoking scraper...');
      const anacResults = await scrapeANAC(formattedKeywords, page);
      finalResults = [...finalResults, ...anacResults];
      totalResults += anacResults.length;
    } catch (anacErr) {
      console.error('[Search API] ❌ Error in ANAC scraper:', anacErr.message);
    }
  }

  // 1e. Run Garante Privacy Scraper if needed
  if (targetGaranteScraper) {
    try {
      console.log('[Search API] Target contains Garante Privacy. Invoking scraper...');
      const garanteResults = await scrapeGarante(formattedKeywords, page);
      finalResults = [...finalResults, ...garanteResults];
      totalResults += garanteResults.length;
    } catch (garanteErr) {
      console.error('[Search API] ❌ Error in Garante Privacy scraper:', garanteErr.message);
    }
  }

  // 1f. Run AGCM Scraper if needed
  if (targetAGCMScraper) {
    try {
      console.log('[Search API] Target contains AGCM. Invoking scraper...');
      const agcmResults = await scrapeAGCM(formattedKeywords, page);
      finalResults = [...finalResults, ...agcmResults];
      totalResults += agcmResults.length;
    } catch (agcmErr) {
      console.error('[Search API] ❌ Error in AGCM scraper:', agcmErr.message);
    }
  }

  // 1g. Run AGCOM Scraper if needed
  if (targetAGCOMScraper) {
    try {
      console.log('[Search API] Target contains AGCOM. Invoking scraper...');
      const agcomResults = await scrapeAGCOM(formattedKeywords, page);
      finalResults = [...finalResults, ...agcomResults];
      totalResults += agcomResults.length;
    } catch (agcomErr) {
      console.error('[Search API] ❌ Error in AGCOM scraper:', agcomErr.message);
    }
  }

  // 1h. Run ARERA Scraper if needed
  if (targetARERAScraper) {
    try {
      console.log('[Search API] Target contains ARERA. Invoking scraper...');
      const areraResults = await scrapeARERA(formattedKeywords, page);
      finalResults = [...finalResults, ...areraResults];
      totalResults += areraResults.length;
    } catch (areraErr) {
      console.error('[Search API] ❌ Error in ARERA scraper:', areraErr.message);
    }
  }

  // 1i. Run CONSOB Scraper if needed
  if (targetCONSOBScraper) {
    try {
      console.log('[Search API] Target contains CONSOB. Invoking scraper...');
      const consobResults = await scrapeCONSOB(formattedKeywords, page);
      finalResults = [...finalResults, ...consobResults];
      totalResults += consobResults.length;
    } catch (consobErr) {
      console.error('[Search API] ❌ Error in CONSOB scraper:', consobErr.message);
    }
  }

  // Simulation disabled per user request: return empty results for non-integrated sources

  // Handle fallback if absolutely nothing was found or simulated
  if (finalResults.length === 0) {
    res.json({ success: true, count: 0, totalResults: 0, results: [] });
  } else {
    res.json({ success: true, count: finalResults.length, totalResults, results: finalResults });
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

  // Safety check on maximum judgments to export - updated to 60
  if (judgments.length > 60) {
    return res.status(400).json({ 
      error: `Puoi esportare al massimo 60 sentenze alla volta. Hai selezionato ${judgments.length} sentenze.` 
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
            judgmentText = await page.evaluate((url) => {
              if (url.includes('giurcost.org')) {
                const contentEl = document.querySelector('#post-content') || document.querySelector('.Section1') || document.querySelector('.card-body');
                return contentEl ? contentEl.innerText : (document.body ? document.body.innerText : '');
              }
              if (url.includes('anticorruzione.it')) {
                const articles = Array.from(document.querySelectorAll('.journal-content-article'));
                const mainArticle = articles.find(el => {
                  const title = el.getAttribute('data-analytics-asset-title') || '';
                  return title && !['SOCIAL HEADER', 'SOCIAL FOOTER', 'SOCIAL', 'Dove siamo', 'Pec', 'Numero di telefono footer'].includes(title);
                });
                return mainArticle ? mainArticle.innerText : (document.body ? document.body.innerText : '');
              }
              if (url.includes('gpdp.it') || url.includes('garanteprivacy.it')) {
                const contentEl = document.querySelector('#div-to-print') || document.querySelector('.journal-content-article') || document.body;
                return contentEl ? contentEl.innerText : '';
              }
              if (url.includes('agcm.it')) {
                const contentEls = Array.from(document.querySelectorAll('.description-content'));
                return contentEls.length > 0 ? contentEls.map(el => el.innerText).join('\n') : (document.body ? document.body.innerText : '');
              }
              return document.body ? document.body.innerText : '';
            }, item.url);
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

    // Check if the URL is simulated
    if (url.includes('simulazione-fonte.it') || !url.startsWith('http')) {
      console.log('[Summarize API] Simulated URL detected. Generating realistic text representation...');
      const simulateTextPrompt = `Sei un esperto avvocato italiano. Genera il testo completo esteso, verosimile e professionale (circa 400-600 parole in lingua italiana) di un provvedimento giuridico (sentenza o delibera o parere) compatibile con questo URL simulato: "${url}". Il testo deve contenere la premessa, i motivi in fatto e in diritto e il dispositivo finale.`;
      const response = await aiClient.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        contents: simulateTextPrompt
      });
      judgmentText = response.text;
    } else if (url.includes('/api/corte-conti/download')) {
      console.log('[Summarize API] Local proxy download URL detected. Fetching buffer directly...');
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download proxy document: ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      judgmentText = pdfData.text;
    } else if (url.toLowerCase().includes('.pdf')) {
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
      judgmentText = await page.evaluate((url) => {
        if (url.includes('giurcost.org')) {
          const contentEl = document.querySelector('#post-content') || document.querySelector('.Section1') || document.querySelector('.card-body');
          return contentEl ? contentEl.innerText : (document.body ? document.body.innerText : '');
        }
        if (url.includes('anticorruzione.it')) {
          const articles = Array.from(document.querySelectorAll('.journal-content-article'));
          const mainArticle = articles.find(el => {
            const title = el.getAttribute('data-analytics-asset-title') || '';
            return title && !['SOCIAL HEADER', 'SOCIAL FOOTER', 'SOCIAL', 'Dove siamo', 'Pec', 'Numero di telefono footer'].includes(title);
          });
          return mainArticle ? mainArticle.innerText : (document.body ? document.body.innerText : '');
        }
        if (url.includes('gpdp.it') || url.includes('garanteprivacy.it')) {
          const contentEl = document.querySelector('#div-to-print') || document.querySelector('.journal-content-article') || document.body;
          return contentEl ? contentEl.innerText : '';
        }
        if (url.includes('agcm.it')) {
          const contentEls = Array.from(document.querySelectorAll('.description-content'));
          return contentEls.length > 0 ? contentEls.map(el => el.innerText).join('\n') : (document.body ? document.body.innerText : '');
        }
        return document.body ? document.body.innerText : '';
      }, url);
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

    const promptDetailed = `Sei un assistente legale esperto di diritto pubblico e amministrativo italiano. Analizza il seguente testo di un provvedimento (sentenza/ordinanza/decreto/parere) della Repubblica Italiana ed elabora un riassunto estremamente chiaro, sintetico e professionale strutturato in lingua italiana. NOTA: Se il testo del provvedimento è scritto in un'altra lingua (es. in tedesco come a volte accade per la sezione di Bolzano), traducilo ed elabora comunque il riassunto finale interamente in lingua italiana.\n\nStruttura il riassunto esattamente in questo formato Markdown:\n\n# Riassunto Sentenza: [Mettere il Numero del provvedimento / Anno e il TAR/Organo Decidente]\n\n## 1. Oggetto del Contendere\n[Spiega in 2-3 frasi qual è l'oggetto della causa, la materia e il provvedimento amministrativo impugnato]\n\n## 2. Decisione dell'Organo Giudicante\n[Indica chiaramente se il ricorso è stato accolto, respinto, dichiarato improcedibile o inammissibile e la formula decisionale principale]\n\n## 3. Motivazioni Principali della Decisione\n[Fornisci un elenco puntato dettagliato dei principali punti in fatto e in diritto che hanno portato il giudice a questa decisione]\n\n## 4. Punti Chiave e Massime da Ricordare\n[Sintetizza i principi di diritto espressi o le norme chiave interpretate nella decisione]\n\n---\nEcco il testo del provvedimento:\n${judgmentText}`;

    const promptQuick = `Sei un assistente legale esperto di diritto pubblico e amministrativo italiano. Analizza il seguente testo di un provvedimento (sentenza/ordinanza/decreto/parere) della Repubblica Italiana ed elabora una sintesi ultra-rapida (massimo 100 parole) in lingua italiana. NOTA: Se il testo del provvedimento è scritto in un'altra lingua (es. in tedesco come a volte accade per la sezione di Bolzano), traducilo ed elabora comunque la sintesi finale interamente in lingua italiana.\n\nStruttura la sintesi esattamente in questo formato Markdown:\n\n# Sintesi Rapida: [Numero Provvedimento / Anno - TAR/Organo Decidente]\n\n* **Oggetto della Causa:** [Spiega in una singola frase chiara di cosa tratta la causa]\n* **Esito della Decisione:** [Indica l'esito principale: es. Accolto / Respinto / Inammissibile]\n* **Motivazione/Principio Cardine:** [Spiega il motivo principale della decisione o il principio cardine stabilito dai giudici in max due frasi]\n\n---\nEcco il testo del provvedimento:\n${judgmentText}`;

    const prompt = format === 'quick' ? promptQuick : promptDetailed;

    console.log('[Summarize API] [Step 3/3] Sending prompt to Google Gemini API...');
    const modelToUse = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    let response;
    try {
      console.log(`[Summarize API] Attempting generation with model: ${modelToUse}`);
      response = await aiClient.models.generateContent({
        model: modelToUse,
        contents: prompt
      });
    } catch (apiErr) {
      console.warn(`[Summarize API] Primary model ${modelToUse} failed. Trying fallback model... Details:`, apiErr.message);
      const fallbackModel = modelToUse === 'gemini-2.5-flash' ? 'gemini-1.5-flash' : 'gemini-2.5-flash';
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

/**
 * GET /api/corte-conti/download
 * Proxy endpoint to search and download attachments from Corte dei Conti
 */
app.get('/api/corte-conti/download', async (req, res) => {
  const { sede, tipo, numero, data } = req.query;
  if (!sede || !numero) {
    return res.status(400).json({ error: 'Parametri insufficienti per identificare il documento.' });
  }

  console.log(`[Proxy Download] 🚀 Requesting: ${tipo} ${sede} N. ${numero} del ${data}`);

  let browser;
  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const pageObj = await context.newPage();

    await pageObj.goto('https://banchedati.corteconti.it/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    await pageObj.waitForSelector('#inputRicerca', { timeout: 15000 });
    
    // Exact search using number and region
    const searchTerms = `${numero} ${sede}`;
    await pageObj.fill('#inputRicerca', searchTerms);
    await pageObj.click('#buttonSearch');

    await pageObj.waitForLoadState('networkidle', { timeout: 20000 });
    await pageObj.waitForTimeout(4000);

    const rowSelector = 'tr.align-top';
    const rowCount = await pageObj.locator(rowSelector).count();
    
    let downloadTriggered = false;
    
    for (let i = 0; i < rowCount; i++) {
      const row = pageObj.locator(rowSelector).nth(i);
      const rowText = await row.innerText();
      
      if (rowText.includes(numero) && rowText.includes(tipo)) {
        console.log(`[Proxy Download] Matching row found at index ${i}. Clicking download button...`);
        const downloadBtn = row.locator('button.btn-datatable');
        
        if (await downloadBtn.count() > 0) {
          const [download] = await Promise.all([
            pageObj.waitForEvent('download', { timeout: 20000 }),
            downloadBtn.click()
          ]);
          
          const pathFile = await download.path();
          const bufferFile = await fs.promises.readFile(pathFile);
          const filename = download.suggestedFilename() || `${tipo}_${numero}.pdf`;
          
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.setHeader('Content-Type', 'application/octet-stream');
          res.send(bufferFile);
          
          downloadTriggered = true;
          break;
        }
      }
    }

    if (!downloadTriggered) {
      console.warn('[Proxy Download] No matching document found with download button.');
      res.status(404).json({ error: 'Documento non trovato o allegato non disponibile.' });
    }

  } catch (err) {
    console.error('[Proxy Download] ❌ Error:', err.message);
    res.status(500).json({ error: 'Errore durante l\'intercettazione del download.', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

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

