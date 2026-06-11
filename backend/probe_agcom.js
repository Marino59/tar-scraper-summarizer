import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    const searchUrl = 'https://www.agcom.it/provvedimenti?p_p_id=it_agcom_provvedimenti_web_portlet_ProvvedimentiWebPortlet&p_p_lifecycle=0&_it_agcom_provvedimenti_web_portlet_ProvvedimentiWebPortlet_searchQuery=delibera';
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    const firstCardHtml = await page.evaluate(() => {
      const card = document.querySelector('article.card');
      return card ? card.outerHTML : 'Not found';
    });
    
    console.log('First card outerHTML:', firstCardHtml);
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
})();
