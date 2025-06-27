import React, { useEffect, useState } from "react";

const InstallButton = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installable, setInstallable] = useState(false);

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

  return (
    installable && (
      <button onClick={handleInstallClick} style={styles}>
        Installer l'application
      </button>
    )
  );
};

const styles = {
  padding: "10px 20px",
  fontSize: "16px",
  backgroundColor: "#42b883",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
};

export default InstallButton;
