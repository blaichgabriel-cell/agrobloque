const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

const jsonHeaders = {
  'Content-Type': 'application/json',
};

const safeNumber = (value) => {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseJsonFromText = (text) => {
  if (!text) throw new Error('Respuesta vacia de la IA.');
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(cleaned);
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, jsonHeaders);
    res.end(JSON.stringify({ error: 'Metodo no permitido.' }));
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.writeHead(500, jsonHeaders);
    res.end(JSON.stringify({ error: 'Falta configurar OPENAI_API_KEY en Vercel.' }));
    return;
  }

  try {
    const body = req.body || {};
    const modelo = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const contexto = {
      campo: body.campo || '',
      bloque: body.bloque || null,
      objetivo: body.objetivo || 'Produccion',
      tanque_litros: safeNumber(body.tanque_litros) || 200,
      ec_agua: safeNumber(body.ec_agua),
      ec_objetivo: safeNumber(body.ec_objetivo),
      productos_disponibles: Array.isArray(body.productos_disponibles) ? body.productos_disponibles.slice(0, 80) : [],
      productos_ideales_base: Array.isArray(body.productos_ideales_base) ? body.productos_ideales_base : [],
      registros_recientes: Array.isArray(body.registros_recientes) ? body.registros_recientes.slice(0, 8) : [],
    };

    const prompt = `
Sos un asistente tecnico para fertirriego hortícola familiar-profesional.
Tu tarea es proponer un plan nutricional editable y prudente.

Reglas:
- No inventes datos que no fueron enviados.
- Separá producto ideal de disponibilidad en inventario.
- Podés recomendar productos aunque no estén en inventario si son agronómicamente importantes.
- Tené en cuenta objetivo, cultivo, tanque, EC de agua, EC objetivo, historial reciente y productos disponibles.
- Para cargado de frutos priorizá llenado/calibre/firmeza: potasio, calcio, magnesio y control de EC.
- Si faltan datos, dejá advertencias en "notas".
- No des indicaciones peligrosas ni definitivas; todo debe quedar editable y con revisión de EC.
- Respondé SOLO JSON válido, sin markdown.

Formato exacto:
{
  "ec_final": "numero o vacio",
  "notas": "texto breve y util",
  "productos": [
    {
      "producto": "nombre ideal recomendado",
      "cantidad": "numero",
      "unidad": "g, cc, ml o kg",
      "nutrientes": "aporte principal",
      "motivo": "por que se recomienda"
    }
  ]
}

Contexto:
${JSON.stringify(contexto, null, 2)}
`;

    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelo,
        input: prompt,
        temperature: 0.2,
        max_output_tokens: 1200,
      }),
    });

    const data = await openaiResponse.json();
    if (!openaiResponse.ok) {
      throw new Error(data?.error?.message || 'No se pudo generar la recomendacion.');
    }

    const outputText = data.output_text ||
      data.output?.flatMap(item => item.content || [])
        .map(part => part.text || '')
        .join('\n');

    const parsed = parseJsonFromText(outputText);
    res.writeHead(200, jsonHeaders);
    res.end(JSON.stringify({
      ec_final: parsed.ec_final || '',
      notas: parsed.notas || '',
      productos: Array.isArray(parsed.productos) ? parsed.productos : [],
    }));
  } catch (error) {
    res.writeHead(500, jsonHeaders);
    res.end(JSON.stringify({ error: error.message || 'Error generando recomendacion IA.' }));
  }
};
