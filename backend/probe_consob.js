import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    console.log('Navigating to CONSOB search results...');
    await page.goto('https://www.consob.it/web/consob/ricerca?q=delibera', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Dump outerHTML of the first few elements with class internet-box-ricerca
    const boxHtml = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('.internet-box-ricerca'));
      return boxes.slice(0, 3).map(el => el.outerHTML);
    });
    
    console.log('CONSOB first boxes html:', boxHtml);
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
})();
