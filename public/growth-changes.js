export function growthChange(row, kind) {
  const isWeight = kind === 'weight';
  const current = isWeight ? row.weight_grams : row.length_mm;
  const previous = isWeight ? row.previous_weight_grams : row.previous_length_mm;
  if (!Number.isFinite(previous) || !Number.isFinite(current)) {
    return { comparable: false, label: `暂无上次${isWeight ? '体重' : '身长'}可对比` };
  }
  const difference = current - previous;
  if (difference === 0) return { comparable: true, label: `与上次${isWeight ? '体重' : '身长'}相同` };
  const amount = Math.abs(difference);
  const label = isWeight
    ? `比上次${difference > 0 ? '重' : '轻'} ${(amount / 500).toFixed(amount < 5 ? 3 : 2)} 斤（${amount} 克）`
    : `比上次${difference > 0 ? '长' : '短'} ${(amount / 10).toFixed(1)} 厘米`;
  return { comparable: true, label };
}
