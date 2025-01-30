import { addKeyword, EVENTS } from '@builderbot/bot';

const welcomeFlow = addKeyword(EVENTS.ACTION)  
    .addAction(async (ctx, ctxFn) => {  
        await ctxFn.endFlow(`
🌟 ¡Hola! Soy Carense, soy tu asistente asistente para pacientes diabeticos estoy aqui para para cuidar de tu salud. 🌟
Puedo ayudarte con lo siguiente:
- 🗓️ Agendar una cita
- 💊 Consultas sobre recetas y instrucciones de toma de medicamentos
- 🧪 Consultas sobre tus pedidos de laboratorio
- 🩺 Responder tus preguntas sobre la diabetes
- 🏥 Mostrarte hospitales cercanos a tu ubicación
- 💊 Mostrarte farmacias cercanas a tu ubicación
- 🗓️ Recordatorios  

Estoy aquí para lo que necesites. 😊  
        `);  
    });  

export { welcomeFlow };

