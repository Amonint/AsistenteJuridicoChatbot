import { chat } from "../scripts/gemini.js";
import { DateTime } from 'luxon';

async function text2iso(text) {
    if (!text || typeof text !== 'string') {
        console.error('text2iso: Texto inválido recibido:', text);
        return null;
    }

    try {
        // Procesar primero expresiones de tiempo relativas simples
        const minutosMatch = text.match(/en (\d+) minuto/i);
        if (minutosMatch) {
            const minutos = parseInt(minutosMatch[1]);
            return DateTime.now()
                .plus({ minutes: minutos })
                .setZone('America/Guayaquil')
                .toISO();
        }

        // Si no es una expresión simple, usar Gemini para interpretar
        const currentDate = DateTime.now().setZone('America/Guayaquil');
        const prompt = `Eres un asistente especializado en extraer fechas y horas de textos en español.
La fecha actual es: ${currentDate.toISO()}

REGLAS:
1. Si el texto menciona una cantidad de minutos (ej: "en X minutos"), suma esos minutos a la hora actual
2. Si menciona una hora específica sin fecha, asume que es para hoy (o mañana si la hora ya pasó)
3. Si no se especifica la hora, usa 10:00
4. Responde SOLO con la fecha y hora en formato ISO

Ejemplo 1: "en 5 minutos" -> ${DateTime.now().plus({ minutes: 5 }).toISO()}
Ejemplo 2: "mañana a las 3pm" -> ${DateTime.now().plus({ days: 1 }).set({ hour: 15, minute: 0 }).toISO()}

Texto a procesar: "${text}"

Responde SOLO con la fecha ISO, nada más.`;

        const messages = [{ role: "user", content: text }];
        const response = await chat(prompt, messages);

        if (!response) {
            console.error('text2iso: Respuesta vacía de chat');
            return null;
        }

        // Limpiar y validar la respuesta
        const cleanResponse = response.trim();
        const isoDateTime = DateTime.fromISO(cleanResponse);

        if (!isoDateTime.isValid) {
            console.error('text2iso: Fecha inválida generada:', cleanResponse);
            return null;
        }

        return isoDateTime.toISO();
    } catch (error) {
        console.error('Error en text2iso:', error);
        return null;
    }
}

function iso2text(iso) {
    if (!iso) {
        console.error('iso2text: ISO string vacío o nulo');
        return 'Fecha no válida';
    }

    try {
        const dateTime = DateTime.fromISO(iso)
            .setZone('America/Guayaquil');

        if (!dateTime.isValid) {
            throw new Error('Fecha no válida');
        }

        return dateTime.toLocaleString({
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } catch (error) {
        console.error('Error en iso2text:', error);
        return 'Fecha no válida';
    }
}

export { text2iso, iso2text };