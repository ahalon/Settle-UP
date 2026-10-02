import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import axios from 'axios';
import AuthScreen from './LoginScreen';
import { getToken, removeToken, getUserData } from './authStorage';

const API_URL = 'http://192.168.1.242:8000';

interface User {
  id: number;
  name: string;
  email: string;
}

interface Expense {
  id: number;
  title: string;
  amount: number;
  payer_id: number;
  created_at: string;
}

interface Balance {
  user_a_id: number;
  user_b_id: number;
  net_balance: number;
  summary: string;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const [users, setUsers] = useState<User[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedPayerId, setSelectedPayerId] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const storedToken = await getToken();
        const storedUser = await getUserData();
        if (storedToken && storedUser) {
          setToken(storedToken);
          setCurrentUser(storedUser);
          setSelectedPayerId(storedUser.id);
        }
      } catch (e) {
        console.log('Błąd odczytu sesji', e);
      } finally {
        setIsInitializing(false);
      }
    };
    checkAuth();
  }, []);

  const loadData = async (authToken: string) => {
    try {
      const authHeaders = {
        headers: { Authorization: `Bearer ${authToken}` },
      };

      const usersRes = await axios.get<User[]>(`${API_URL}/api/users`, authHeaders);
      setUsers(usersRes.data);

      if (usersRes.data.length >= 2) {
        const uA = usersRes.data[0].id;
        const uB = usersRes.data[1].id;

        const balanceRes = await axios.get<Balance>(`${API_URL}/api/balance`, {
          params: { user_a_id: uA, user_b_id: uB },
          ...authHeaders,
        });
        setBalance(balanceRes.data);
      }

      const expensesRes = await axios.get<Expense[]>(`${API_URL}/api/expenses`, authHeaders);
      setExpenses(expensesRes.data);
    } catch (err) {
      console.log('Błąd pobierania danych:', err);
    }
  };

  useEffect(() => {
    if (token) {
      loadData(token);
    }
  }, [token]);

  const handleLogout = async () => {
    await removeToken();
    setToken(null);
    setCurrentUser(null);
  };

  const handleAddExpense = async () => {
    if (!title || !amount || !selectedPayerId || !token) {
      Alert.alert('Błąd', 'Uzupełnij tytuł, kwotę i wybierz płatnika!');
      return;
    }

    setLoading(true);
    try {
      const amountInCents = Math.round(parseFloat(amount.replace(',', '.')) * 100);

      await axios.post(
        `${API_URL}/api/expenses`,
        {
          title,
          amount: amountInCents,
          payer_id: selectedPayerId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setTitle('');
      setAmount('');
      await loadData(token);
    } catch (err) {
      Alert.alert('Błąd', 'Nie udało się zapisać wydatku');
    } finally {
      setLoading(false);
    }
  };

  if (isInitializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  if (!token) {
    return (
      <AuthScreen
        apiUrl={API_URL}
        onLoginSuccess={async (userData) => {
          const freshToken = await getToken();
          setToken(freshToken);
          setCurrentUser(userData);
          setSelectedPayerId(userData.id);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.userBar}>
        <Text style={styles.userGreeting}>Cześć, {currentUser?.name}!</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutBtnText}>Wyloguj</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.headerBox}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Aktualny stan:</Text>
          <Text style={styles.balanceValue}>
            {balance ? balance.summary : 'Brak danych o rozliczeniu'}
          </Text>
        </View>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Dodaj wydatek</Text>

        <View style={styles.payerSelector}>
          {users.map((u) => (
            <TouchableOpacity
              key={u.id}
              style={[
                styles.payerOption,
                selectedPayerId === u.id && styles.payerOptionActive,
              ]}
              onPress={() => setSelectedPayerId(u.id)}
            >
              <Text
                style={[
                  styles.payerOptionText,
                  selectedPayerId === u.id && styles.payerOptionTextActive,
                ]}
              >
                {u.id === currentUser?.id ? 'Ja' : u.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Tytuł wydatku"
          placeholderTextColor="#64748b"
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={styles.input}
          placeholder="Kwota (PLN)"
          placeholderTextColor="#64748b"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />

        <TouchableOpacity
          style={styles.addBtn}
          onPress={handleAddExpense}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.addBtnText}>Dodaj wydatek</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Ostatnie wydatki</Text>
        <FlatList
          data={expenses}
          keyExtractor={(item) => item.id.toString()}
          onRefresh={async () => {
            setRefreshing(true);
            await loadData(token);
            setRefreshing(false);
          }}
          refreshing={refreshing}
          renderItem={({ item }) => (
            <View style={styles.expenseItem}>
              <View>
                <Text style={styles.expenseTitle}>{item.title}</Text>
                <Text style={styles.expenseSub}>ID płatnika: {item.payer_id}</Text>
              </View>
              <Text style={styles.expenseAmount}>
                {(item.amount / 100).toFixed(2)} PLN
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Brak zarejestrowanych wydatków</Text>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  userGreeting: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  logoutBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#334155',
    borderRadius: 6,
  },
  logoutBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  headerBox: {
    marginBottom: 14,
  },
  balanceCard: {
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  balanceLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  balanceValue: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  formCard: {
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 10,
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  payerSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  payerOption: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  payerOptionActive: {
    backgroundColor: '#2563eb',
  },
  payerOptionText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  payerOptionTextActive: {
    color: '#ffffff',
  },
  input: {
    backgroundColor: '#334155',
    color: '#f8fafc',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    fontSize: 14,
  },
  addBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  addBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  listContainer: {
    flex: 1,
  },
  expenseItem: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  expenseTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  expenseSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  expenseAmount: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 13,
  },
});