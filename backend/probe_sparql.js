async function testSparql() {
  try {
    // Simple query to get all constitutional judges
    const query = `
      SELECT * WHERE { ?s ?p ?o } LIMIT 5
    `.trim();

    console.log('Sending query as simple GET request...');
    const url = `https://dati.cortecostituzionale.it/sparql?query=${encodeURIComponent('SELECT * WHERE { ?s ?p ?o } LIMIT 5')}`;
    const response = await fetch(url);

    console.log('Response Status:', response.status);
    const rawText = await response.text();
    console.log('SPARQL Response length:', rawText.length);
    console.log('SPARQL Response text:', rawText.substring(0, 500));
  } catch (err) {
    console.error('Error during SPARQL probe:', err);
  }
}

testSparql();
