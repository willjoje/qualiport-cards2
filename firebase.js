// Importa as funções necessárias do SDK do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

// Configuração do Firebase do seu projeto
const firebaseConfig = {
  apiKey: "AIzaSyD9RsS-GRwWwidF0S2d8oIMiOglVrIjCX4",
  authDomain: "qualiport-cards-555be.firebaseapp.com",
  projectId: "qualiport-cards-555be",
  storageBucket: "qualiport-cards-555be.firebasestorage.app",
  messagingSenderId: "201745679062",
  appId: "1:201745679062:web:c16f02a046db6e5a977f77"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth };
