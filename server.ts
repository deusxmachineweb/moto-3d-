import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // CORS headers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  const ai = new GoogleGenAI();

  // /api/chat endpoint compatible with n8n chat widget
  app.all('/api/chat', async (req, res) => {
    if (req.method === 'GET') {
      return res.json([]);
    }

    const { chatInput, message, text, action, sessionId } = req.body;

    if (action === 'loadPreviousSession') {
      return res.json([]);
    }

    const prompt = chatInput || message || text || 'Hola';

    // 1. First, attempt to contact the external n8n webhook if active
    const N8N_URL = 'https://devwebhookn8n.xn--manitasespaa-khb.com/webhook/d9b51377-130b-470e-b5ce-d2c2b0e27c43/chat';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);
      const n8nResp = await fetch(N8N_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (n8nResp.ok) {
        const data = await n8nResp.json();
        const output = data.output ?? data.text ?? data.message;
        if (output) {
          return res.json({ output, text: output });
        }
      }
    } catch {
      // If n8n fails/times out, proceed to AI specialist
    }

    // 2. Generate answer with Gemini
    try {
      const systemInstruction = `Eres el Asistente Técnico Oficial de VELOCITY Corse, experto en superbikes de competición: la Panigale V4R y la Ninja H2R.
Responde en español de forma entusiasta, técnica y concisa (máximo 2 párrafos).
Ficha Panigale V4R:
- Motor Desmosedici Stradale R V4 a 90° de 998cc, distribución desmodrómica, bielas de titanio, 16.500 rpm de corte.
- Potencia: 221 CV a 15.250 rpm (237 CV con kit Akrapovič de titanio).
- Carga aerodinámica: 30 kg a 270 km/h gracias a las alas biplano de fibra de carbono.
- Frenos: Pinzas radiales Brembo Stylema® R con discos flotantes de 330 mm.
- Peso en seco: 165,5 kg.
- Aceleración: 0-100 km/h en 2,7 s. Velocidad máxima: > 318 km/h.
- Test Ride disponible en circuitos FIM (Mugello, Jerez, Misano, Portimão, COTA).
Invita amablemente al usuario a interactuar con los planos 3D de la web o reservar su prueba en circuito.`;

      const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 350,
        }
      });

      const reply = response.text || '¡Hola! Estoy a tu disposición para informarte sobre la Panigale V4R.';
      return res.json({ output: reply, text: reply });
    } catch (err) {
      console.error('Gemini fallback triggered:', err);
      // Fallback knowledge engine
      let reply = '¡Hola! Soy el especialista oficial de VELOCITY. ';
      const lower = prompt.toLowerCase();
      if (lower.includes('potencia') || lower.includes('cv') || lower.includes('caballos') || lower.includes('motor')) {
        reply += 'La Panigale V4R monta el motor Desmosedici Stradale R V4 de 998cc, rindiendo 221 CV a 15.250 rpm de serie y hasta 237 CV con el kit de escape Akrapovič de titanio.';
      } else if (lower.includes('ala') || lower.includes('aleron') || lower.includes('downforce') || lower.includes('aerodin')) {
        reply += 'Sus alas biplano de fibra de carbono generan 30 kg de carga aerodinámica (downforce) a 270 km/h, manteniendo el tren delantero clavado al asfalto en aceleraciones extremas.';
      } else if (lower.includes('test') || lower.includes('ride') || lower.includes('reserva') || lower.includes('circuito') || lower.includes('probar')) {
        reply += 'Puedes solicitar tu Test Ride exclusivo en circuito homologado (Mugello, Jerez, Misano o Portimão) haciendo clic en el botón superior "Test Ride" o en la sección final.';
      } else if (lower.includes('freno') || lower.includes('brembo')) {
        reply += 'Equipa pinzas radiales monobloque Brembo Stylema® R con pistones ventilados y doble disco flotante de 330 mm con Cornering ABS EVO.';
      } else {
        reply += 'La Panigale V4R es una auténtica superbike de WorldSBK homologada: 221 CV, 165,5 kg de peso en seco y velocidad punta superior a 318 km/h. ¿Qué detalle técnico te gustaría conocer?';
      }
      return res.json({ output: reply, text: reply });
    }
  });

  // Mount Vite middlewares for dev or static for prod
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VELOCITY Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
