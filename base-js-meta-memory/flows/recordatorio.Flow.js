import { addKeyword } from '@builderbot/bot';
import { text2iso, iso2text } from '../scripts/utils.js';
import { chat } from "../scripts/gemini.js";
import { schedule } from 'node-cron';

// Función mejorada para buscar recordatorios relacionados
async function buscarRecordatoriosRelacionados(consulta, recordatorios = {}) {
    console.log("buscarRecordatoriosRelacionados - Consulta recibida:", consulta, "Tipo:", typeof consulta);
    console.log("buscarRecordatoriosRelacionados - Recordatorios recibidos:", recordatorios, "Tipo:", typeof recordatorios);

    const recordatoriosArray = Object.values(recordatorios);
    if (recordatoriosArray.length === 0) {
        return [];
    }

    const prompt = `Eres un asistente que ayuda a buscar recordatorios.
Busca en la siguiente lista de recordatorios aquellos que estén relacionados con esta consulta: "${consulta}".
Lista de recordatorios: ${JSON.stringify(recordatoriosArray)}

IMPORTANTE: Debes responder SOLO con un array JSON que contenga los recordatorios encontrados.
Si no hay coincidencias, responde con [].
El formato debe ser exactamente como los recordatorios originales, manteniendo todas sus propiedades.`;
    
    const messages = [{ role: "user", content: prompt }];
    
    try {
        const response = await chat(prompt, messages);
        console.log("buscarRecordatoriosRelacionados - Respuesta de chat:", response);

        // Intentar parsear la respuesta como JSON
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(response);
        } catch (parseError) {
            // Si falla el parsing, intentar extraer el array JSON de la respuesta
            const match = response.match(/\[.*\]/s);
            if (match) {
                parsedResponse = JSON.parse(match[0]);
            } else {
                throw new Error('No se pudo extraer JSON válido de la respuesta');
            }
        }

        // Verificar que la respuesta sea un array
        if (!Array.isArray(parsedResponse)) {
            throw new Error('La respuesta no es un array');
        }

        return parsedResponse;
    } catch (error) {
        console.error('Error al procesar respuesta de búsqueda:', error);
        return [];
    }
}

// Función mejorada para agregar recordatorio
const agregarRecordatorio = async (textoCompleto, state, numero) => {
    if (!textoCompleto || !state || !numero) {
        console.error("agregarRecordatorio - Parámetros inválidos:", { textoCompleto, state, numero });
        return { success: false, error: 'Parámetros inválidos' };
    }

    console.log("agregarRecordatorio - Iniciando proceso con texto:", textoCompleto);
    
    try {
        const fechaISO = await text2iso(textoCompleto);
        console.log("agregarRecordatorio - Fecha ISO obtenida:", fechaISO);
        
        if (!fechaISO) {
            throw new Error('No se pudo interpretar la fecha del texto');
        }

        // Inicializar o obtener el estado actual
        let currentState = await state.get() || { recordatorios: {} };
        if (!currentState.recordatorios) {
            currentState.recordatorios = {};
        }

        // Crear el nuevo recordatorio
        const nuevoRecordatorio = {
            fecha: fechaISO,
            contenido: textoCompleto,
            fechaCreacion: new Date().toISOString(),
            numero: numero
        };

        // Guardar el recordatorio
        currentState.recordatorios[fechaISO] = nuevoRecordatorio;
        await state.update(currentState);

        const fechaFormateada = iso2text(fechaISO);
        console.log("agregarRecordatorio - Recordatorio guardado:", { fechaISO, fechaFormateada });

        return {
            success: true,
            fecha: fechaISO,
            contenido: textoCompleto,
            fechaFormateada
        };
    } catch (error) {
        console.error('Error al agregar recordatorio:', error);
        return { 
            success: false, 
            error: error.message || 'Error al procesar el recordatorio'
        };
    }
};

