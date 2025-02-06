import { addKeyword } from "@builderbot/bot";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../db/db.js";
import { doc, getDoc, updateDoc } from "firebase/firestore";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const PARSE_PROMPT = `
Extrae el RUC, el nuevo estado y la fecha/hora del mensaje. Si no se especifica fecha/hora, no incluyas esos campos. Responde solo con un JSON:
{
  "ruc": "número de RUC encontrado",
  "estado": "nuevo estado mencionado",
  "fecha": "fecha y hora en formato ISO (si se menciona)"
}
Ejemplo:
Mensaje: "del ruc 0190155722001 quiero cambiar el estado a: Sentencia dictada el 05/02/2025 a las 17:00"
Respuesta: {
  "ruc": "0190155722001",
  "estado": "Sentencia dictada",
  "fecha": "2025-02-05T17:00:00-05:00"
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

async function updateStatus(userId, ruc, newStatus, statusDate) {
  try {
    const userDocRef = doc(db, "users", userId);
    const userDoc = await getDoc(userDocRef);
    if (!userDoc.exists()) {
      throw new Error("Usuario no encontrado");
    }
    const documentos = userDoc.data().documentos;
    const caseIndex = documentos.findIndex(doc => 
      doc.parteDemandante?.ruc === ruc
    );
    if (caseIndex === -1) {
      throw new Error("Caso no encontrado");
    }
    // Actualizar el documento con el nuevo estado y fecha
    const updatedDoc = {
      ...documentos[caseIndex],
      estadoActual: [
        ...(documentos[caseIndex].estadoActual || []),
        {
          estado: newStatus,
          fecha: statusDate || new Date().toISOString() // Usa la fecha proporcionada o la actual
        }
      ]
    };
    const newDocs = [...documentos];
    newDocs[caseIndex] = updatedDoc;
    await updateDoc(userDocRef, {
      documentos: newDocs
    });
    return true;
  } catch (error) {
    console.error('Error updating status:', error);
    throw error;
  }
}

const updateStatusFlow = addKeyword(['actualizar', 'cambiar',])
  .addAnswer('🔄 Ingrese el RUC, el nuevo estado y la fecha (opcional):', { capture: true }, 
    async (ctx, { flowDynamic }) => {
      try {
        const parsedData = await parseMessage(ctx.body);
        
        if (!parsedData || !parsedData.ruc || !parsedData.estado) {
          return flowDynamic('❌ Formato inválido. Use: "del ruc [RUC] quiero cambiar el estado a: [nuevo estado] el [fecha] a las [hora]"');
        }
        
        await updateStatus(ctx.from, parsedData.ruc, parsedData.estado, parsedData.fecha);
        
        const fechaMsg = parsedData.fecha ? ` con fecha ${parsedData.fecha}` : '';
        await flowDynamic(`✅ Estado actualizado correctamente${fechaMsg}`);
      } catch (error) {
        await flowDynamic('❌ Error al actualizar el estado: ' + error.message);
      }
    }
  );

export { updateStatusFlow };