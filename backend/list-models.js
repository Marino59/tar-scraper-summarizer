import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function listModels() {
  try {
    const response = await ai.models.list();
    fs.writeFileSync('models.json', JSON.stringify(response, null, 2));
    console.log('Saved raw response to models.json');
  } catch (error) {
    console.error('Error listing models:', error);
  }
}

listModels();
