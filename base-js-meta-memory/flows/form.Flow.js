import { addKeyword, EVENTS } from '@builderbot/bot';
import { createEvent } from "../scripts/calendar.js";
import { dateFlow } from "./date.Flow.js";

const formFlow = addKeyword(EVENTS.ACTION)
    .addAnswer("Te voy a hacer unas consultas primero para agendar tu turno. Primero, ¿cuál es tu nombre?", { capture: true },
        async (ctx, ctxFn) => {
            await ctxFn.state.update({ name: ctx.body });
        })
    .addAnswer("Perfecto, ¿cuál es el motivo del turno?", { capture: true },
        async (ctx, ctxFn) => {
            await ctxFn.state.update({ motive: ctx.body });
        })
    .addAnswer("¡Genial! ¿Deseas confirmar esta cita? Responde 'sí' para confirmar o 'no' para elegir otra fecha.", { capture: true },
        async (ctx, ctxFn) => {
            const userConfirmation = ctx.body.trim().toLowerCase();
            if (userConfirmation === 'si') {
                // Recuperar la información de la cita
                const userInfo = await ctxFn.state.getMyState();
                const eventName = userInfo.name;
                const description = userInfo.motive;
                const date = userInfo.date;

                // Crear el evento
                const eventId = await createEvent(eventName, description, date);
                console.log("Reunión creada con ID:", eventId);

                // Limpiar el estado
                await ctxFn.state.clear();

                return ctxFn.endFlow("¡Cita agendada con éxito! Te esperamos.");
            } else {
                // Si la respuesta es 'no' o cualquier otra cosa, volver a solicitar una fecha
                return ctxFn.gotoFlow(dateFlow);
            }
        });

export { formFlow };
