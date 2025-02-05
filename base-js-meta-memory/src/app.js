import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot';
import { MemoryDB as Database } from '@builderbot/bot';
import { MetaProvider as Provider } from '@builderbot/provider-meta';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { welcomeFlow } from '../flows/welcome.Flow.js';

import { documentFlow, mediaFlow } from '../flows/AnalisisDocumentos.js';
import { flowHospital} from '../flows/hospital.Flow.js';
import { flowFarmacia } from '../flows/farmacia.Flow.js';
import { flowAgregarRecordatorio,flowConsultarRecordatorio } from '../flows/recordatorio.Flow.js';
import { legalFlow } from '../flows/search.js';
import path from 'path';

// Configuración de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const PORT = process.env.PORT ?? 3008;

// Función para analizar el texto con Gemini
async function analyzeIntent(text) {
    const prompt = `
    Analiza el siguiente mensaje y determina la intención del usuario. 
    Posibles intenciones:
    - saludo
    - cita_medica
    - farmacia
    - receta
    - diabetes
    - resultados_laboratorio
    - recordatorio_agregar
    - recordatorio_consultar
    - otro
    
    Mensaje: "${text}"
    
    Responde solo con la intención y un nivel de confianza del 0 al 1.
    Formato: {intención}|{confianza}
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response.text().trim();
        const [intent, confidence] = response.split('|');
        return {
            intent: intent.trim(),
            confidence: parseFloat(confidence)
        };
    } catch (error) {
        console.error('Error al analizar con Gemini:', error);
        return null;
    }
}

// Función para generar respuesta sobre diabetes con Gemini
async function getDiabetesResponse(question) {
    const prompt = `
    Actúa como un asistente virtual llamado CareSense especializado en diabetes.
    Responde la siguiente pregunta sobre diabetes de manera amigable, empática y profesional.
    La respuesta debe:
    - Ser breve pero informativa (máximo 4 líneas)
    - Incluir emojis relevantes
    - Mantener un tono cercano y amigable
    - Enfocarse solo en diabetes y temas relacionados
    - Si la pregunta no es sobre diabetes, indicar que no puedes ayudar
    - No dar consejos médicos específicos, sino información general
    
    Pregunta: "${question}"
    `;

    try {
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        console.error('Error al generar respuesta con Gemini:', error);
        return '¡Hola! Por el momento no puedo procesar tu pregunta. ¿Podrías reformularla? 😊';
    }
}

const flowPrincipal = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, ctxFn) => {
        const bodyText = ctx.body.toLowerCase();
        const fileExtension = ctx.event?.file ? path.extname(ctx.event.file.name).toLowerCase() : null;

        // Si hay texto, intentamos analizar la intención con Gemini
        if (bodyText && bodyText.length > 0) {
            const analysis = await analyzeIntent(bodyText);
            
            if (analysis && analysis.confidence > 0.7) {
                switch (analysis.intent) {
                    case 'saludo':
                        return ctxFn.gotoFlow(welcomeFlow);
                    case 'cita_medica':
                        return ctxFn.gotoFlow(dateFlow);
                    case 'farmacia':
                        return ctxFn.gotoFlow(flowFarmacia);
                    case 'recordatorio_consultar':
                        return ctxFn.gotoFlow(flowConsultarRecordatorio);
                    case 'recordatorio_agregar':
                        return ctxFn.gotoFlow(flowAgregarRecordatorio);
                    case 'receta':
                        return ctxFn.endFlow(
                            '📄 Por favor, envía un archivo con la receta médica en formato PDF o una foto de la receta para continuar con el análisis.'
                        );
                    case 'resultados_laboratorio':
                        return ctxFn.endFlow(
                            '📄 Por favor, envía un archivo con los resultados de laboratorio en formato PDF o una foto continuar con el análisis.'
                        );
                    case 'diabetes':
                        const response = await getDiabetesResponse(bodyText);
                        return ctxFn.endFlow(`${response}\n\n¿Hay algo más en lo que pueda ayudarte? 🤗`);
                }
            }
        }

        // Manejo de archivos
        const fileActions = {
            '.pdf': () => ctxFn.gotoFlow(documentFlow),
            '.jpg': () => ctxFn.gotoFlow(mediaFlow),
            '.jpeg': () => ctxFn.gotoFlow(mediaFlow),
            '.png': () => ctxFn.gotoFlow(mediaFlow)
        };

        if (fileExtension && fileActions[fileExtension]) {
            return fileActions[fileExtension]();
        } else if (fileExtension) {
            return ctxFn.endFlow('❌ Por favor, envía un archivo válido (imagen o PDF).');
        }

        // Si no se identifica la intención, vamos al flujo de bienvenida
        return ctxFn.gotoFlow(welcomeFlow);
    });

const main = async () => {
    const database = new Database();

    const adapterFlow = createFlow([
        flowPrincipal,legalFlow,

        welcomeFlow,
        documentFlow,
        mediaFlow,
        flowFarmacia,
        flowHospital,flowAgregarRecordatorio,flowConsultarRecordatorio
    ]);

    const adapterProvider = createProvider(Provider, {
        jwtToken: process.env.JWT_TOKEN,
        numberId: process.env.NUMBER_ID,
        verifyToken: process.env.VERIFY_TOKEN,
        version: 'v21.0',
    });

    const { httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: database,
    });

    httpServer(+PORT);
};

main();