import { addKeyword, EVENTS } from '@builderbot/bot';
import { text2iso, iso2text } from "../scripts/utils.js";
import { isDateAvailable, getNextAvailableSlot } from "../scripts/calendar.js";
import { chat } from "../scripts/gemini.js";
import { formFlow } from "./form.Flow.js";

const promptBase = `  
    Eres un asistente virtual diseñado para ayudar a los usuarios a agendar citas mediante una conversación.
    Tu objetivo es únicamente ayudar al usuario a elegir un horario y una fecha para reservar una cita.
    Te proporcionaré la fecha solicitada por el usuario y su disponibilidad. Esta fecha debe ser confirmada por el usuario.
    Si la disponibilidad es verdadera, responde: "La fecha solicitada está disponible. El turno sería el [día de la semana] [día] de [mes] [año] a las [hora]hs".
    Si la disponibilidad es falsa, recomienda la siguiente fecha disponible: "La fecha y horario solicitados no están disponibles, te puedo ofrecer el [día de la semana] [día] de [mes] [año] a las [hora]hs".
    Bajo ninguna circunstancia realices consultas adicionales.
    En lugar de decir que la disponibilidad es falsa, ofrece una disculpa indicando que esa fecha no está disponible y sugiere la siguiente.
    A continuación, los estados actualizados de dichas fechas:
`;

const dateFlow = addKeyword(EVENTS.ACTION)
    .addAnswer("¡Perfecto! ¿Qué fecha deseas agendar?", { capture: true })
    .addAnswer("Revisando disponibilidad...", null,
        async (ctx, ctxFn) => {
            const userInput = ctx.body.trim();
            console.log("Entrada del usuario en dateFlow:", userInput);

            const currentDate = new Date();
            let solicitedDate;
            try {
                solicitedDate = await text2iso(userInput);
                console.log("Fecha procesada a ISO:", solicitedDate);
            } catch (error) {
                console.error("Error al procesar la fecha:", error);
                return ctxFn.endFlow("No se pudo interpretar la fecha proporcionada. Por favor, proporciona una fecha válida.");
            }

            if (!solicitedDate) {
                console.error("No se pudo deducir una fecha válida.");
                return ctxFn.endFlow("No se pudo deducir una fecha. Por favor, proporciona una fecha válida.");
            }

            const startDate = new Date(solicitedDate);
            console.log("Fecha de inicio:", startDate);

            let dateAvailable;
            try {
                dateAvailable = await isDateAvailable(startDate);
                console.log("Disponibilidad de la fecha:", dateAvailable);
            } catch (error) {
                console.error("Error al verificar disponibilidad de la fecha:", error);
                return ctxFn.endFlow("Ocurrió un error al verificar la disponibilidad. Por favor, intenta nuevamente más tarde.");
            }

            if (!dateAvailable) {
                let nextDateAvailable;
                try {
                    nextDateAvailable = await getNextAvailableSlot(startDate);
                    console.log("Siguiente fecha disponible:", nextDateAvailable);
                } catch (error) {
                    console.error("Error al obtener la siguiente fecha disponible:", error);
                    return ctxFn.endFlow("Ocurrió un error al obtener la siguiente fecha disponible. Por favor, intenta nuevamente más tarde.");
                }

                const isoString = nextDateAvailable.start.toISOString();
                const dateText = await iso2text(isoString);
                const responseContent = `${promptBase}\nHoy es: ${currentDate}\nLa fecha solicitada es: ${solicitedDate}\nLa fecha solicitada no está disponible. El próximo espacio disponible es: ${dateText}. Por favor, proporciona la fecha siempre en español.`;
                const response = await chat(responseContent, [{ role: 'user', content: userInput }]);
                console.log("Respuesta del bot en dateFlow (fecha no disponible):", response);
                await ctxFn.flowDynamic(response);
                await ctxFn.state.update({ date: nextDateAvailable.start });

                return ctxFn.gotoFlow(formFlow);
            } else {
                const dateText = await iso2text(startDate.toISOString());
                const responseContent = `${promptBase}\nHoy es: ${currentDate}\nLa fecha solicitada es: ${solicitedDate}\nLa fecha solicitada está disponible. El turno sería el ${dateText}.`;
                const response = await chat(responseContent, [{ role: 'user', content: userInput }]);
                console.log("Respuesta del bot en dateFlow (fecha disponible):", response);
                await ctxFn.flowDynamic(response);
                await ctxFn.state.update({ date: startDate });

                return ctxFn.gotoFlow(formFlow);
            }
        });

export { dateFlow };
