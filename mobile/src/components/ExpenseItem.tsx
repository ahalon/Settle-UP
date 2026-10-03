import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Expense } from '../types';

interface ExpenseItemProps {
  expense: Expense;
  payerName: string;
  currentUserId?: number;
  onPress: () => void;
  onDelete: () => void;
}

export default function ExpenseItem({ expense, payerName, currentUserId, onPress, onDelete }: ExpenseItemProps) {
  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.content}>
        <Text style={styles.title}>{expense.title}</Text>
        {expense.description && <Text style={styles.description}>{expense.description}</Text>}
        <Text style={styles.payer}>{payerName}</Text>
        {expense.receipt_image && <Image source={{ uri: expense.receipt_image }} style={styles.thumbnail} />}
      </View>
      <View style={styles.trailing}>
        <Text style={styles.amount}>{(expense.amount / 100).toFixed(2)} PLN</Text>
        {expense.payer_id === currentUserId && (
          <TouchableOpacity onPress={onDelete} style={styles.deleteButton}>
            <Text style={styles.deleteText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  item: { backgroundColor: '#1e293b', padding: 12, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  content: { flex: 1 },
  title: { color: '#f8fafc', fontSize: 14, fontWeight: '600' },
  description: { color: '#cbd5e1', fontSize: 12, marginTop: 2 },
  payer: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  thumbnail: { width: 42, height: 42, borderRadius: 6, marginTop: 7 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  amount: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  deleteButton: { backgroundColor: '#ef444420', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#ef444450' },
  deleteText: { color: '#ef4444', fontSize: 13, fontWeight: '700' },
});
