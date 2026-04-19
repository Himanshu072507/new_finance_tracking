import { describe, it, expect } from 'vitest'
import { parseTransactions } from './parser'
import { assignCategory } from './categories'

describe('parseTransactions', () => {
  it('parses DD/MM/YYYY date format', () => {
    const text = '15/03/2026  SWIGGY TECHNOLOGIES     450.00 Dr'
    const results = parseTransactions(text, 'stmt-1', 'user-1')
    expect(results).toHaveLength(1)
    expect(results[0].date).toBe('2026-03-15')
    expect(results[0].merchant).toBe('SWIGGY TECHNOLOGIES')
    expect(results[0].amount).toBe(450.00)
    expect(results[0].type).toBe('debit')
  })

  it('parses DD MMM YYYY date format', () => {
    const text = '02 Apr 2026  UBER INDIA  350.00 Dr'
    const results = parseTransactions(text, 'stmt-1', 'user-1')
    expect(results).toHaveLength(1)
    expect(results[0].date).toBe('2026-04-02')
  })

  it('parses credit transactions', () => {
    const text = '10/03/2026  PAYMENT RECEIVED  5000.00 Cr'
    const results = parseTransactions(text, 'stmt-1', 'user-1')
    expect(results[0].type).toBe('credit')
  })

  it('parses amount with rupee symbol', () => {
    const text = '01/04/2026  AMAZON  ₹1,299.00'
    const results = parseTransactions(text, 'stmt-1', 'user-1')
    expect(results[0].amount).toBe(1299.00)
  })

  it('returns empty array for unparseable text', () => {
    const results = parseTransactions('no transactions here', 'stmt-1', 'user-1')
    expect(results).toHaveLength(0)
  })

  it('deduplicates identical transactions', () => {
    const line = '15/03/2026  SWIGGY  450.00 Dr'
    const text = `${line}\n${line}`
    const results = parseTransactions(text, 'stmt-1', 'user-1')
    expect(results).toHaveLength(1)
  })

  it('parses single-digit month date format', () => {
    const text = '15/3/2026  ZOMATO ORDER  320.00 Dr'
    const results = parseTransactions(text, 'stmt-1', 'user-1')
    expect(results).toHaveLength(1)
    expect(results[0].date).toBe('2026-03-15')
  })
})

describe('assignCategory', () => {
  it('assigns Food for swiggy', () => {
    expect(assignCategory('SWIGGY TECHNOLOGIES')).toBe('Food & Dining')
  })

  it('assigns Transport for uber', () => {
    expect(assignCategory('UBER INDIA BV')).toBe('Transport')
  })

  it('assigns Other for unknown merchant', () => {
    expect(assignCategory('RANDOM MERCHANT XYZ')).toBe('Other')
  })
})
