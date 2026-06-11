import { chromium } from 'playwright';
import fs from 'fs';

async function probe() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    console.log('Navigating to https://def.finanze.it...');
    const response = await page.goto('https://def.finanze.it', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    console.log('Status code:', response.status());
    await page.waitForTimeout(3000);

    const title = await page.title();
    console.log('Page title:', title);

    const html = await page.content();
    fs.writeFileSync('def_finanze_source.html', html);
    console.log('Saved source to def_finanze_source.html');

  } catch (err) {
    console.error('Error during def_finanze probe:', err);
  } finally {
    await browser.close();
  }
}

probe();
