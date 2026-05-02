export function charCountBucket(count: number): string {
  if (count <= 0) return '0';
  if (count <= 1000) return '1_1k';
  if (count <= 10000) return '1k_10k';
  if (count <= 50000) return '10k_50k';
  if (count <= 100000) return '50k_100k';
  return '100k_plus';
}

export function durationBucket(ms: number): string {
  if (ms < 1000) return 'under_1s';
  if (ms < 3000) return '1s_3s';
  if (ms < 10000) return '3s_10s';
  if (ms < 30000) return '10s_30s';
  return '30s_plus';
}

export function editDurationBucket(ms: number): string {
  if (ms < 10000) return 'under_10s';
  if (ms < 60000) return '10s_1m';
  if (ms < 180000) return '1m_3m';
  if (ms < 600000) return '3m_10m';
  if (ms < 1800000) return '10m_30m';
  return '30m_plus';
}

export function deltaCharCountBucket(delta: number): string {
  if (delta < 0) return 'negative';
  if (delta === 0) return '0';
  if (delta <= 100) return '1_100';
  if (delta <= 500) return '100_500';
  if (delta <= 1000) return '500_1k';
  if (delta <= 5000) return '1k_5k';
  return '5k_plus';
}

export function countBucket(count: number): string {
  if (count <= 0) return '0';
  if (count <= 1) return '1';
  if (count <= 5) return '2_5';
  if (count <= 10) return '6_10';
  if (count <= 50) return '11_50';
  return '50_plus';
}
