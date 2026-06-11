import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    console.log('Navigating to ARERA /it/provvedimenti...');
    await page.goto('https://www.arera.it/it/provvedimenti', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Evaluate form submission handlers by getting their form submit function or spying
    // Let's run a search by directly typing "bonus" in form_rl_search_keyword, but since it is invisible, we can fill it using page.evaluate or force it visible.
    console.log('Forcing input form_rl_search_keyword visible and filling it...');
    await page.evaluate(() => {
      const inp = document.querySelector('#form_rl_search_keyword');
      if (inp) {
        inp.style.display = 'block';
        inp.style.visibility = 'visible';
        inp.value = 'bonus';
        // Dispatch event
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
      // Also check form submit trigger
      const form = document.querySelector('#form_rl_search');
      if (form) {
        // Find form submission listener
        console.log('Submitting form...');
        form.submit();
      }
    });

    await page.waitForTimeout(5000);
    console.log('URL after direct submit:', page.url());
    
    // If it doesn't navigate, let's trigger click on the search button after showing it.
    await page.evaluate(() => {
      const btn = document.querySelector('#button-search-form-2');
      if (btn) {
        btn.style.display = 'block';
        btn.style.visibility = 'visible';
        btn.click();
      }
    });
    
    await page.waitForTimeout(5000);
    console.log('URL after button click:', page.url());
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
})();
