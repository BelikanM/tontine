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
