import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCIhu02MH7u5Scs5s0Yt5HBVSh8PeGl0O0",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "warehouse-240bc.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "warehouse-240bc",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "warehouse-240bc.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "961299207595",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:961299207595:web:5666599046e170d6376eee",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-ZBPJD64X4B"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
