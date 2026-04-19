export const CATEGORIES = [
  'Food & Dining',
  'Transport',
  'Shopping',
  'Entertainment',
  'Bills & Utilities',
  'Health',
  'Education',
  'Travel',
  'Payment',
  'Other',
] as const

export type Category = typeof CATEGORIES[number]
