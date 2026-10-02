import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import { saveToken, saveUserData } from './authStorage';

interface AuthScreenProps {
  apiUrl: string;
  onLoginSuccess: (user: { id: number; name: string }) => void;
}

export default function AuthScreen({ apiUrl, onLoginSuccess }: AuthScreenProps) {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password || (!isLoginMode && !name)) {
      Alert.alert('Błąd', 'Uzupełnij wszystkie wymagane pola');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
      const payload = isLoginMode
        ? { email, password }
        : { name, email, password };

      const response = await axios.post(`${apiUrl}${endpoint}`, payload);
      const { access_token, user_id, name: userName } = response.data;

      await saveToken(access_token);
      await saveUserData({ id: user_id, name: userName });

      onLoginSuccess({ id: user_id, name: userName });
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Wystąpił błąd autoryzacji';
      Alert.alert('Błąd', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SettleUp</Text>
      <Text style={styles.subtitle}>
        {isLoginMode ? 'Zaloguj się do swojego konta' : 'Załóż nowe konto'}
      </Text>

      <View style={styles.card}>
        {!isLoginMode && (
          <TextInput
            style={styles.input}
            placeholder="Twoje imię"
            placeholderTextColor="#64748b"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Adres e-mail"
          placeholderTextColor="#64748b"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Hasło"
          placeholderTextColor="#64748b"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={styles.mainButton}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.mainButtonText}>
              {isLoginMode ? 'Zaloguj się' : 'Zarejestruj'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => setIsLoginMode(!isLoginMode)}
        >
          <Text style={styles.switchButtonText}>
            {isLoginMode
              ? 'Nie masz jeszcze konta? Zarejestruj się'
              : 'Masz już konto? Zaloguj się'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#f8fafc',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#1e293b',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  input: {
    backgroundColor: '#334155',
    color: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    fontSize: 15,
  },
  mainButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  mainButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  switchButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchButtonText: {
    color: '#38bdf8',
    fontSize: 13,
  },
});