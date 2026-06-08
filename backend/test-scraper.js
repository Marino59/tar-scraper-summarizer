import { chromium } from 'playwright';
import fs from 'fs';

async function test() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    const testUrl = 'https://mdp.giustizia-amministrativa.it/visualizza/?nodeRef=&schema=tar_rm&nrg=202304304&nomeFile=202610353_01.html&subDir=Provvedimenti';
    console.log('Navigating to judgment URL:', testUrl);
    
    // Use domcontentloaded to prevent waiting on infinite tracking scripts/images
    await page.goto(testUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    });

    console.log('DOM Content Loaded. Waiting for body elements...');
    await page.waitForSelector('body');

    // Wait short time for dynamic content if any
    await page.waitForTimeout(2000);

    console.log('Page loaded. Title:', await page.title());

    const textContent = await page.evaluate(() => {
      return document.body ? document.body.innerText : '';
    });

    fs.writeFileSync('judgment.txt', textContent);
    console.log('Saved judgment text content to judgment.txt. Length:', textContent.length);

  } catch (error) {
    console.error('Error during scraping test:', error);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

test();
