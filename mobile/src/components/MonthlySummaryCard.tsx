import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MonthlySummaryResponse } from '../types';

const MONTH_NAMES = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

interface MonthlySummaryCardProps {
  year: number;
  month: number;
  summary: MonthlySummaryResponse | null;
  onChangeMonth: (offset: number) => void;
}

const formatCents = (cents: number) => `${(cents / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;

export default function MonthlySummaryCard({ year, month, summary, onChangeMonth }: MonthlySummaryCardProps) {
  return (
    <View style={styles.section}>
      <View style={styles.selector}>
        <TouchableOpacity style={styles.arrowButton} onPress={() => onChangeMonth(-1)}>
          <Text style={styles.arrow}>‹</Text><Text style={styles.arrowLabel}>Poprzedni</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{MONTH_NAMES[month - 1]} {year}</Text>
        <TouchableOpacity style={styles.arrowButton} onPress={() => onChangeMonth(1)}>
          <Text style={styles.arrowLabel}>Następny</Text><Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      </View>
      {summary && (
        <View style={styles.card}>
          <Text style={styles.title}>Podsumowanie miesiąca</Text>
          <View style={styles.values}>
            <View style={styles.valueBlock}><Text style={styles.label}>Suma grupy</Text><Text style={styles.amount}>{formatCents(summary.total_group_spent)}</Text></View>
            <View style={styles.valueBlock}><Text style={styles.label}>Twój wkład</Text><Text style={styles.amount}>{formatCents(summary.my_spent)}</Text></View>
            <View style={styles.valueBlock}><Text style={styles.label}>Wpisy</Text><Text style={styles.amount}>{summary.expense_count}</Text></View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 10 },
  selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1e293b', borderRadius: 8, borderWidth: 1, borderColor: '#334155', padding: 6 },
  arrowButton: { minWidth: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 6, backgroundColor: '#334155' },
  arrow: { color: '#38bdf8', fontSize: 22, lineHeight: 22, fontWeight: '700' },
  arrowLabel: { color: '#cbd5e1', fontSize: 10, fontWeight: '700' },
  monthTitle: { flex: 1, color: '#f8fafc', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  card: { backgroundColor: '#1e293b', borderRadius: 8, borderWidth: 1, borderColor: '#334155', padding: 12, marginTop: 8 },
  title: { color: '#f8fafc', fontSize: 14, fontWeight: '800', marginBottom: 10 },
  values: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  valueBlock: { flex: 1 },
  label: { color: '#94a3b8', fontSize: 11, marginBottom: 3 },
  amount: { color: '#38bdf8', fontSize: 14, fontWeight: '800' },
});
