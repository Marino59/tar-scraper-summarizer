import { chromium } from 'playwright';
import fs from 'fs';

async function probe() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    console.log('Navigating to https://www.cortecostituzionale.it/actionPronuncia.do...');
    const response = await page.goto('https://www.cortecostituzionale.it/actionPronuncia.do', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    console.log('Status code:', response.status());

    // Wait a couple seconds
    await page.waitForTimeout(3000);

    const title = await page.title();
    console.log('Page title:', title);

    const html = await page.content();
    fs.writeFileSync('cortecost_source.html', html);
    console.log('Saved source to cortecost_source.html');

    // Extract inputs and forms
    const info = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, button, textarea')).map(el => {
        return {
          tag: el.tagName,
          id: el.id,
          name: el.name,
          type: el.type,
          placeholder: el.placeholder,
          class: el.className,
          value: el.value,
          text: el.innerText
        };
      });
      return { inputs };
    });

    fs.writeFileSync('cortecost_inputs.json', JSON.stringify(info, null, 2));
    console.log('Saved inputs to cortecost_inputs.json');

  } catch (err) {
    console.error('Error during probe:', err);
  } finally {
    await browser.close();
  }
}

probe();
