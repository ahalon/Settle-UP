import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  StatusBar,
  ScrollView,
  Image,
} from 'react-native';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import AuthScreen from './LoginScreen';
import { getToken, removeToken, getUserData } from './authStorage';

const API_URL = 'http://192.168.1.69:8000';

function ElasticScrollView(props: React.ComponentProps<typeof ScrollView>) {
  return (
    <ScrollView
      {...props}
      alwaysBounceVertical
      bounces
      overScrollMode="always"
      scrollEventThrottle={16}
    />
  );
}

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
  balanceSummary?: string;
  balanceCents?: number;
}

interface Expense {
  id: number;
  title: string;
  amount: number;
  payer_id: number;
  group_id: number;
  created_at: string;
  description?: string | null;
  receipt_image?: string | null;
}

interface BalanceResponse {
  summary: string;
  my_net_balance?: number;
  all_balances?: Record<string, number>;
}

interface Transfer {
  id: number;
  group_id: number;
  sender_id: number;
  receiver_id: number;
  amount: number;
  status: 'pending' | 'confirmed' | 'rejected';
  created_at: string;
}

// Zabezpieczenie przed błędem "ReadableNativeArray to String"
const getErrorMessage = (err: any, fallback: string): string => {
  const detail = err.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => d.msg || JSON.stringify(d)).join('\n');
  }
  return fallback;
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Stan lobby
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [dashboardAction, setDashboardAction] = useState<'create' | 'join' | null>(null);

  // Stan wydatków wewnątrz lobby
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [selectedPayerId, setSelectedPayerId] = useState<number | null>(null);
  const [transferRecipientId, setTransferRecipientId] = useState<number | null>(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [activeLobbyTab, setActiveLobbyTab] = useState<'expenses' | 'transfers'>('expenses');
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(false);

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

  const loadMyGroups = async (authToken: string) => {
    try {
      const res = await axios.get<Group[]>(`${API_URL}/api/groups/my`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const headers = { Authorization: `Bearer ${authToken}` };
      const groupsWithBalances = await Promise.all(
        res.data.map(async (group) => {
          try {
            const balanceRes = await axios.get<BalanceResponse>(
              `${API_URL}/api/groups/${group.id}/balance`,
              { headers }
            );
            return {
              ...group,
              balanceSummary: balanceRes.data.summary,
              balanceCents: balanceRes.data.my_net_balance,
            };
          } catch {
            return group;
          }
        })
      );
      setMyGroups(groupsWithBalances);
    } catch (err) {
      console.log('Błąd pobierania grup:', err);
    }
  };

  useEffect(() => {
    if (token) {
      loadMyGroups(token);
    }
  }, [token]);

  const loadGroupDetails = async (groupId: number, authToken: string) => {
    try {
      const headers = { Authorization: `Bearer ${authToken}` };

      const [expRes, balRes, transferRes] = await Promise.all([
        axios.get<Expense[]>(`${API_URL}/api/groups/${groupId}/expenses`, { headers }),
        axios.get<BalanceResponse>(`${API_URL}/api/groups/${groupId}/balance`, { headers }),
        axios.get<Transfer[]>(`${API_URL}/api/groups/${groupId}/transfers`, { headers }),
      ]);

      setExpenses(expRes.data);
      setBalance(balRes.data);
      setTransfers(transferRes.data);
      const firstCreditor = activeGroup?.members.find(
        (member) => (balRes.data.all_balances?.[String(member.id)] || 0) > 0
      );
      setTransferRecipientId((current) => current || firstCreditor?.id || null);
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

  const getGroupBalanceStyle = (balanceCents?: number) => {
    if (balanceCents === undefined || balanceCents === 0) {
      return styles.groupCardNeutral;
    }
    return balanceCents < 0 ? styles.groupCardOwed : styles.groupCardDue;
  };

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
      Alert.alert('Błąd', getErrorMessage(err, 'Nie udało się stworzyć grupy'));
    } finally {
      setLoading(false);
    }
  };

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
      Alert.alert('Błąd', getErrorMessage(err, 'Nieprawidłowy kod'));
    } finally {
      setLoading(false);
    }
  };

  const pickReceiptImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Brak uprawnień', 'Potrzebujemy dostępu do galerii, aby dodać paragon.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setReceiptImage(result.assets[0].uri);
    }
  };

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
          description: description.trim() || null,
          receipt_image: receiptImage,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setTitle('');
      setDescription('');
      setAmount('');
      setReceiptImage(null);
      setIsExpenseFormOpen(false);
      await loadGroupDetails(activeGroup.id, token);
    } catch (err: any) {
      Alert.alert('Błąd', getErrorMessage(err, 'Błąd zapisu wydatku'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeclareTransfer = async () => {
    if (!activeGroup || !token || !transferRecipientId || !transferAmount) {
      Alert.alert('Błąd', 'Wybierz odbiorcę i wpisz kwotę przelewu');
      return;
    }

    const amountInCents = Math.round(parseFloat(transferAmount.replace(',', '.')) * 100);
    if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
      Alert.alert('Błąd', 'Wpisz poprawną kwotę przelewu');
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        `${API_URL}/api/groups/${activeGroup.id}/transfers`,
        { receiver_id: transferRecipientId, amount: amountInCents },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTransferAmount('');
      await loadGroupDetails(activeGroup.id, token);
      Alert.alert('Wysłano', 'Deklaracja przelewu czeka na potwierdzenie odbiorcy.');
    } catch (err: any) {
      Alert.alert('Błąd', getErrorMessage(err, 'Nie udało się zadeklarować przelewu'));
    } finally {
      setLoading(false);
    }
  };

  const handleTransferDecision = async (transferId: number, decision: 'confirm' | 'reject') => {
    if (!activeGroup || !token) return;

    setLoading(true);
    try {
      await axios.post(
        `${API_URL}/api/transfers/${transferId}/${decision}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await loadGroupDetails(activeGroup.id, token);
    } catch (err: any) {
      Alert.alert('Błąd', getErrorMessage(err, 'Nie udało się zmienić statusu przelewu'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTransfer = (transferId: number) => {
    Alert.alert(
      'Usuń deklarację',
      'Czy na pewno chcesz usunąć tę deklarację przelewu?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            if (!activeGroup || !token) return;
            setLoading(true);
            try {
              await axios.delete(`${API_URL}/api/transfers/${transferId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              await loadGroupDetails(activeGroup.id, token);
            } catch (err: any) {
              Alert.alert('Błąd', getErrorMessage(err, 'Nie udało się usunąć deklaracji'));
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteExpense = (expenseId: number) => {
    Alert.alert(
      'Usuń wydatek',
      'Czy na pewno chcesz usunąć ten wydatek?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            if (!token || !activeGroup) return;
            try {
              await axios.delete(`${API_URL}/api/expenses/${expenseId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              await loadGroupDetails(activeGroup.id, token);
            } catch (err: any) {
              Alert.alert('Błąd', getErrorMessage(err, 'Nie udało się usunąć wydatku'));
            }
          },
        },
      ]
    );
  };

  const getPayerName = (payerId: number) => {
    if (payerId === currentUser?.id) return 'Ty';
    const member = activeGroup?.members.find((m) => m.id === payerId);
    return member ? member.name : `ID: ${payerId}`;
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

  // --- EKRAN 1: WIDOK WEWNĄTRZ LOBBY ---
  if (activeGroup) {
    return (
      <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" />

          <ElasticScrollView
            style={styles.lobbyContentScroll}
            contentContainerStyle={styles.lobbyContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            alwaysBounceVertical
            bounces
            overScrollMode="always"
            scrollEnabled
            showsVerticalScrollIndicator
          >

          <View style={styles.navBar}>
            <TouchableOpacity onPress={() => setActiveGroup(null)} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Wróć</Text>
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

          <View style={styles.lobbyTabs}>
            <TouchableOpacity
              style={[styles.lobbyTab, activeLobbyTab === 'expenses' && styles.lobbyTabActive]}
              onPress={() => setActiveLobbyTab('expenses')}
            >
              <Text style={styles.lobbyTabText}>Wydatki</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.lobbyTab, activeLobbyTab === 'transfers' && styles.lobbyTabActive]}
              onPress={() => setActiveLobbyTab('transfers')}
            >
              <Text style={styles.lobbyTabText}>Przelewy</Text>
            </TouchableOpacity>
          </View>

          {activeLobbyTab === 'transfers' && (
            <View style={styles.transferTabContent}>
              {balance?.my_net_balance !== undefined && balance.my_net_balance < 0 && (
                <View style={styles.transferCard}>
                  <Text style={styles.transferTitle}>Oddaj pieniądze</Text>
                  <Text style={styles.transferHint}>
                    Do spłaty: {(Math.abs(balance.my_net_balance) / 100).toFixed(2)} PLN
                  </Text>
                  <Text style={styles.subLabel}>Odbiorca przelewu</Text>
                  <View style={styles.transferRecipients}>
                    {activeGroup.members
                      .filter(
                        (member) =>
                          member.id !== currentUser?.id &&
                          (balance.all_balances?.[String(member.id)] || 0) > 0
                      )
                      .map((member) => (
                        <TouchableOpacity
                          key={member.id}
                          style={[
                            styles.transferRecipient,
                            transferRecipientId === member.id && styles.transferRecipientActive,
                          ]}
                          onPress={() => setTransferRecipientId(member.id)}
                        >
                          <Text style={styles.transferRecipientText}>{member.name}</Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Kwota przelewu (PLN)"
                    placeholderTextColor="#64748b"
                    keyboardType="numeric"
                    value={transferAmount}
                    onChangeText={setTransferAmount}
                  />
                  <TouchableOpacity
                    style={styles.transferButton}
                    onPress={handleDeclareTransfer}
                    disabled={loading}
                  >
                    <Text style={styles.actionBtnText}>Zadeklaruj przelew</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={styles.transferSectionTitle}>Oczekujące</Text>
              {transfers.filter((transfer) => transfer.status === 'pending').map((transfer) => {
                const isSender = transfer.sender_id === currentUser?.id;
                const isReceiver = transfer.receiver_id === currentUser?.id;
                return (
                  <View key={transfer.id} style={styles.transferTile}>
                    <View style={styles.transferTileHeader}>
                      <Text style={styles.transferTileStatus}>OCZEKUJĄCY</Text>
                      {isSender && (
                        <TouchableOpacity
                          style={styles.deleteTransferBtn}
                          onPress={() => handleDeleteTransfer(transfer.id)}
                        >
                          <Text style={styles.deleteTransferText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={styles.transferTilePeople}>
                      {getPayerName(transfer.sender_id)} → {getPayerName(transfer.receiver_id)}
                    </Text>
                    <Text style={styles.transferTileAmount}>
                      {(transfer.amount / 100).toFixed(2)} PLN
                    </Text>
                    <Text style={styles.transferTileDate}>
                      {new Date(transfer.created_at).toLocaleString('pl-PL')}
                    </Text>
                    {isReceiver && (
                      <View style={styles.transferDecisionRow}>
                        <TouchableOpacity
                          style={styles.confirmTransferButton}
                          onPress={() => handleTransferDecision(transfer.id, 'confirm')}
                          disabled={loading}
                        >
                          <Text style={styles.transferDecisionText}>Potwierdź</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.rejectTransferButton}
                          onPress={() => handleTransferDecision(transfer.id, 'reject')}
                          disabled={loading}
                        >
                          <Text style={styles.transferDecisionText}>Odrzuć</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}

              <Text style={styles.transferSectionTitle}>Potwierdzone</Text>
              {transfers.filter((transfer) => transfer.status === 'confirmed').map((transfer) => (
                <View key={transfer.id} style={styles.transferTileConfirmed}>
                  <Text style={styles.transferTileStatusConfirmed}>POTWIERDZONY</Text>
                  <Text style={styles.transferTilePeople}>
                    {getPayerName(transfer.sender_id)} → {getPayerName(transfer.receiver_id)}
                  </Text>
                  <Text style={styles.transferTileAmount}>
                    {(transfer.amount / 100).toFixed(2)} PLN
                  </Text>
                  <Text style={styles.transferTileDate}>
                    {new Date(transfer.created_at).toLocaleString('pl-PL')}
                  </Text>
                </View>
              ))}
              {transfers.filter((transfer) => transfer.status === 'pending').length === 0 &&
                transfers.filter((transfer) => transfer.status === 'confirmed').length === 0 && (
                  <Text style={styles.emptyText}>Brak przelewów</Text>
                )}
            </View>
          )}

          {/* Formularz wydatku */}
          {activeLobbyTab === 'expenses' && <View style={styles.formCard}>
          <TouchableOpacity
            style={[styles.formHeader, isExpenseFormOpen && styles.formHeaderOpen]}
            onPress={() => setIsExpenseFormOpen(!isExpenseFormOpen)}
            activeOpacity={0.8}
          >
            <Text style={styles.formHeaderTitle}>Dodaj wydatek</Text>
            <Text style={styles.formToggle}>{isExpenseFormOpen ? '−' : '+'}</Text>
          </TouchableOpacity>

          {isExpenseFormOpen && (
            <View>
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
              <TextInput
                style={[styles.input, styles.descriptionInput]}
                placeholder="Opis (opcjonalnie)"
                placeholderTextColor="#64748b"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <View style={styles.receiptContainer}>
                <View style={styles.receiptRow}>
                  <TouchableOpacity style={styles.receiptBtn} onPress={pickReceiptImage}>
                    <Text style={styles.receiptBtnText}>
                      {receiptImage ? '📷 Zmień zdjęcie' : '📷 Dodaj paragon'}
                    </Text>
                  </TouchableOpacity>
                  {receiptImage && (
                    <TouchableOpacity onPress={() => setReceiptImage(null)} style={styles.removeReceiptBtn}>
                      <Text style={styles.removeReceiptText}>Usuń</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Podgląd wybranego zdjęcia */}
                {receiptImage && (
                  <View style={styles.previewWrapper}>
                    <Image source={{ uri: receiptImage }} style={styles.receiptPreview} />
                  </View>
                )}
              </View>

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
          )}
          </View>}

          {/* Lista wydatków */}
          {activeLobbyTab === 'expenses' && <View style={styles.listContainer}>
            <Text style={styles.sectionTitle}>Wydatki grupy</Text>
            {expenses.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.expenseItem}
                onPress={() => setSelectedExpense(item)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.expenseTitle}>{item.title}</Text>
                  {item.description && (
                    <Text style={styles.expenseDescription}>{item.description}</Text>
                  )}
                  <Text style={styles.expenseSub}>{getPayerName(item.payer_id)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={styles.expenseAmount}>
                    {(item.amount / 100).toFixed(2)} PLN
                  </Text>
                  {item.payer_id === currentUser?.id && (
                    <TouchableOpacity
                      onPress={() => handleDeleteExpense(item.id)}
                      style={styles.deleteBtn}
                    >
                      <Text style={styles.deleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            ))}
            {expenses.length === 0 && (
              <Text style={styles.emptyText}>Brak wydatków w tym lobby</Text>
            )}
          </View>}

          </ElasticScrollView>

          <Modal
            visible={selectedExpense !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setSelectedExpense(null)}
          >
            <View style={styles.modalOverlay}>
              {selectedExpense && (
                <View style={styles.expenseDetailsCard}>
                  <View style={styles.detailsHeader}>
                    <Text style={styles.detailsTitle}>Szczegóły wydatku</Text>
                    <TouchableOpacity
                      onPress={() => setSelectedExpense(null)}
                      style={styles.closeDetailsBtn}
                      accessibilityLabel="Zamknij szczegóły wydatku"
                    >
                      <Text style={styles.closeDetailsText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                    <Text style={styles.detailsExpenseTitle}>{selectedExpense.title}</Text>
                    <Text style={styles.detailsAmount}>
                      {(selectedExpense.amount / 100).toFixed(2)} PLN
                    </Text>
                    <Text style={styles.detailsLabel}>Płatnik</Text>
                    <Text style={styles.detailsValue}>
                      {getPayerName(selectedExpense.payer_id)}
                    </Text>
                    <Text style={styles.detailsLabel}>Data</Text>
                    <Text style={styles.detailsValue}>
                      {new Date(selectedExpense.created_at).toLocaleString('pl-PL')}
                    </Text>
                    <Text style={styles.detailsLabel}>Opis</Text>
                    <Text style={styles.detailsValue}>
                      {selectedExpense.description || 'Brak opisu'}
                    </Text>
                    {selectedExpense.receipt_image && (
                      <>
                        <Text style={styles.detailsLabel}>Paragon</Text>
                        <Image
                          source={{ uri: selectedExpense.receipt_image }}
                          style={styles.detailsReceiptImage}
                        />
                      </>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          </Modal>
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

      <ElasticScrollView
        contentContainerStyle={styles.scrollContent}
        alwaysBounceVertical
        bounces
        overScrollMode="always"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View style={styles.dashboardActions}>
          <TouchableOpacity
            style={[styles.dashboardAction, styles.createAction]}
            onPress={() => setDashboardAction(dashboardAction === 'create' ? null : 'create')}
            activeOpacity={0.8}
          >
            <Text style={styles.dashboardActionIcon}>＋</Text>
            <Text style={styles.dashboardActionTitle}>Utwórz lobby</Text>
            <Text style={styles.dashboardActionHint}>Stwórz nowe miejsce dla grupy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dashboardAction, styles.joinAction]}
            onPress={() => setDashboardAction(dashboardAction === 'join' ? null : 'join')}
            activeOpacity={0.8}
          >
            <Text style={styles.dashboardActionIcon}>⌁</Text>
            <Text style={styles.dashboardActionTitle}>Dołącz po kodzie</Text>
            <Text style={styles.dashboardActionHint}>Wpisz kod otrzymany od grupy</Text>
          </TouchableOpacity>
        </View>

        {dashboardAction === 'create' && (
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
        )}

        {dashboardAction === 'join' && (
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
        )}

        <Text style={styles.activeGroupsTitle}>Twoje aktywne lobby</Text>
        {myGroups.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={[styles.groupCard, getGroupBalanceStyle(g.balanceCents)]}
            onPress={() => setActiveGroup(g)}
          >
            <View>
              <Text style={styles.groupName}>{g.name}</Text>
              <Text style={styles.groupMembersCount}>
                Członków: {g.members?.length || 1} • Kod: {g.join_code}
              </Text>
              <Text style={styles.groupBalance}>
                Saldo: {g.balanceSummary || 'Brak danych'}
              </Text>
            </View>
            <Text style={styles.groupArrow}>→</Text>
          </TouchableOpacity>
        ))}

        {myGroups.length === 0 && (
          <Text style={styles.emptyText}>Nie należysz jeszcze do żadnego lobby.</Text>
        )}
      </ElasticScrollView>
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
  scrollContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  lobbyContentScroll: {
    flex: 1,
    minHeight: 0,
  },
  lobbyContent: {
    paddingBottom: 28,
    flexGrow: 1,
  },
  dashboardActions: {
    gap: 10,
    marginBottom: 20,
  },
  dashboardAction: {
    minHeight: 78,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  createAction: {
    backgroundColor: '#f59e0b',
    borderColor: '#fbbf24',
  },
  joinAction: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  dashboardActionIcon: {
    position: 'absolute',
    right: 16,
    top: 12,
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
  },
  dashboardActionTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
  },
  dashboardActionHint: {
    color: '#e0f2fe',
    fontSize: 12,
    marginTop: 3,
  },
  activeGroupsTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 10,
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
  groupCardNeutral: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  groupCardOwed: {
    backgroundColor: '#451a1a',
    borderColor: '#ef4444',
  },
  groupCardDue: {
    backgroundColor: '#14532d',
    borderColor: '#22c55e',
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
  groupBalance: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
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
  lobbyTabs: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 4,
    marginBottom: 10,
  },
  lobbyTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 6,
  },
  lobbyTabActive: {
    backgroundColor: '#2563eb',
  },
  lobbyTabText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  transferTabContent: {
    paddingBottom: 24,
  },
  transferSectionTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 8,
  },
  transferTile: {
    backgroundColor: '#1e293b',
    borderColor: '#f59e0b',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  transferTileConfirmed: {
    backgroundColor: '#14532d',
    borderColor: '#22c55e',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  transferTileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transferTileStatus: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '800',
  },
  transferTileStatusConfirmed: {
    color: '#86efac',
    fontSize: 10,
    fontWeight: '800',
  },
  transferTilePeople: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 6,
  },
  transferTileAmount: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 4,
  },
  transferTileDate: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4,
  },
  deleteTransferBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#7f1d1d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteTransferText: {
    color: '#fecaca',
    fontSize: 14,
    fontWeight: '800',
  },
  transferCard: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#475569',
  },
  transferTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  transferHint: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 8,
  },
  transferRecipients: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  transferRecipient: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  transferRecipientActive: {
    backgroundColor: '#2563eb',
  },
  transferRecipientText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  transferButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  pendingTransfer: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 10,
    marginTop: 6,
  },
  pendingTransferInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transferDecisionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  confirmTransferButton: {
    flex: 1,
    backgroundColor: '#16a34a',
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: 'center',
  },
  rejectTransferButton: {
    flex: 1,
    backgroundColor: '#dc2626',
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: 'center',
  },
  transferDecisionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f59e0b',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fbbf24',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  formHeaderOpen: {
    marginBottom: 12,
  },
  formHeaderTitle: {
    color: '#1e293b',
    fontSize: 16,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  formToggle: {
    color: '#1e293b',
    fontSize: 25,
    fontWeight: '800',
    lineHeight: 25,
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
  descriptionInput: {
    minHeight: 72,
  },
  receiptContainer: {
    marginBottom: 10,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  receiptBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569',
  },
  receiptBtnText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
  removeReceiptBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: '#ef444420',
    borderRadius: 6,
  },
  removeReceiptText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  previewWrapper: {
    marginTop: 8,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  receiptPreview: {
    width: '100%',
    height: 160,
    resizeMode: 'cover',
    borderRadius: 8,
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
  expenseDescription: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 2,
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
  deleteBtn: {
    backgroundColor: '#ef444420',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ef444450',
  },
  deleteBtnText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  expenseDetailsCard: {
    maxHeight: '85%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#475569',
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  detailsTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  closeDetailsBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeDetailsText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  detailsExpenseTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
  detailsAmount: {
    color: '#fbbf24',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 16,
  },
  detailsLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 10,
    textTransform: 'uppercase',
  },
  detailsValue: {
    color: '#f8fafc',
    fontSize: 14,
    marginTop: 3,
  },
  detailsReceiptImage: {
    width: '100%',
    height: 220,
    resizeMode: 'cover',
    borderRadius: 8,
    marginTop: 6,
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 14,
    fontSize: 13,
  },
});