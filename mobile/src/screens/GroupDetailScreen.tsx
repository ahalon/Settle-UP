import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Image, Modal, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addExpense, declareTransfer, deleteExpense, deleteTransfer, decideTransfer, getGroupBalance, getGroupExpenses, getGroupTransfers, getMonthlySummary } from '../services/api';
import { BalanceResponse, CurrentUser, Expense, Group, LobbyTab, MonthlySummaryResponse, Transfer } from '../types';
import { getErrorMessage } from '../utils/errorHandler';
import ExpenseItem from '../components/ExpenseItem';
import MonthlySummaryCard from '../components/MonthlySummaryCard';
import ReceiptPicker from '../components/ReceiptPicker';
import TransferItem from '../components/TransferItem';

interface GroupDetailScreenProps {
  token: string;
  currentUser: CurrentUser;
  group: Group;
  onBack: () => void;
}

const getInitialMonth = () => {
  const date = new Date();
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
};

export default function GroupDetailScreen({ token, currentUser, group, onBack }: GroupDetailScreenProps) {
  const initialMonth = getInitialMonth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryResponse | null>(null);
  const [year, setYear] = useState(initialMonth.year);
  const [month, setMonth] = useState(initialMonth.month);
  const [activeTab, setActiveTab] = useState<LobbyTab>('expenses');
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [selectedPayerId, setSelectedPayerId] = useState<number>(currentUser.id);
  const [transferRecipientId, setTransferRecipientId] = useState<number | null>(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getPayerName = (payerId: number) => {
    if (payerId === currentUser.id) return 'Ty';
    return group.members.find((member) => member.id === payerId)?.name || `ID: ${payerId}`;
  };

  const loadDetails = async () => {
    try {
      const [expenseResponse, balanceResponse, transferResponse, summaryResponse] = await Promise.all([
        getGroupExpenses(group.id, token, year, month),
        getGroupBalance(group.id, token),
        getGroupTransfers(group.id, token),
        getMonthlySummary(group.id, token, year, month),
      ]);
      setExpenses(expenseResponse.data);
      setBalance(balanceResponse.data);
      setTransfers(transferResponse.data);
      setMonthlySummary(summaryResponse.data);
      const creditor = group.members.find((member) => (balanceResponse.data.all_balances?.[String(member.id)] || 0) > 0);
      setTransferRecipientId((current) => current || creditor?.id || null);
    } catch (err: any) {
      Alert.alert('Błąd', getErrorMessage(err, 'Nie udało się pobrać danych grupy'));
    }
  };

  useEffect(() => { loadDetails(); }, [group.id, token, year, month]);

  const handleAddExpense = async () => {
    if (!title.trim() || !amount.trim() || !selectedPayerId) {
      Alert.alert('Błąd', 'Wypełnij wszystkie pola wydatku');
      return;
    }
    const amountInCents = Math.round(parseFloat(amount.replace(',', '.')) * 100);
    if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
      Alert.alert('Błąd', 'Wpisz poprawną kwotę');
      return;
    }
    setLoading(true);
    try {
      await addExpense(token, { title: title.trim(), amount: amountInCents, payer_id: selectedPayerId, group_id: group.id, description: description.trim() || null, receipt_image: receiptImage });
      setTitle(''); setAmount(''); setDescription(''); setReceiptImage(null); setExpenseFormOpen(false);
      await loadDetails();
    } catch (err: any) {
      Alert.alert('Błąd', getErrorMessage(err, 'Nie udało się zapisać wydatku'));
    } finally { setLoading(false); }
  };

  const handleDeleteExpense = (expenseId: number) => {
    Alert.alert('Usuń wydatek', 'Czy na pewno chcesz usunąć ten wydatek?', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: async () => {
        setLoading(true);
        try { await deleteExpense(token, expenseId); await loadDetails(); }
        catch (err: any) { Alert.alert('Błąd', getErrorMessage(err, 'Nie udało się usunąć wydatku')); }
        finally { setLoading(false); }
      } },
    ]);
  };

  const handleDeclareTransfer = async () => {
    if (!transferRecipientId || !transferAmount.trim()) {
      Alert.alert('Błąd', 'Wybierz odbiorcę i wpisz kwotę przelewu');
      return;
    }
    const cents = Math.round(parseFloat(transferAmount.replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents <= 0) { Alert.alert('Błąd', 'Wpisz poprawną kwotę przelewu'); return; }
    setLoading(true);
    try { await declareTransfer(group.id, token, { receiver_id: transferRecipientId, amount: cents }); setTransferAmount(''); await loadDetails(); }
    catch (err: any) { Alert.alert('Błąd', getErrorMessage(err, 'Nie udało się zadeklarować przelewu')); }
    finally { setLoading(false); }
  };

  const handleDecision = async (transferId: number, decision: 'confirm' | 'reject') => {
    setLoading(true);
    try { await decideTransfer(token, transferId, decision); await loadDetails(); }
    catch (err: any) { Alert.alert('Błąd', getErrorMessage(err, 'Nie udało się zmienić statusu przelewu')); }
    finally { setLoading(false); }
  };

  const handleDeleteTransfer = (transferId: number) => {
    Alert.alert('Usuń deklarację', 'Czy na pewno chcesz usunąć tę deklarację przelewu?', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: async () => {
        setLoading(true);
        try { await deleteTransfer(token, transferId); await loadDetails(); }
        catch (err: any) { Alert.alert('Błąd', getErrorMessage(err, 'Nie udało się usunąć deklaracji')); }
        finally { setLoading(false); }
      } },
    ]);
  };

  const renderExpenseHeader = () => (
    <>
      <View style={styles.formCard}>
        <TouchableOpacity style={[styles.formHeader, expenseFormOpen && styles.formHeaderOpen]} onPress={() => setExpenseFormOpen((value) => !value)}>
          <Text style={styles.formHeaderTitle}>Dodaj wydatek</Text><Text style={styles.formToggle}>{expenseFormOpen ? '−' : '+'}</Text>
        </TouchableOpacity>
        {expenseFormOpen && <View>
          <Text style={styles.subLabel}>Kto zapłacił?</Text>
          <View style={styles.payerSelector}>{group.members.map((member) => <TouchableOpacity key={member.id} style={[styles.payerOption, selectedPayerId === member.id && styles.payerOptionActive]} onPress={() => setSelectedPayerId(member.id)}><Text style={[styles.payerOptionText, selectedPayerId === member.id && styles.payerOptionTextActive]}>{member.id === currentUser.id ? 'Ja' : member.name}</Text></TouchableOpacity>)}</View>
          <TextInput style={styles.input} placeholder="Tytuł wydatku" placeholderTextColor="#64748b" value={title} onChangeText={setTitle} />
          <TextInput style={styles.input} placeholder="Kwota (PLN)" placeholderTextColor="#64748b" keyboardType="numeric" value={amount} onChangeText={setAmount} />
          <TextInput style={[styles.input, styles.descriptionInput]} placeholder="Opis (opcjonalnie)" placeholderTextColor="#64748b" value={description} onChangeText={setDescription} multiline numberOfLines={3} textAlignVertical="top" />
          <ReceiptPicker imageUri={receiptImage} onChange={setReceiptImage} />
          <TouchableOpacity style={styles.actionBtn} onPress={handleAddExpense} disabled={loading}><Text style={styles.actionBtnText}>{loading ? 'Zapisywanie...' : 'Zapisz wydatek'}</Text></TouchableOpacity>
        </View>}
      </View>
      <Text style={styles.sectionTitle}>Wydatki grupy</Text>
    </>
  );

  const renderTransfers = () => (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
      {balance?.my_net_balance !== undefined && balance.my_net_balance < 0 && <View style={styles.transferCard}>
        <Text style={styles.transferTitle}>Oddaj pieniądze</Text><Text style={styles.transferHint}>Do spłaty: {(Math.abs(balance.my_net_balance) / 100).toFixed(2)} PLN</Text>
        <Text style={styles.subLabel}>Odbiorca przelewu</Text>
        <View style={styles.transferRecipients}>{group.members.filter((member) => member.id !== currentUser.id && (balance.all_balances?.[String(member.id)] || 0) > 0).map((member) => <TouchableOpacity key={member.id} style={[styles.transferRecipient, transferRecipientId === member.id && styles.transferRecipientActive]} onPress={() => setTransferRecipientId(member.id)}><Text style={styles.transferRecipientText}>{member.name}</Text></TouchableOpacity>)}</View>
        <TextInput style={styles.input} placeholder="Kwota przelewu (PLN)" placeholderTextColor="#64748b" keyboardType="numeric" value={transferAmount} onChangeText={setTransferAmount} />
        <TouchableOpacity style={styles.transferButton} onPress={handleDeclareTransfer} disabled={loading}><Text style={styles.actionBtnText}>Zadeklaruj przelew</Text></TouchableOpacity>
      </View>}
      <Text style={styles.transferSectionTitle}>Oczekujące</Text>
      {transfers.filter((transfer) => transfer.status === 'pending').map((transfer) => <TransferItem key={transfer.id} transfer={transfer} senderName={getPayerName(transfer.sender_id)} receiverName={getPayerName(transfer.receiver_id)} currentUserId={currentUser.id} onDecision={(decision) => handleDecision(transfer.id, decision)} onDelete={() => handleDeleteTransfer(transfer.id)} />)}
      <Text style={styles.transferSectionTitle}>Potwierdzone</Text>
      {transfers.filter((transfer) => transfer.status === 'confirmed').map((transfer) => <TransferItem key={transfer.id} transfer={transfer} senderName={getPayerName(transfer.sender_id)} receiverName={getPayerName(transfer.receiver_id)} currentUserId={currentUser.id} onDecision={(decision) => handleDecision(transfer.id, decision)} onDelete={() => handleDeleteTransfer(transfer.id)} />)}
      {!transfers.some((transfer) => transfer.status === 'pending' || transfer.status === 'confirmed') && <Text style={styles.emptyText}>Brak przelewów</Text>}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.navBar}><TouchableOpacity onPress={onBack} style={styles.backBtn}><Text style={styles.backText}>← Wróć</Text></TouchableOpacity><Text style={styles.groupName}>{group.name}</Text></View>
      <View style={styles.codeCard}><Text style={styles.codeLabel}>KOD DOŁĄCZENIA DO TEGO LOBBY:</Text><Text style={styles.codeValue}>{group.join_code}</Text></View>
      <View style={styles.balanceCard}><Text style={styles.balanceLabel}>Twój bilans w tej grupie:</Text><Text style={styles.balanceValue}>{balance?.summary || 'Ładowanie...'}</Text></View>
      <MonthlySummaryCard year={year} month={month} summary={monthlySummary} onSelectMonth={(nextYear, nextMonth) => { setYear(nextYear); setMonth(nextMonth); }} />
      <View style={styles.tabs}><TouchableOpacity style={[styles.tab, activeTab === 'expenses' && styles.tabActive]} onPress={() => setActiveTab('expenses')}><Text style={styles.tabText}>Wydatki</Text></TouchableOpacity><TouchableOpacity style={[styles.tab, activeTab === 'transfers' && styles.tabActive]} onPress={() => setActiveTab('transfers')}><Text style={styles.tabText}>Przelewy</Text></TouchableOpacity></View>
      {activeTab === 'transfers' ? renderTransfers() : <FlatList data={expenses} keyExtractor={(item) => item.id.toString()} renderItem={({ item }) => <ExpenseItem expense={item} payerName={getPayerName(item.payer_id)} currentUserId={currentUser.id} onPress={() => setSelectedExpense(item)} onDelete={() => handleDeleteExpense(item.id)} />} ListHeaderComponent={renderExpenseHeader} ListEmptyComponent={<Text style={styles.emptyText}>Brak wydatków w tym miesiącu</Text>} contentContainerStyle={styles.listContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" />}
      <Modal visible={selectedExpense !== null} transparent animationType="fade" onRequestClose={() => setSelectedExpense(null)}>
        <View style={styles.modalOverlay}>{selectedExpense && <View style={styles.detailsCard}><View style={styles.detailsHeader}><Text style={styles.detailsTitle}>Szczegóły wydatku</Text><TouchableOpacity style={styles.closeButton} onPress={() => setSelectedExpense(null)}><Text style={styles.closeText}>✕</Text></TouchableOpacity></View><ScrollView keyboardDismissMode="on-drag"><Text style={styles.detailsExpenseTitle}>{selectedExpense.title}</Text><Text style={styles.detailsAmount}>{(selectedExpense.amount / 100).toFixed(2)} PLN</Text><Text style={styles.detailsLabel}>Płatnik</Text><Text style={styles.detailsValue}>{getPayerName(selectedExpense.payer_id)}</Text><Text style={styles.detailsLabel}>Data</Text><Text style={styles.detailsValue}>{new Date(selectedExpense.created_at).toLocaleString('pl-PL')}</Text><Text style={styles.detailsLabel}>Opis</Text><Text style={styles.detailsValue}>{selectedExpense.description || 'Brak opisu'}</Text>{selectedExpense.receipt_image && <><Text style={styles.detailsLabel}>Paragon</Text><Image source={{ uri: selectedExpense.receipt_image }} style={styles.detailsImage} /></>}</ScrollView></View>}</View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingHorizontal: 16 },
  navBar: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 12, gap: 12 },
  backBtn: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#334155', borderRadius: 6 },
  backText: { color: '#38bdf8', fontSize: 13, fontWeight: '600' },
  groupName: { color: '#f8fafc', fontSize: 18, fontWeight: '700', flex: 1 },
  codeCard: { backgroundColor: '#1e293b', padding: 10, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#38bdf8', alignItems: 'center' },
  codeLabel: { color: '#94a3b8', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  codeValue: { color: '#38bdf8', fontSize: 20, fontWeight: '800', letterSpacing: 2, marginTop: 2 },
  balanceCard: { backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 10 },
  balanceLabel: { color: '#94a3b8', fontSize: 12 },
  balanceValue: { color: '#38bdf8', fontSize: 15, fontWeight: '700', marginTop: 2 },
  tabs: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 8, padding: 4, marginBottom: 10 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 6 },
  tabActive: { backgroundColor: '#2563eb' },
  tabText: { color: '#f8fafc', fontSize: 13, fontWeight: '700' },
  listContent: { paddingBottom: 28 },
  sectionTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  formCard: { backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 10 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f59e0b', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fbbf24' },
  formHeaderOpen: { marginBottom: 12 },
  formHeaderTitle: { color: '#1e293b', fontSize: 16, fontWeight: '800' },
  formToggle: { color: '#1e293b', fontSize: 25, fontWeight: '800' },
  subLabel: { color: '#94a3b8', fontSize: 11, marginBottom: 4 },
  payerSelector: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  payerOption: { flex: 1, backgroundColor: '#334155', paddingVertical: 6, borderRadius: 6, alignItems: 'center' },
  payerOptionActive: { backgroundColor: '#2563eb' },
  payerOptionText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  payerOptionTextActive: { color: '#fff' },
  input: { backgroundColor: '#334155', color: '#f8fafc', borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 14 },
  descriptionInput: { minHeight: 72 },
  actionBtn: { backgroundColor: '#2563eb', paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 14, fontSize: 13 },
  tabScroll: { flex: 1 },
  tabContent: { paddingBottom: 28 },
  transferCard: { backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#475569' },
  transferTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  transferHint: { color: '#94a3b8', fontSize: 12, marginBottom: 8 },
  transferRecipients: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  transferRecipient: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  transferRecipientActive: { backgroundColor: '#2563eb' },
  transferRecipientText: { color: '#f8fafc', fontSize: 13, fontWeight: '700' },
  transferButton: { backgroundColor: '#2563eb', paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  transferSectionTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '800', marginTop: 8, marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.8)', justifyContent: 'center', padding: 20 },
  detailsCard: { maxHeight: '85%', backgroundColor: '#1e293b', borderRadius: 12, padding: 18, borderWidth: 1, borderColor: '#475569' },
  detailsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  detailsTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '800' },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  detailsExpenseTitle: { color: '#f8fafc', fontSize: 20, fontWeight: '800' },
  detailsAmount: { color: '#fbbf24', fontSize: 18, fontWeight: '800', marginTop: 4, marginBottom: 16 },
  detailsLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '700', marginTop: 10, textTransform: 'uppercase' },
  detailsValue: { color: '#f8fafc', fontSize: 14, marginTop: 3 },
  detailsImage: { width: '100%', height: 220, resizeMode: 'cover', borderRadius: 8, marginTop: 6 },
});
