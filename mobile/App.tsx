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
  ScrollView,
  Platform,
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

interface Group {
  id: number;
  name: string;
  join_code: string;
  members: User[];
}

interface Expense {
  id: number;
  title: string;
  amount: number;
  payer_id: number;
  group_id: number;
  created_at: string;
}

interface BalanceResponse {
  summary: string;
  my_net_balance?: number;
  all_balances?: Record<string, number>;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Stan lobby
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // Stan wydatków wewnątrz wybranego lobby
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [selectedPayerId, setSelectedPayerId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Inicjalizacja sesji
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
        console.log('Błąd autoryzacji:', e);
      } finally {
        setIsInitializing(false);
      }
    };
    checkAuth();
  }, []);

  // Pobieranie listy lobby zalogowanego usera
  const loadMyGroups = async (authToken: string) => {
    try {
      const res = await axios.get<Group[]>(`${API_URL}/api/groups/my`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setMyGroups(res.data);
    } catch (err) {
      console.log('Błąd pobierania grup:', err);
    }
  };

  useEffect(() => {
    if (token) {
      loadMyGroups(token);
    }
  }, [token]);

  // Pobieranie danych konkretnego lobby (wydatki + bilans)
  const loadGroupDetails = async (groupId: number, authToken: string) => {
    try {
      const headers = { Authorization: `Bearer ${authToken}` };

      const [expRes, balRes] = await Promise.all([
        axios.get<Expense[]>(`${API_URL}/api/groups/${groupId}/expenses`, { headers }),
        axios.get<BalanceResponse>(`${API_URL}/api/groups/${groupId}/balance`, { headers }),
      ]);

      setExpenses(expRes.data);
      setBalance(balRes.data);
    } catch (err) {
      console.log('Błąd pobierania szczegółów grupy:', err);
    }
  };

  useEffect(() => {
    if (activeGroup && token) {
      loadGroupDetails(activeGroup.id, token);
      setSelectedPayerId(currentUser?.id || null);
    }
  }, [activeGroup]);

  const handleLogout = async () => {
    await removeToken();
    setToken(null);
    setCurrentUser(null);
    setActiveGroup(null);
  };

  // Tworzenie lobby
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !token) return;
    setLoading(true);
    try {
      const res = await axios.post<Group>(
        `${API_URL}/api/groups`,
        { name: newGroupName.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewGroupName('');
      await loadMyGroups(token);
      setActiveGroup(res.data);
    } catch (err: any) {
      Alert.alert('Błąd', err.response?.data?.detail || 'Nie udało się stworzyć grupy');
    } finally {
      setLoading(false);
    }
  };

  // Dołączanie do lobby po kodzie
  const handleJoinGroup = async () => {
    if (!joinCodeInput.trim() || !token) return;
    setLoading(true);
    try {
      const res = await axios.post<Group>(
        `${API_URL}/api/groups/join`,
        { join_code: joinCodeInput.trim().toUpperCase() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setJoinCodeInput('');
      await loadMyGroups(token);
      setActiveGroup(res.data);
    } catch (err: any) {
      Alert.alert('Błąd', err.response?.data?.detail || 'Nieprawidłowy kod');
    } finally {
      setLoading(false);
    }
  };

  // Dodawanie wydatku wewnątrz lobby
  const handleAddExpense = async () => {
    if (!title || !amount || !selectedPayerId || !activeGroup || !token) {
      Alert.alert('Błąd', 'Wypełnij wszystkie pola wydatku');
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
          group_id: activeGroup.id,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setTitle('');
      setAmount('');
      await loadGroupDetails(activeGroup.id, token);
    } catch (err: any) {
      Alert.alert('Błąd', err.response?.data?.detail || 'Błąd zapisu wydatku');
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
        onLoginSuccess={async (userData: { id: number; name: string }) => {
          const freshToken = await getToken();
          setToken(freshToken);
          setCurrentUser(userData);
          setSelectedPayerId(userData.id);
        }}
      />
    );
  }

  // Pomocnik do wyciągania imienia płatnika
  const getPayerName = (payerId: number) => {
    if (payerId === currentUser?.id) return 'Ty';
    const member = activeGroup?.members.find((m) => m.id === payerId);
    return member ? member.name : `ID: ${payerId}`;
  };

  // --- EKRAN 1: WIDOK WEWNĄTRZ LOBBY ---
  if (activeGroup) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => setActiveGroup(null)} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Wróć do lobby</Text>
          </TouchableOpacity>
          <Text style={styles.groupHeaderName}>{activeGroup.name}</Text>
        </View>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>KOD DOŁĄCZENIA DO TEGO LOBBY:</Text>
          <Text style={styles.codeValue}>{activeGroup.join_code}</Text>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Twój bilans w tej grupie:</Text>
          <Text style={styles.balanceValue}>{balance?.summary || 'Ładowanie...'}</Text>
        </View>

        {/* Formularz wydatku */}
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Dodaj wydatek</Text>

          <Text style={styles.subLabel}>Kto zapłacił?</Text>
          <View style={styles.payerSelector}>
            {activeGroup.members.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.payerOption,
                  selectedPayerId === m.id && styles.payerOptionActive,
                ]}
                onPress={() => setSelectedPayerId(m.id)}
              >
                <Text
                  style={[
                    styles.payerOptionText,
                    selectedPayerId === m.id && styles.payerOptionTextActive,
                  ]}
                >
                  {m.id === currentUser?.id ? 'Ja' : m.name}
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
            style={styles.actionBtn}
            onPress={handleAddExpense}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>Zapisz wydatek</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Lista wydatków */}
        <View style={styles.listContainer}>
          <Text style={styles.sectionTitle}>Wydatki grupy</Text>
          <FlatList
            data={expenses}
            keyExtractor={(item) => item.id.toString()}
            onRefresh={async () => {
              setRefreshing(true);
              await loadGroupDetails(activeGroup.id, token);
              setRefreshing(false);
            }}
            refreshing={refreshing}
            renderItem={({ item }) => (
              <View style={styles.expenseItem}>
                <View>
                  <Text style={styles.expenseTitle}>{item.title}</Text>
                  <Text style={styles.expenseSub}>Płatnik: {getPayerName(item.payer_id)}</Text>
                </View>
                <Text style={styles.expenseAmount}>
                  {(item.amount / 100).toFixed(2)} PLN
                </Text>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Brak wydatków w tym lobby</Text>
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  // --- EKRAN 2: LISTA LOBBY (DASHBOARD) ---
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.userBar}>
        <Text style={styles.userGreeting}>Cześć, {currentUser?.name}!</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutBtnText}>Wyloguj</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Sekcja Tworzenia */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Utwórz nowe lobby</Text>
          <TextInput
            style={styles.input}
            placeholder="Nazwa (np. Mieszkanie Kraków)"
            placeholderTextColor="#64748b"
            value={newGroupName}
            onChangeText={setNewGroupName}
          />
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleCreateGroup}
            disabled={loading}
          >
            <Text style={styles.actionBtnText}>Stwórz lobby</Text>
          </TouchableOpacity>
        </View>

        {/* Sekcja Dołączania */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dołącz po kodzie</Text>
          <TextInput
            style={styles.input}
            placeholder="Wpisz 6-znakowy kod"
            placeholderTextColor="#64748b"
            autoCapitalize="characters"
            value={joinCodeInput}
            onChangeText={setJoinCodeInput}
          />
          <TouchableOpacity
            style={[styles.actionBtn, styles.secondaryBtn]}
            onPress={handleJoinGroup}
            disabled={loading}
          >
            <Text style={styles.actionBtnText}>Dołącz do ekipy</Text>
          </TouchableOpacity>
        </View>

        {/* Twoje lobby */}
        <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Twoje aktywne lobby</Text>
        {myGroups.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={styles.groupCard}
            onPress={() => setActiveGroup(g)}
          >
            <View>
              <Text style={styles.groupName}>{g.name}</Text>
              <Text style={styles.groupMembersCount}>
                Członków: {g.members?.length || 1} • Kod: {g.join_code}
              </Text>
            </View>
            <Text style={styles.groupArrow}>→</Text>
          </TouchableOpacity>
        ))}

        {myGroups.length === 0 && (
          <Text style={styles.emptyText}>Nie należysz jeszcze do żadnego lobby.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 10,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  userBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  userGreeting: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  logoutBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#334155',
    borderRadius: 6,
  },
  logoutBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
    gap: 12,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#334155',
    borderRadius: 6,
  },
  backBtnText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
  groupHeaderName: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  codeCard: {
    backgroundColor: '#1e293b',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#38bdf8',
    alignItems: 'center',
  },
  codeLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  codeValue: {
    color: '#38bdf8',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 2,
  },
  card: {
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  groupCard: {
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  groupName: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  groupMembersCount: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  groupArrow: {
    color: '#38bdf8',
    fontSize: 20,
    fontWeight: '700',
  },
  balanceCard: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  balanceLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  balanceValue: {
    color: '#38bdf8',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  formCard: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  subLabel: {
    color: '#94a3b8',
    fontSize: 11,
    marginBottom: 4,
  },
  payerSelector: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  payerOption: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  payerOptionActive: {
    backgroundColor: '#2563eb',
  },
  payerOptionText: {
    color: '#94a3b8',
    fontSize: 12,
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
  actionBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  secondaryBtn: {
    backgroundColor: '#0284c7',
  },
  actionBtnText: {
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
    marginBottom: 6,
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
    marginTop: 14,
    fontSize: 13,
  },
});