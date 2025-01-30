import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth"; // Faltaba importar getAuth

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDfLe_BqaJ45xJeE08yjLsuYh3_-FPRfbY",
    authDomain: "asistentejuridico-90176.firebaseapp.com",
    projectId: "asistentejuridico-90176",
    storageBucket: "asistentejuridico-90176.appspot.com", // 🔥 Corregí el dominio de storage
    messagingSenderId: "495048449457",
    appId: "1:495048449457:web:3e903f0184d1db72ea3190",
    measurementId: "G-SXQCERQLYB"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Exportar Firebase
export { auth, db, storage };