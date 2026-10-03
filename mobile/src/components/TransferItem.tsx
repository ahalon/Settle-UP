import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Transfer } from '../types';

interface TransferItemProps {
  transfer: Transfer;
  senderName: string;
  receiverName: string;
  currentUserId?: number;
  onDecision: (decision: 'confirm' | 'reject') => void;
  onDelete: () => void;
}

export default function TransferItem({ transfer, senderName, receiverName, currentUserId, onDecision, onDelete }: TransferItemProps) {
  const isSender = transfer.sender_id === currentUserId;
  const isReceiver = transfer.receiver_id === currentUserId;
  const pending = transfer.status === 'pending';

  return (
    <View style={pending ? styles.pending : styles.confirmed}>
      <View style={styles.header}>
        <Text style={pending ? styles.pendingStatus : styles.confirmedStatus}>
          {transfer.status === 'pending' ? 'OCZEKUJĄCY' : transfer.status === 'confirmed' ? 'POTWIERDZONY' : 'ODRZUCONY'}
        </Text>
        {isSender && pending && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => Alert.alert('Usuń deklarację', 'Czy na pewno chcesz usunąć tę deklarację przelewu?', [
              { text: 'Anuluj', style: 'cancel' },
              { text: 'Usuń', style: 'destructive', onPress: onDelete },
            ])}
          >
            <Text style={styles.deleteText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.people}>{senderName} → {receiverName}</Text>
      <Text style={styles.amount}>{(transfer.amount / 100).toFixed(2)} PLN</Text>
      <Text style={styles.date}>{new Date(transfer.created_at).toLocaleString('pl-PL')}</Text>
      {isReceiver && pending && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.confirm} onPress={() => onDecision('confirm')}>
            <Text style={styles.actionText}>Potwierdź</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reject} onPress={() => onDecision('reject')}>
            <Text style={styles.actionText}>Odrzuć</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pending: { backgroundColor: '#1e293b', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
  confirmed: { backgroundColor: '#14532d', borderColor: '#22c55e', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingStatus: { color: '#fbbf24', fontSize: 10, fontWeight: '800' },
  confirmedStatus: { color: '#86efac', fontSize: 10, fontWeight: '800' },
  deleteButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#7f1d1d', alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#fecaca', fontSize: 14, fontWeight: '800' },
  people: { color: '#f8fafc', fontSize: 15, fontWeight: '700', marginTop: 6 },
  amount: { color: '#f8fafc', fontSize: 17, fontWeight: '800', marginTop: 4 },
  date: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  confirm: { flex: 1, backgroundColor: '#16a34a', paddingVertical: 9, borderRadius: 6, alignItems: 'center' },
  reject: { flex: 1, backgroundColor: '#dc2626', paddingVertical: 9, borderRadius: 6, alignItems: 'center' },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
