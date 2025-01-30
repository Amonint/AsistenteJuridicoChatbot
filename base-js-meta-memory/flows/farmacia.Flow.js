import { addKeyword } from '@builderbot/bot';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const NUMBER_ID = process.env.NUMBER_ID;
const JWT_TOKEN = process.env.JWT_TOKEN;

// Función para obtener farmacias cercanas
const getNearbyPharmacies = async (latitude, longitude) => {
    console.log('[getNearbyPharmacies] Datos recibidos:', { latitude, longitude, types: { latitude: typeof latitude, longitude: typeof longitude } });

    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
    const params = {
        location: `${latitude},${longitude}`,
        // Removemos radius ya que estamos usando rankby=distance
        type: 'pharmacy',
        keyword: 'farmacia',
        opennow: true, 
        language: 'es',
        key: GOOGLE_API_KEY,
        rankby: 'distance'  // Esto ordenará los resultados por distancia
    };

    try {
        const response = await axios.get(url, { params });
        console.log('[getNearbyPharmacies] Respuesta de Google Places API:', response.data);

        const results = response.data.results.slice(0, 3);
        return results.map((place) => ({
            name: place.name,
            address: place.vicinity,
            location: place.geometry.location,
            type: 'pharmacy'
        }));
    } catch (error) {
        console.error('[getNearbyPharmacies] Error al llamar a Google Places API:', error);
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
const flowFarmacia = addKeyword(['farmacia', 'farmacias'])
    .addAnswer(
        [
            '🏥 ¡Hola! Para ayudarte a encontrar farmacias cercanas, necesito tu ubicación.',
            '📍 Por favor, comparte tu ubicación usando el clip y seleccionando "Ubicación"'
        ],
        { capture: true },
        async (ctx, { flowDynamic }) => {
            console.log('[flowFarmacia] Datos del contexto:', { ctx, types: { latitude: typeof ctx.latitude, longitude: typeof ctx.longitude, from: typeof ctx.from } });

            if (ctx.type === 'location' && ctx.latitude && ctx.longitude) {
                console.log('[flowFarmacia] Ubicación recibida:', { latitude: ctx.latitude, longitude: ctx.longitude });
                await flowDynamic('🔍 Buscando farmacias cercanas...');

                try {
                    const pharmacies = await getNearbyPharmacies(ctx.latitude, ctx.longitude);

                    if (pharmacies.length === 0) {
                        console.log('[flowFarmacia] No se encontraron farmacias cercanas.');
                        await flowDynamic('❌ No se encontraron farmacias cercanas. Intenta de nuevo más tarde.');
                        return;
                    }

                    for (const pharmacy of pharmacies) {
                        const location = {
                            lat: pharmacy.location.lat,
                            lng: pharmacy.location.lng,
                            name: pharmacy.name,
                            address: pharmacy.address,
                        };
                        console.log('[flowFarmacia] Enviando ubicación de farmacia:', location);
                        await sendLocationToWhatsApp(ctx.from, location);
                        await flowDynamic(`🏥 ${pharmacy.name}\n📍 ${pharmacy.address}`);
                    }

                    console.log('[flowFarmacia] Farmacias cercanas enviadas con éxito.');
                    await flowDynamic('✅ Te he enviado las ubicaciones de las farmacias más cercanas.');
                } catch (error) {
                    console.error('[flowFarmacia] Error completo:', error);
                    await flowDynamic('❌ Error al procesar la ubicación. Por favor, escribe "farmacia" nuevamente.');
                }
            } else if (ctx.body === 'farmacia' || ctx.body === 'farmacias') {
                console.log('[flowFarmacia] Activación inicial del flujo, esperando ubicación.');
                return;
            } else {
                console.log('[flowFarmacia] Contexto no válido, solicitando ubicación nuevamente.');
                await flowDynamic('❌ Por favor, envía tu ubicación usando el clip 📎 y seleccionando "Ubicación"');
            }
        }
    );

export { flowFarmacia };
