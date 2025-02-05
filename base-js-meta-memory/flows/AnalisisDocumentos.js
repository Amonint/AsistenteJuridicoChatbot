import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { addKeyword, EVENTS } from "@builderbot/bot";
import dotenv from "dotenv";
dotenv.config();
import { db } from "../db/db.js"; // Asegúrate de que el path sea correcto
import { doc, setDoc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODEL_CONFIG = {
  temperature: 0.2,

  top_p: 1,

  top_k: 32,

  max_output_tokens: 4096,
};

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",

  generationConfig: MODEL_CONFIG,
});

const saveDocumentToFirebase = async (userId, documentData) => {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      // Si el usuario no existe, crear un nuevo documento con el array de documentos
      await setDoc(userRef, {
        documentos: [documentData], // Guarda el primer documento en un array
      });
    } else {
      // Si el usuario ya existe, agregar el nuevo documento al array de documentos
      await updateDoc(userRef, {
        documentos: arrayUnion(documentData), // Agrega al array sin sobrescribir
      });
    }

    console.log("Guardado en Firebase:");
    return true;
  } catch (error) {
    console.error("❌ Error guardando en Firebase:", error);
    throw error;
  }
};

const structureDocumentData = (analysisText) => {
  try {
    const jsonStart = analysisText.indexOf('{');
    const jsonEnd = analysisText.lastIndexOf('}') + 1;
    const jsonString = analysisText.slice(jsonStart, jsonEnd);
    const analysisData = JSON.parse(jsonString);

    return {
      fechaAnalisis: new Date().toISOString(),
      ...analysisData,
      
    };
  } catch (error) {
    console.error("Error parseando JSON de Gemini:", error);
    return {
      fechaAnalisis: new Date().toISOString(),
      
    };
  }
};
const LEGAL_ANALYSIS_PROMPT = `
Analiza este documento legal y genera un JSON estrictamente con esta estructura:

{
  "informacionGeneral": {
    "tipoDocumento": "Demanda de cobro ejecutivo",
    "jurisdiccion": "Ecuador"
  },
  "parteDemandante": {
    "entidad": "Cooperativa de Ahorro y Crédito Jardín Azuayo Ltda.",
    "ruc": "[Extraer RUC]",
    "domicilio": "[Extraer dirección]",
    "email": "[Extraer email]",
    "representantes": {
      "gerente": {"nombre": "Eco. Juan Martínez"},
      "procuradorPrincipal": {"nombre": "Abg. Stalin Donato Quezada Calderón"},
      "otrosProcuradores": ["Dr. Jorge Alberto Delgado Altamirano", "Abg. Carmen Lucía Carrasco Espinoza"]
    }
  },
  "parteDemandada": {
    "nombre": "Leonardo Yaguache y Magaly Alvarado",
    "cedula": "[Extraer cédulas]",
    "direccion": "[Extraer dirección demandados]"
  },
  "detallesCredito": {
    "numeroPagare": "7719",
    "numeroCredito": "[Extraer número crédito]",
    "fechaEmision": "2023-03-28",
    "montoOriginal": 10000,
    "tasaInteres": [valor numérico],
    "estado": "En mora desde dividendo 8",
    "montoAdeudado": 9127.51
  },
  "pretensiones": [
    "Pago de USD 10,000.00",
    "Intereses devengados y por devengar",
    "Costas procesales",
    "Honorarios profesionales"
  ],
  "informacionProcesal": {
    "tipoProcedimiento": "Ejecutivo",
    "cuantia": 10500,
    "baseLegal": "Arts. 347, 348, 349 COGEP",
    "fundamentosConstitucionales": ["Art. 75 CE", "Art. 76 CE", "Art. 82 CE"]
  }
}

Responde SOLO con el JSON válido, sin texto adicional.
`;
const sendImageToGemini = async (imagePath, userId) => {
  try {
    const imgBuffer = fs.readFileSync(imagePath);

    const base64Image = imgBuffer.toString("base64");

    fs.unlinkSync(imagePath);

    const result = await model.generateContent([
      LEGAL_ANALYSIS_PROMPT,

      {
        inlineData: {
          data: base64Image,

          mimeType: "image/jpeg",
        },
      },
    ]);

    const analysisText = result.response.text();

    if (!analysisText) {
      return "❌ No pude leer claramente la imagen. ¿Podrías enviarla nuevamente?";
    }

    const documentData = structureDocumentData(analysisText);

    await saveDocumentToFirebase(userId, documentData);

    return analysisText;
  } catch (error) {
    console.error("Error procesando imagen:", error);

    throw error;
  }
};

const analyzePDF = async (filePath, userId) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);

    const base64PDF = fileBuffer.toString("base64");

    fs.unlinkSync(filePath);

    const result = await model.generateContent([
      LEGAL_ANALYSIS_PROMPT,

      {
        inlineData: {
          data: base64PDF,

          mimeType: "application/pdf",
        },
      },
    ]);

    const analysisText = result.response.text();

    const documentData = structureDocumentData(analysisText);

    await saveDocumentToFirebase(userId, documentData);

    return analysisText;
  } catch (error) {
    console.error("Error procesando PDF:", error);

    throw error;
  }
};

const mediaFlow = addKeyword(EVENTS.MEDIA).addAnswer(
  "🔍 Analizando documento legal...",

  null,

  async (ctx, { flowDynamic, provider }) => {
    try {
      const tmpDir = path.join(process.cwd(), "tmp");

      fs.mkdirSync(tmpDir, { recursive: true });

      const filePath = await provider.saveFile(ctx, { path: tmpDir });

      if (!filePath) throw new Error("Error guardando imagen");

      const userId = ctx.from || "default-user";

      const analysis = await sendImageToGemini(filePath, userId);

      await flowDynamic([
        {
          body:
            analysis +
            "\n\n✅ Documento guardado exitosamente en tu historial.",
        },
      ]);
    } catch (error) {
      console.error("Error:", error);

      await flowDynamic(
        "❌ No pude procesar el documento. ¿Podrías intentar nuevamente?"
      );
    }
  }
);

const documentFlow = addKeyword(EVENTS.DOCUMENT).addAnswer(
  "📄 Analizando documento legal...",

  null,

  async (ctx, { flowDynamic, provider }) => {
    try {
      const tmpDir = path.join(process.cwd(), "tmp");

      fs.mkdirSync(tmpDir, { recursive: true });

      const filePath = await provider.saveFile(ctx, { path: tmpDir });

      if (!filePath.toLowerCase().endsWith(".pdf")) {
        await flowDynamic("❌ Por favor, envía un documento en formato PDF.");

        return;
      }

      const userId = ctx.from || "default-user";

      const analysis = await analyzePDF(filePath, userId);

      await flowDynamic([
        {
          body:
            analysis +
            "\n\n✅ Documento guardado exitosamente en tu historial.",
        },
      ]);
    } catch (error) {
      console.error("Error:", error);

      await flowDynamic(
        "❌ No pude procesar el documento. ¿Podrías intentar nuevamente?"
      );
    }
  }
);

export { mediaFlow, documentFlow };
