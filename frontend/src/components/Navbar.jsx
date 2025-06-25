import { Link, useLocation } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import {
  FiHome,
  FiLogIn,
  FiUserPlus,
  FiLogOut,
  FiUsers,
  FiPlusCircle
} from "react-icons/fi";

const Navbar = () => {
  const { user, setUser } = useContext(AuthContext);
  const location = useLocation();

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
            <button onClick={logout} style={{ ...iconStyle(), background: "none", border: "none" }}>
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
