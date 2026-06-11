import { chromium } from 'playwright';

(async () => {
  console.log('Launching browser for ARERA and CONSOB probes...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    console.log('--- Probing ARERA ---');
    // We can probe ARERA search using their standard site search or global query parameters if any.
    // Let's try navigating to the main page and searching, or see how search behaves.
    await page.goto('https://www.arera.it/it/cerca.htm?q=bonus', { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('ARERA Title:', await page.title());
    const areraHtml = await page.innerText('body');
    console.log('ARERA page contains "bonus"?:', areraHtml.toLowerCase().includes('bonus'));
    
    // Check links on ARERA
    const areraLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .map(a => ({ text: a.innerText.trim(), href: a.href }))
        .filter(a => a.href.includes('arera') && a.text.length > 5)
        .slice(0, 5);
    });
    console.log('ARERA Links:', areraLinks);

    console.log('--- Probing CONSOB ---');
    // Let's try navigating to CONSOB search page
    await page.goto('https://www.consob.it/web/consob/ricerca?q=delibera', { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('CONSOB Title:', await page.title());
    const consobHtml = await page.innerText('body');
    console.log('CONSOB page contains "delibera"?:', consobHtml.toLowerCase().includes('delibera'));
    
    const consobLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .map(a => ({ text: a.innerText.trim(), href: a.href }))
        .filter(a => a.href.includes('consob') && a.text.length > 5)
        .slice(0, 5);
    });
    console.log('CONSOB Links:', consobLinks);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
