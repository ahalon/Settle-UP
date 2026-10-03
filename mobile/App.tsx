import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getToken, getUserData, removeToken } from './authStorage';
import AuthScreen from './src/screens/AuthScreen';
import GroupDetailScreen from './src/screens/GroupDetailScreen';
import LobbyListScreen from './src/screens/LobbyListScreen';
import { CurrentUser, Group } from './src/types';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([getToken(), getUserData()]);
        if (storedToken && storedUser) {
          setToken(storedToken);
          setCurrentUser(storedUser);
        }
      } finally {
        setIsInitializing(false);
      }
    };
    restoreSession();
  }, []);

  const handleLoginSuccess = async (user: CurrentUser) => {
    const storedToken = await getToken();
    setToken(storedToken);
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    await removeToken();
    setToken(null);
    setCurrentUser(null);
    setActiveGroup(null);
  };

  if (isInitializing) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#38bdf8" /></View>;
  }

  if (!token || !currentUser) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  if (activeGroup) {
    return <GroupDetailScreen token={token} currentUser={currentUser} group={activeGroup} onBack={() => setActiveGroup(null)} />;
  }

  return <LobbyListScreen token={token} currentUser={currentUser} onSelectGroup={setActiveGroup} onLogout={handleLogout} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
});
