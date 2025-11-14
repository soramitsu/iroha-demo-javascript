import { describe, expect, it } from 'vitest'
import {
  generateMnemonicWords,
  mnemonicToPrivateKeyHex,
  normalizeMnemonicPhrase
} from '@/utils/mnemonic'

const deterministicBytes = (bytes: number) => {
  const out = new Uint8Array(bytes)
  for (let i = 0; i < bytes; i += 1) {
    out[i] = i & 0xff
  }
  return out
}

describe('mnemonic helpers', () => {
it('generates the requested number of words', () => {
  const words = generateMnemonicWords(12)
  expect(words).toHaveLength(12)
  expect(words.every((word) => typeof word === 'string' && word.length > 0)).toBe(true)
})

  it('derives a private key from a known mnemonic', () => {
    const phrase = normalizeMnemonicPhrase(
      'abandon  abandon abandon   abandon abandon abandon  abandon abandon abandon abandon abandon about'
    )
    const privateKeyHex = mnemonicToPrivateKeyHex(phrase)
    expect(privateKeyHex).toBe('5EB00BBDDCF069084889A8AB9155568165F5C453CCB85E70811AAED6F6DA5FC1')
  })
})
