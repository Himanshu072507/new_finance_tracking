const RULES: [RegExp, string][] = [
  // Investment — ICICI Direct trading, demat, ACH dividends, margin, MF/SIP (check early)
  [/icici.?direct|icicidirect|EBA\/EQ|EBA\/MTF|EBA\/SPOT|EBA\/NSE|NSEMRGNPIPO|DPCHG|demat chg|ACH\/IRFC|ACH\/RAIL VIKAS|ACH\/SJVN|ACH\/NHPC|ACH\/POWER GRID|ACH\/GAIL|ACH\/MAZAGON|ACH\/IRCON|ACH\/INDIAN ENERGY|zerodha|groww|upstox|angel.*broking|hdfc.*sec|kotak.*sec|motilal|sbi.*sec|mutual fund|sip|nps|ppf|fixed deposit/i, 'Investment'],

  // Income — interest credits, salary, company ACH receipts
  [/icici bank interest|savings interest|fd interest|CMS TRANSACTION|salary/i, 'Income'],

  // Cash
  [/atm cash|cash withdrawal|atm wdl|cash deposit/i, 'Cash'],

  // Transfers — credit card bill payments, UPI, IMPS, NEFT, bank-to-bank, paytm wallet
  [/BIL\/INFT|CC BillPay|NET BANKING BIL.*CREDIT|UPI Credit|UPI Debit|@ybl|@oksbi|@okaxis|@okhdfcbank|@paytm|@upi|imps|neft|rtgs|fund transfer|paytm/i, 'Transfers'],

  // Food & Dining
  [/swiggy|zomato|dominos|pizza|mcdonald|kfc|subway|dunkin|starbucks|cafe|restaurant|biryani|burger king|haldiram|chaayos|chai point|faasos|box8|eatfit|rebel foods/i, 'Food & Dining'],

  // Groceries
  [/blinkit|bigbasket|zepto|grofers|jiomart|dmart|reliance fresh|natures basket|more supermarket|spencers|spar|lulu|grocery|supermarket|hypermarket/i, 'Groceries'],

  // Transport
  [/uber|ola|rapido|metro|railway|irctc|bus|cab|auto|petrol|fuel|bpcl|hpcl|iocl|shell|indian oil|fasttag|toll|parkplus|redbus|abhibus/i, 'Transport'],

  // Shopping
  [/amazon|flipkart|myntra|ajio|meesho|snapdeal|nykaa|shoppers stop|lifestyle|westside|pantaloons|reliance digital|croma|vijay sales|tatacliq|purplle|bewakoof/i, 'Shopping'],

  // Entertainment
  [/netflix|spotify|prime video|hotstar|youtube premium|zee5|sonyliv|jiocinema|disney|apple music|gaana|wynk|bookmyshow|inox|pvr|multiplex|voot|mxplayer/i, 'Entertainment'],

  // Bills & Utilities
  [/airtel|vodafone|bsnl|vi\.in|recharge|broadband|fiber|electricity|bescom|tata power|adani electric|water bill|gas bill|mahanagar gas|municipal|bbmp/i, 'Bills & Utilities'],
  [/^jio(?!mart|cinema)/i, 'Bills & Utilities'],

  // Health
  [/apollo|medplus|pharmeasy|1mg|netmeds|hospital|clinic|doctor|health|insurance|fortis|manipal|narayana|practo|curefit|cult\.fit|gym|fitness/i, 'Health'],

  // Education
  [/byju|unacademy|coursera|udemy|vedantu|school|college|tuition|toppr|simplilearn|upgrad|great learning|scaler/i, 'Education'],

  // Travel
  [/makemytrip|cleartrip|goibibo|easemytrip|booking\.com|airbnb|oyo|agoda|yatra|ixigo|airasia|indigo|spicejet|air india|vistara|akasa|hotel(?!.*food)/i, 'Travel'],

  // Refund
  [/refund|cashback|reversal/i, 'Refund'],
]

export function assignCategory(merchant: string): string {
  for (const [pattern, category] of RULES) {
    if (pattern.test(merchant)) return category
  }
  return 'Other'
}
