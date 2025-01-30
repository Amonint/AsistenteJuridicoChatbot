import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
dotenv.config();

const geminiApiKey = process.env.GEMINI_API_KEY;

const chat = async (prompt, messages) => {
    try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // Concatenate prompt and messages into a single string
        const fullPrompt = `${prompt}\n\nContext:\n${messages.map(m => 
            `${m.role}: ${m.content}`).join('\n')}`;
        
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        return response.text();
    } catch (err) {
        console.error("Error al conectar con Gemini:", err);
        throw err; // Propagar el error para mejor manejo
    }
};

export { chat };
