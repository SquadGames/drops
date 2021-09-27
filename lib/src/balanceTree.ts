import { ethers } from 'ethers'

// Code for constructing Balance-based merkle trees

export interface Balance {
  recipient: string;
  amount: ethers.BigNumber;
}

export function toHexLeaf (balance: Balance): string {
  return ethers.utils
    .solidityKeccak256(['address', 'uint256'], [balance.recipient, balance.amount])
    .substr(2)
}

export function toLeaf (balance: Balance): Buffer {
  return Buffer.from(
    toHexLeaf(balance),
    'hex'
  )
}