// Función mejorada para verificar y enviar recordatorios
async function checkAndSendReminders(provider, state) {
    try {
        console.log("checkAndSendReminders - Iniciando verificación");
        const currentState = await state.get() || { recordatorios: {} };
        const recordatorios = currentState.recordatorios;
        const now = new Date();

        console.log("checkAndSendReminders - Hora actual:", now.toISOString());
        let actualizacionNecesaria = false;

        for (const [fechaISO, recordatorio] of Object.entries(recordatorios)) {
            // Convertir la fecha ISO a objeto Date
            const fechaRecordatorio = new Date(fechaISO);
            console.log("checkAndSendReminders - Revisando recordatorio para:", fechaISO);
            console.log("checkAndSendReminders - Fecha recordatorio:", fechaRecordatorio);
            console.log("checkAndSendReminders - Diferencia en minutos:", 
                (fechaRecordatorio - now) / (1000 * 60));

            // Verificar si el recordatorio está dentro de los próximos 5 minutos
            const tiempoActual = now.getTime();
            const tiempoRecordatorio = fechaRecordatorio.getTime();
            const cincoMinutos = 5 * 60 * 1000; // 5 minutos en milisegundos

            if (tiempoRecordatorio > tiempoActual && 
                tiempoRecordatorio <= (tiempoActual + cincoMinutos)) {
                
                console.log("checkAndSendReminders - Preparando envío de recordatorio:", {
                    numero: recordatorio.numero,
                    contenido: recordatorio.contenido,
                    fechaProgramada: fechaISO
                });

                try {
                    const mensaje = `🔔 RECORDATORIO:\n` +
                                  `${recordatorio.contenido}\n` +
                                  `Programado para: ${iso2text(fechaISO)}`;

                    // Enviar el mensaje
                    await provider.sendMessage(recordatorio.numero, mensaje);
                    console.log("checkAndSendReminders - Mensaje enviado exitosamente");

                    // Marcar para eliminar
                    delete recordatorios[fechaISO];
                    actualizacionNecesaria = true;
                } catch (sendError) {
                    console.error('Error al enviar recordatorio:', sendError);
                }
            }
        }

        // Actualizar el estado solo si se eliminó algún recordatorio
        if (actualizacionNecesaria) {
            await state.update({ recordatorios });
            console.log("checkAndSendReminders - Estado actualizado después de enviar recordatorios");
        }

    } catch (error) {
        console.error('Error en checkAndSendReminders:', error);
    }
}

// Los flows se mantienen igual
const flowAgregarRecordatorio = addKeyword(['recordatorio', 'recordar', 'agregar'])
    .addAnswer('¿Qué quieres recordar y cuándo? (Por ejemplo: "tomar ibuprofeno mañana a las 12 pm")', 
        { capture: true }, 
        async (ctx, { flowDynamic, state }) => {
            console.log("flowAgregarRecordatorio - Contexto recibido:", ctx);
            const resultado = await agregarRecordatorio(ctx.body.trim(), state, ctx.from);
            
            if (resultado.success) {
                await flowDynamic(
                    `✅ Recordatorio guardado para el ${resultado.fechaFormateada}:\n` +
                    `Te enviaré un mensaje cuando sea el momento.`
                );
            } else {
                await flowDynamic('❌ Lo siento, no pude interpretar correctamente la fecha y hora. Por favor, intenta ser más específico.');
            }
        }
    );

const flowConsultarRecordatorio = addKeyword(['qué', 'consultar', 'buscar', 'tenía'])
    .addAnswer('¿Qué recordatorio quieres consultar?',
        { capture: true },
        async (ctx, { flowDynamic, state }) => {
            const currentState = await state.get() || { recordatorios: {} };
            const recordatoriosEncontrados = await buscarRecordatoriosRelacionados(ctx.body.trim(), currentState.recordatorios);

            if (recordatoriosEncontrados && recordatoriosEncontrados.length > 0) {
                const respuesta = recordatoriosEncontrados.map(rec => 
                    `📅 ${iso2text(rec.fecha)}: ${rec.contenido}`
                ).join('\n');
                await flowDynamic(respuesta);
            } else {
                await flowDynamic('❌ No encontré ningún recordatorio relacionado con tu búsqueda.');
            }
        }
    );

    export function initializeReminders(provider, state) {
        console.log("Inicializando sistema de recordatorios");
        // Ejecutar cada 30 segundos para mayor precisión
        schedule('*/30 * * * * *', () => {
            console.log("Ejecutando verificación de recordatorios");
            checkAndSendReminders(provider, state);
        });
    }

export { flowAgregarRecordatorio, flowConsultarRecordatorio };