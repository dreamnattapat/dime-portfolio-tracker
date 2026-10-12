import { Badge } from '@/components/ui/badge'
import type { TransactionType } from '@/lib/dime/parser'

const TRADE_LABELS: Record<TransactionType | 'Split', string> = {
  Buy: 'ซื้อ',
  Sell: 'ขาย',
  Reward: 'รางวัล',
  'Exercise Call': 'ใช้สิทธิ Call',
  'Exercise Put': 'ใช้สิทธิ Put',
  Split: 'แตกหุ้น',
}

const TONES: Partial<Record<TransactionType | 'Split', string>> = {
  Buy: 'bg-delta-up/10 text-delta-up',
  Sell: 'bg-delta-down/10 text-delta-down',
}

/** Buy in green, sell in red (the label carries it too); anything else plain. */
export function TradeBadge({ kind }: { kind: TransactionType | 'Split' }) {
  const tone = TONES[kind]
  return (
    <Badge variant={tone ? 'ghost' : 'outline'} className={tone}>
      {TRADE_LABELS[kind] ?? kind}
    </Badge>
  )
}
