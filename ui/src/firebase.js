import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCIhu02MH7u5Scs5s0Yt5HBVSh8PeGl0O0",
  authDomain: "warehouse-240bc.firebaseapp.com",
  projectId: "warehouse-240bc",
  storageBucket: "warehouse-240bc.firebasestorage.app",
  messagingSenderId: "961299207595",
  appId: "1:961299207595:web:5666599046e170d6376eee",
  measurementId: "G-ZBPJD64X4B"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
