#!/bin/bash

# === Initialisation du projet React avec Vite ===
npm create vite@latest frontend -- --template react
cd frontend

# === Installation des dépendances utiles ===
npm install react-icons axios react-router-dom

# === Nettoyage des fichiers Tailwind ===
rm -f postcss.config.* tailwind.config.js

# === Création de l’arborescence ===
mkdir -p src/{api,auth,components,context,pages}

# === Fichier CSS de base ===
cat <<EOF > src/index.css
body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 0;
  background: #f9f9f9;
}
nav {
  background: #0077cc;
  color: white;
  padding: 10px 20px;
  display: flex;
  justify-content: space-between;
}
a {
  color: white;
  margin: 0 10px;
  text-decoration: none;
}
button {
  background: none;
  border: none;
  color: white;
}
EOF

# === Fichier API (Axios config) ===
cat <<EOF > src/api/api.js
import axios from 'axios';
const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  withCredentials: true,
});
export default api;
EOF

# === AuthContext.jsx ===
cat <<EOF > src/context/AuthContext.jsx
import { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetch('http://localhost:5000/api/me', {
        headers: { Authorization: \`Bearer \${token}\` }
      })
      .then(res => res.json())
      .then(data => setUser(data))
      .catch(() => localStorage.removeItem('token'));
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};
EOF

# === ProtectedRoute.jsx ===
cat <<EOF > src/auth/ProtectedRoute.jsx
import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children }) => {
  const { user } = useContext(AuthContext);
  return user ? children : <Navigate to="/login" />;
};
export default ProtectedRoute;
EOF

# === Navbar.jsx ===
cat <<EOF > src/components/Navbar.jsx
import { Link } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { FiLogOut, FiUserPlus, FiLogIn, FiHome } from "react-icons/fi";

const Navbar = () => {
  const { user, setUser } = useContext(AuthContext);

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <nav>
      <Link to="/">🪙 TontineApp</Link>
      <div>
        <Link to="/"><FiHome /> Accueil</Link>
        {user ? (
          <>
            <Link to="/dashboard">Dashboard</Link>
            <button onClick={logout}><FiLogOut /> Déconnexion</button>
          </>
        ) : (
          <>
            <Link to="/login"><FiLogIn /> Connexion</Link>
            <Link to="/register"><FiUserPlus /> Inscription</Link>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
EOF

# === Pages vides ===
touch src/pages/{Home.jsx,Register.jsx,Login.jsx,Dashboard.jsx,TontineCreate.jsx,TontineDetail.jsx}
echo "const Home = () => <h1>Accueil</h1>; export default Home;" > src/pages/Home.jsx

# === App.jsx ===
cat <<EOF > src/App.jsx
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import TontineCreate from "./pages/TontineCreate";
import TontineDetail from "./pages/TontineDetail";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/tontines/create" element={<ProtectedRoute><TontineCreate /></ProtectedRoute>} />
          <Route path="/tontines/:id" element={<ProtectedRoute><TontineDetail /></ProtectedRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};
export default App;
EOF

# === main.jsx ===
cat <<EOF > src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
EOF

echo "✅ Structure créée sans Tailwind. Tu peux lancer avec : npm run dev"
