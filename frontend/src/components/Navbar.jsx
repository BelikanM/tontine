import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import {
  FiHome,
  FiLogIn,
  FiUserPlus,
  FiLogOut,
  FiUsers,
  FiPlusCircle,
  FiDownload
} from "react-icons/fi";

const Navbar = () => {
  const { user, setUser } = useContext(AuthContext);
  const location = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installable, setInstallable] = useState(false);

  // Gestion de l'événement d'installation PWA
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      console.log("App installée !");
    }
    setDeferredPrompt(null);
    setInstallable(false);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  const iconStyle = (path) => ({
    fontSize: "22px",
    color: location.pathname === path ? "#25D366" : "#555",
    margin: "0 10px",
    cursor: "pointer",
  });

  return (
    <nav style={navStyle}>
      <div style={containerStyle}>
        <Link to="/" style={iconStyle("/")}>
          <FiHome />
        </Link>

        {user ? (
          <>
            <Link to="/dashboard" style={iconStyle("/dashboard")}>
              <FiUsers />
            </Link>
            <Link to="/tontines/create" style={iconStyle("/tontines/create")}>
              <FiPlusCircle />
            </Link>
            {installable && (
              <button
                onClick={handleInstallClick}
                title="Installer l'application"
                style={{ ...iconStyle(), background: "none", border: "none" }}
              >
                <FiDownload />
              </button>
            )}
            <button
              onClick={logout}
              style={{ ...iconStyle(), background: "none", border: "none" }}
            >
              <FiLogOut />
            </button>
          </>
        ) : (
          <>
            <Link to="/login" style={iconStyle("/login")}>
              <FiLogIn />
            </Link>
            <Link to="/register" style={iconStyle("/register")}>
              <FiUserPlus />
            </Link>
          </>
        )}
      </div>
    </nav>
  );
};

const navStyle = {
  position: "sticky",
  top: 0,
  background: "rgba(255, 255, 255, 0.9)",
  backdropFilter: "blur(8px)",
  boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
  padding: "10px 0",
  zIndex: 1000,
};

const containerStyle = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

export default Navbar;
