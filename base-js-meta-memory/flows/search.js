import { addKeyword } from "@builderbot/bot";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../db/db.js";
import { doc, getDoc } from "firebase/firestore";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const SEARCH_PROMPT = `
Como experto en documentos legales ecuatorianos, analiza la consulta y genera un JSON con:
{
  "filters": {"ruta.en.documento": "valor"},
  "requiredFields": ["campos.a.mostrar"]
}

Estructura del documento:
- detallesCredito: { estado, fechaEmision, montoAdeudado, montoOriginal, numeroCredito, numeroPagare, tasaInteres }
- informacionGeneral: { tipoDocumento, jurisdiccion }
- informacionProcesal: { baseLegal, cuantia, fundamentosConstitucionales, tipoProcedimiento }
- parteDemandada: { nombre, cedula, direccion }
- parteDemandante: { entidad, ruc, domicilio, email, representantes }
- pretensiones: [array de strings]

Ejemplos:
- Consulta: "Estado del crédito 1037273"
  Respuesta: {
    "filters": {"detallesCredito.numeroCredito": "1037273"},
    "requiredFields": ["detallesCredito.estado"]
  }

- Consulta: "Casos de la Cooperativa Jardín Azuayo"
  Respuesta: {
    "filters": {"parteDemandante.entidad": "Cooperativa de Ahorro y Crédito Jardín Azuayo Ltda."},
    "requiredFields": ["informacionGeneral.tipoDocumento", "detallesCredito"]
  }

Responde SOLO con el JSON válido sin comentarios.
`;

const FORMAT_PROMPT = `
Eres un asistente legal experto. Formatea la información del siguiente documento legal para que sea fácil de leer y entender por usuarios no técnicos.

Información:
{data}

Reglas de formato:
1. No uses nombres técnicos de campos como "detallesCredito" o "informacionProcesal"
2. Agrupa la información de manera lógica y ordenada
3. Usa emojis relevantes
4. Destaca información importante
5. Usa lenguaje claro y directo
6. Mantén el formato WhatsApp (usa * para negritas)

Ejemplo de formato deseado:
📄 *Información del Crédito*
• Monto: $10,000
• Cuota mensual: $500
• Estado: Activo

👤 *Información del Cliente*
• Nombre: Juan Pérez
• Cédula: 1234567890

Responde SOLO con el texto formateado, sin explicaciones adicionales.
`;

async function buildQueryFromText(userQuery) {
  try {
    const { response } = await model.generateContent(SEARCH_PROMPT + "\nConsulta: " + userQuery);
    const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error('Error parsing response:', error);
    return null;
  }
}

function getNestedValue(obj, path) {
  const keys = path.split('.');
  let value = obj;
  
  for (const key of keys) {
    if (value === undefined || value === null) return undefined;
    value = value[key];
  }
  
  return value;
}

async function formatResults(results) {
  try {
    const { response } = await model.generateContent(
      FORMAT_PROMPT.replace('{data}', JSON.stringify(results, null, 2))
    );
    return response.text().trim();
  } catch (error) {
    console.error('Error formatting results:', error);
    return JSON.stringify(results, null, 2);
  }
}

async function executeFirebaseQuery(userId, searchParams) {
  try {
    const userDocRef = doc(db, "users", userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      throw new Error("Usuario no encontrado");
    }

    const documentos = userDoc.data().documentos;

    const filteredDocs = documentos.filter(doc => 
      Object.entries(searchParams.filters).every(([field, value]) => {
        const fieldValue = getNestedValue(doc, field);
        return fieldValue === value;
      })
    );

    return filteredDocs.map(doc => {
      const result = {};
      for (const field of searchParams.requiredFields) {
        result[field] = getNestedValue(doc, field);
      }
      return result;
    });
  } catch (error) {
    console.error('Query error:', error);
    return [];
  }
}

const legalFlow = addKeyword(['consultar', 'buscar', 'información'])
  .addAnswer('🔍 *Asistente Legal* \nIngrese su consulta:', { capture: true }, 
    async (ctx, { flowDynamic }) => {
      const userId = ctx.from;
      
      const searchParams = await buildQueryFromText(ctx.body);
      if (!searchParams) return flowDynamic('❌ No entendí la consulta. Reformule por favor.');
      
      const results = await executeFirebaseQuery(userId, searchParams);
      if (!results.length) return flowDynamic('❌ No se encontraron resultados.');
      
      const formatted = await formatResults(results);

      await flowDynamic([
        formatted,
        '\n¿Necesita otra consulta? Escriba *consultar*'
      ]);
    }
  );

export { legalFlow };