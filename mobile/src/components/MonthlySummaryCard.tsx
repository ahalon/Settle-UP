import React, { useEffect, useRef } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MonthlySummaryResponse } from '../types';

const MONTHS = ['STY', 'LUT', 'MAR', 'KWI', 'MAJ', 'CZE', 'LIP', 'SIE', 'WRZ', 'PAŹ', 'LIS', 'GRU'];

const ITEM_WIDTH = 86;
const ITEM_GAP = 10;
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
  groupCreatedAt?: string;
}

const formatCents = (cents: number) =>
  `${(cents / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;

const buildMonthOptions = (groupCreatedAt?: string): MonthOption[] => {
  const now = new Date();
  const start = groupCreatedAt ? new Date(groupCreatedAt) : new Date(now.getFullYear(), now.getMonth() - 2, 1);

  let curYear = Number.isNaN(start.getFullYear()) ? now.getFullYear() : start.getFullYear();
  let curMonth = Number.isNaN(start.getMonth()) ? now.getMonth() + 1 : start.getMonth() + 1;

  const targetYear = now.getFullYear();
  const targetMonth = now.getMonth() + 1;

  const options: MonthOption[] = [];

  while (curYear < targetYear || (curYear === targetYear && curMonth <= targetMonth)) {
    options.push({ year: curYear, month: curMonth });
    curMonth += 1;
    if (curMonth > 12) {
      curMonth = 1;
      curYear += 1;
    }
  }

  if (options.length === 0) {
    options.push({ year: targetYear, month: targetMonth });
  }

  return options;
};

export default function MonthlySummaryCard({
  year,
  month,
  summary,
  onSelectMonth,
  groupCreatedAt,
}: MonthlySummaryCardProps) {
  const options = buildMonthOptions(groupCreatedAt);
  const listRef = useRef<FlatList<MonthOption>>(null);

  useEffect(() => {
    const activeIndex = options.findIndex((item) => item.year === year && item.month === month);
    if (activeIndex >= 0) {
      listRef.current?.scrollToIndex({ index: activeIndex, animated: true, viewPosition: 0.5 });
    }
  }, [year, month, options.length]);

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
              style={[styles.monthCard, active && styles.monthCardActive]}
              onPress={() => onSelectMonth(item.year, item.month)}
              activeOpacity={0.8}
            >
              <Text style={[styles.monthName, active && styles.monthTextActive]}>
                {MONTHS[item.month - 1]}
              </Text>
              <Text style={[styles.monthYear, active && styles.yearTextActive]}>
                {item.year}
              </Text>
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
  monthCard: {
    width: ITEM_WIDTH,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  monthCardActive: {
    backgroundColor: '#2563eb',
    borderColor: '#38bdf8',
  },
  monthName: { color: '#cbd5e1', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  monthYear: { color: '#94a3b8', fontSize: 11, fontWeight: '600', marginTop: 2 },
  monthTextActive: { color: '#ffffff' },
  yearTextActive: { color: '#bae6fd' },
  card: { backgroundColor: '#1e293b', borderRadius: 8, borderWidth: 1, borderColor: '#334155', padding: 12, marginTop: 8 },
  title: { color: '#f8fafc', fontSize: 14, fontWeight: '800', marginBottom: 10 },
  values: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  valueBlock: { flex: 1 },
  label: { color: '#94a3b8', fontSize: 11, marginBottom: 3 },
  amount: { color: '#38bdf8', fontSize: 14, fontWeight: '800' },
});