import { addKeyword } from "@builderbot/bot";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../db/db.js";
import { doc, getDoc } from "firebase/firestore";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const PARSE_PROMPT = `
Extrae el RUC y el tipo de consulta del mensaje. El tipo puede ser "original", "actual" o "todos". Responde solo con un JSON:
{
  "ruc": "número de RUC encontrado",
  "tipo": "tipo de consulta (original/actual/todos)"
}
Ejemplo:
Mensaje: "consultar todos los estados del ruc 0190155722001"
Respuesta: {
  "ruc": "0190155722001",
  "tipo": "todos"
}
`;

async function parseMessage(message) {
  try {
    const { response } = await model.generateContent(PARSE_PROMPT + "\nMensaje: " + message);
    const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error('Error parsing message:', error);
    return null;
  }
}

async function queryStatus(userId, ruc, tipo) {
  try {
    const userDocRef = doc(db, "users", userId);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      throw new Error("Usuario no encontrado");
    }

    const documentos = userDoc.data().documentos;
    const caso = documentos.find(doc => doc.parteDemandante?.ruc === ruc);

    if (!caso) {
      throw new Error("Caso no encontrado");
    }

    if (tipo === "todos") {
      // Retorna el estado original y todo el historial
      return {
        tipo: "todos",
        estadoOriginal: {
          estado: caso.detallesCredito?.estado || "No disponible",
          fecha: caso.detallesCredito?.fechaEmision || "Fecha no disponible"
        },
        historialEstados: caso.estadoActual || []
      };
    } else if (tipo === "original") {
      return {
        tipo: "original",
        estado: caso.detallesCredito?.estado || "No disponible",
        fecha: caso.detallesCredito?.fechaEmision || "Fecha no disponible"
      };
    } else {
      // Obtener el último estado del array estadoActual
      const estadosActuales = caso.estadoActual || [];
      const ultimoEstado = estadosActuales[estadosActuales.length - 1];
      
      return {
        tipo: "actual",
        estado: ultimoEstado?.estado || "No disponible",
        fecha: ultimoEstado?.fecha || "Fecha no disponible"
      };
    }
  } catch (error) {
    console.error('Error querying status:', error);
    throw error;
  }
}

function formatearFecha(fecha) {
  try {
    return new Date(fecha).toLocaleString('es-EC', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return fecha;
  }
}

const queryStatusFlow = addKeyword(['consultar estado', 'ver estado', 'estado'])
  .addAnswer('🔍 Ingrese el RUC y especifique si desea consultar el estado original, actual o todos:', { capture: true }, 
    async (ctx, { flowDynamic }) => {
      try {
        const parsedData = await parseMessage(ctx.body);
        
        if (!parsedData || !parsedData.ruc || !parsedData.tipo) {
          return flowDynamic('❌ Formato inválido. Use:\n- "consultar estado original del ruc [RUC]"\n- "consultar estado actual del ruc [RUC]"\n- "consultar todos los estados del ruc [RUC]"');
        }

        const resultado = await queryStatus(ctx.from, parsedData.ruc, parsedData.tipo);
        
        if (resultado.tipo === "todos") {
          let mensaje = `📋 Historial completo de estados:\n\n`;
          mensaje += `Estado Original (${formatearFecha(resultado.estadoOriginal.fecha)}):\n${resultado.estadoOriginal.estado}\n\n`;
          mensaje += `Historial de estados:\n`;
          
          resultado.historialEstados.forEach((estado, index) => {
            mensaje += `${index + 1}. ${estado.estado}\n   Fecha: ${formatearFecha(estado.fecha)}\n\n`;
          });
          
          await flowDynamic(mensaje);
        } else {
          const tipoEstado = resultado.tipo === "original" ? "original" : "actual";
          await flowDynamic(`📋 Estado ${tipoEstado}:\nEstado: ${resultado.estado}\nFecha: ${formatearFecha(resultado.fecha)}`);
        }
      } catch (error) {
        await flowDynamic('❌ Error al consultar el estado: ' + error.message);
      }
    }
  );

export { queryStatusFlow };