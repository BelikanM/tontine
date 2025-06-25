import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

const Notifications = ({ onAcceptInvitation }) => {
  const { user } = useContext(AuthContext);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const token = localStorage.getItem('token');

  const fetchInvitations = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/invitations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erreur de récupération des invitations');
      const data = await res.json();
      setInvitations(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAccept = async (invitationId) => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:5000/api/invitations/${invitationId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Erreur lors de l\'acceptation de l\'invitation');
      
      fetchInvitations();
      if (onAcceptInvitation) onAcceptInvitation();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, []);

  return (
    <div style={styles.container}>
      <h3>Notifications</h3>
      {error && <p style={styles.error}>{error}</p>}
      
      {invitations.length === 0 ? (
        <p>Aucune invitation en attente</p>
      ) : (
        <ul style={styles.list}>
          {invitations.map((inv) => (
            <li key={inv._id} style={styles.item}>
              <div>
                <strong>Invitation à {inv.tontine.name}</strong>
                <p>De: {inv.fromUser.name}</p>
              </div>
              <button
                onClick={() => handleAccept(inv._id)}
                style={styles.acceptButton}
                disabled={loading}
              >
                {loading ? 'Traitement...' : 'Accepter'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const styles = {
  container: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '15px',
    marginTop: '20px',
    backgroundColor: '#f9f9f9',
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #eee',
  },
  acceptButton: {
    padding: '5px 10px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#4CAF50',
    color: 'white',
    cursor: 'pointer',
  },
  error: {
    color: 'red',
    textAlign: 'center',
  },
};

export default Notifications;

