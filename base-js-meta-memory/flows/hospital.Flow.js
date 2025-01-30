import { addKeyword } from '@builderbot/bot';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const NUMBER_ID = process.env.NUMBER_ID;
const JWT_TOKEN = process.env.JWT_TOKEN;

// Función para obtener hospitales cercanos
const getNearbyHospitals = async (latitude, longitude) => {
    console.log('[getNearbyHospitals] Datos recibidos:', { latitude, longitude, types: { latitude: typeof latitude, longitude: typeof longitude } });

    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
    const params = {
        location: `${latitude},${longitude}`,
        type: 'hospital',
        keyword: 'hospital',
        opennow: true, 
        language: 'es',
        key: GOOGLE_API_KEY,
        rankby: 'distance' 
    };

    try {
        const response = await axios.get(url, { params });
        console.log('[getNearbyHospitals] Respuesta de Google Places API:', response.data);

        const results = response.data.results.slice(0, 3);
        return results.map((place) => ({
            name: place.name,
            address: place.vicinity,
            location: place.geometry.location,
            type: 'hospital',
        }));
    } catch (error) {
        console.error('[getNearbyHospitals] Error al llamar a Google Places API:', error);
        return [];
    }
};

// Función para enviar ubicación a través de WhatsApp API
const sendLocationToWhatsApp = async (phoneNumber, location) => {
    console.log('[sendLocationToWhatsApp] Datos recibidos:', { phoneNumber, location, types: { phoneNumber: typeof phoneNumber, location: typeof location } });

    const url = `https://graph.facebook.com/v21.0/${NUMBER_ID}/messages`;
    const data = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'location',
        location: {
            latitude: location.lat,
            longitude: location.lng,
            name: location.name,
            address: location.address,
        },
    };

    try {
        const response = await axios.post(url, data, {
            headers: {
                Authorization: `Bearer ${JWT_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });
        console.log('[sendLocationToWhatsApp] Ubicación enviada exitosamente:', response.data);
    } catch (error) {
        console.error('[sendLocationToWhatsApp] Error al enviar ubicación a WhatsApp:', error.response?.data || error.message);
    }
};

// Flow principal
const flowHospital = addKeyword(['hospital', 'hospitales'])
    .addAnswer(
        [
            '🏥 ¡Hola! Para ayudarte a encontrar hospitales cercanos, necesito tu ubicación.',
            '📍 Por favor, comparte tu ubicación usando el clip y seleccionando "Ubicación"'
        ],
        { capture: true },
        async (ctx, { flowDynamic }) => {
            console.log('[flowHospital] Datos del contexto:', { ctx, types: { latitude: typeof ctx.latitude, longitude: typeof ctx.longitude, from: typeof ctx.from } });

            if (ctx.type === 'location' && ctx.latitude && ctx.longitude) {
                console.log('[flowHospital] Ubicación recibida:', { latitude: ctx.latitude, longitude: ctx.longitude });
                await flowDynamic('🔍 Buscando hospitales cercanos...');

                try {
                    const hospitals = await getNearbyHospitals(ctx.latitude, ctx.longitude);

                    if (hospitals.length === 0) {
                        console.log('[flowHospital] No se encontraron hospitales cercanos.');
                        await flowDynamic('❌ No se encontraron hospitales cercanos. Intenta de nuevo más tarde.');
                        return;
                    }

                    for (const hospital of hospitals) {
                        const location = {
                            lat: hospital.location.lat,
                            lng: hospital.location.lng,
                            name: hospital.name,
                            address: hospital.address,
                        };
                        console.log('[flowHospital] Enviando ubicación de hospital:', location);
                        await sendLocationToWhatsApp(ctx.from, location);
                        await flowDynamic(`🏥 ${hospital.name}\n📍 ${hospital.address}`);
                    }

                    console.log('[flowHospital] Hospitales cercanos enviados con éxito.');
                    await flowDynamic('✅ Te he enviado las ubicaciones de los hospitales más cercanos.');
                } catch (error) {
                    console.error('[flowHospital] Error completo:', error);
                    await flowDynamic('❌ Error al procesar la ubicación. Por favor, escribe "hospital" nuevamente.');
                }
            } else if (ctx.body === 'hospital' || ctx.body === 'hospitales') {
                console.log('[flowHospital] Activación inicial del flujo, esperando ubicación.');
                return;
            } else {
                console.log('[flowHospital] Contexto no válido, solicitando ubicación nuevamente.');
                await flowDynamic('❌ Por favor, envía tu ubicación usando el clip 📎 y seleccionando "Ubicación"');
            }
        }
    );

export { flowHospital };
