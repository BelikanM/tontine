import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) return <p>Chargement de la session...</p>;

  return user ? children : <Navigate to="/login" />;
};

export default ProtectedRoute;
