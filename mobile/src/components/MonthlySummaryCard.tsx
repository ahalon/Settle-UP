import React, { useEffect, useRef } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MonthlySummaryResponse } from '../types';

const MONTHS = ['STY', 'LUT', 'MAR', 'KWI', 'MAJ', 'CZE', 'LIP', 'SIE', 'WRZ', 'PAŹ', 'LIS', 'GRU'];

const ITEM_WIDTH = 64;
const ITEM_GAP = 8;
const FULL_ITEM_WIDTH = ITEM_WIDTH + ITEM_GAP;

interface MonthOption {
  year: number;
  month: number;
}

interface MonthlySummaryCardProps {
  year: number;
  month: number;
  summary: MonthlySummaryResponse | null;
  onSelectMonth: (year: number, month: number) => void;
}

const formatCents = (cents: number) =>
  `${(cents / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;

const buildMonthOptions = (year: number, month: number): MonthOption[] => {
  const options: MonthOption[] = [];
  for (let offset = -6; offset <= 6; offset += 1) {
    const date = new Date(year, month - 1 + offset, 1);
    options.push({ year: date.getFullYear(), month: date.getMonth() + 1 });
  }
  return options;
};

export default function MonthlySummaryCard({ year, month, summary, onSelectMonth }: MonthlySummaryCardProps) {
  const options = buildMonthOptions(year, month);
  const listRef = useRef<FlatList<MonthOption>>(null);

  useEffect(() => {
    const activeIndex = options.findIndex((option) => option.year === year && option.month === month);
    if (activeIndex >= 0) {
      listRef.current?.scrollToIndex({ index: activeIndex, animated: true, viewPosition: 0.5 });
    }
  }, [year, month]);

  return (
    <View style={styles.section}>
      <FlatList
        ref={listRef}
        horizontal
        data={options}
        keyExtractor={(item) => `${item.year}-${item.month}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.monthList}
        keyboardDismissMode="on-drag"
        getItemLayout={(_, index) => ({
          length: FULL_ITEM_WIDTH,
          offset: FULL_ITEM_WIDTH * index,
          index,
        })}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
          }, 100);
        }}
        renderItem={({ item }) => {
          const active = item.year === year && item.month === month;
          return (
            <TouchableOpacity
              style={[styles.monthPill, active && styles.monthPillActive]}
              onPress={() => onSelectMonth(item.year, item.month)}
              activeOpacity={0.8}
            >
              <Text style={[styles.monthName, active && styles.monthTextActive]}>{MONTHS[item.month - 1]}</Text>
              <Text style={[styles.monthYear, active && styles.monthTextActive]}>{item.year}</Text>
            </TouchableOpacity>
          );
        }}
      />
      {summary && (
        <View style={styles.card}>
          <Text style={styles.title}>Podsumowanie miesiąca</Text>
          <View style={styles.values}>
            <View style={styles.valueBlock}>
              <Text style={styles.label}>Suma grupy</Text>
              <Text style={styles.amount}>{formatCents(summary.total_group_spent)}</Text>
            </View>
            <View style={styles.valueBlock}>
              <Text style={styles.label}>Twój wkład</Text>
              <Text style={styles.amount}>{formatCents(summary.my_spent)}</Text>
            </View>
            <View style={styles.valueBlock}>
              <Text style={styles.label}>Wpisy</Text>
              <Text style={styles.amount}>{summary.expense_count}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 10 },
  monthList: { gap: ITEM_GAP, paddingVertical: 4, paddingHorizontal: 2 },
  monthPill: { width: ITEM_WIDTH, alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 18, borderWidth: 1, borderColor: '#334155', paddingVertical: 8, paddingHorizontal: 4 },
  monthPillActive: { backgroundColor: '#2563eb', borderColor: '#38bdf8' },
  monthName: { color: '#cbd5e1', fontSize: 12, fontWeight: '800' },
  monthYear: { color: '#94a3b8', fontSize: 10, marginTop: 2 },
  monthTextActive: { color: '#fff' },
  card: { backgroundColor: '#1e293b', borderRadius: 8, borderWidth: 1, borderColor: '#334155', padding: 12, marginTop: 8 },
  title: { color: '#f8fafc', fontSize: 14, fontWeight: '800', marginBottom: 10 },
  values: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  valueBlock: { flex: 1 },
  label: { color: '#94a3b8', fontSize: 11, marginBottom: 3 },
  amount: { color: '#38bdf8', fontSize: 14, fontWeight: '800' },
});