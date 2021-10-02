import { expect } from "chai"
import { BigNumber, Signer, providers } from "ethers"
import { makeMerkleTree, MerkleTree, getHexRoot, getHexProof, toHexLeaf, toLeaf, Balance } from "@drops/lib"

import { Drops } from '../typechain/Drops'

export interface TestDrop {
  payments: BigNumber[],
  amounts: BigNumber[]
}

export interface DropData {
  tree: MerkleTree,
  balances: Balance[],
  payments: BigNumber[],
  paymentSum: BigNumber
}

export async function fullDropData(testDrop: TestDrop, signers: (Signer | string)[]): Promise<DropData> {
  // check amounts total lte payments total
  const amountSum = testDrop.amounts.reduce(
    (total, a) => total = total.add(a), 
    BigNumber.from(0)
  )
  const paymentSum = testDrop.payments.reduce(
    (total, p) => total = total.add(p), 
    BigNumber.from(0)
  )
  expect(amountSum).to.be.lte(paymentSum, "testDrop sums")

  const balances: Balance[] = []
  const leaves: Buffer[] = []
  for(let i = 0; i < testDrop.amounts.length; i++) {
    const signer = signers[i]
    if (signer) {
      let recipient: string
      if (typeof signer === "string") {
        recipient = signer
      } else {
        recipient = await signer.getAddress()
      }
      const balance: Balance = {
        recipient,
        amount: BigNumber.from(testDrop.amounts[i])
      }
      balances.push(balance)
      leaves.push(toLeaf(balance))
    }
  }

  return {
    balances,
    tree: makeMerkleTree(leaves),
    payments: testDrop.payments,
    paymentSum
  }
}

export async function checkedPay(
  provider: providers.BaseProvider,
  drops: Drops, 
  split: string, 
  from: string, 
  amount: BigNumber
) {
  const balance1 = await provider.getBalance(drops.address)

  await expect(drops.pay(
    split,
    from,
    { value: amount }
  ))
    .to.emit(drops, "Payment")
    .withArgs(
      split,
      from,
      amount
    )

  const balance2 = await provider.getBalance(drops.address)
  expect(balance1.add(amount)).to.equal(balance2, "balance")
}

export async function checkedDrop(
  drops: Drops,
  tree: MerkleTree,
  block: providers.Block,
  paymentSum: BigNumber
) {
  const dropCount1 = await drops.dropCount()
  const unclaimedEth1 = await drops.unclaimedEth()

  await expect(drops.drop(
    getHexRoot(tree),
    block.number,
    paymentSum
  ))
    .to.emit(drops, "Drop")
    .withArgs(
      getHexRoot(tree),
      block.number,
      paymentSum,
      dropCount1.add(1)
    )

  const dropCount2 = await drops.dropCount()
  const lastDropRoot = await drops.dropRoots(dropCount2.sub(1))
  const lastDropBlock = await drops.dropBlocks(dropCount2.sub(1))
  const unclaimedEth2 = await drops.unclaimedEth()

  expect(dropCount2).to.eq(dropCount1.add(1), "drop count")
  expect(lastDropRoot).to.eq(getHexRoot(tree), "drop root")
  expect(lastDropBlock).to.eq(block.number, "drop block")
  expect(unclaimedEth2).to.eq(unclaimedEth1.add(paymentSum), "unclaimedEth")
}

export async function checkedClaim(
  provider: providers.BaseProvider,
  drops: Drops,
  dropNumber: number,
  balances: Balance[],
  balanceIndex: number,
  tree: MerkleTree
) {
  const balance = balances[balanceIndex]
  if (!balance) { throw new Error("no balance") }
  const claimed1 = await drops.isClaimed(
    dropNumber,
    balance.recipient
  )
  expect(claimed1).to.be.false

  const unclaimedEth1 = await drops.unclaimedEth()
  const contractBalance1 = await provider.getBalance(drops.address)
  const claimerBalance1 = await provider.getBalance(balance.recipient)

  const proof = getHexProof(tree, toHexLeaf(balance))

  const txResponse = await drops.claim(
    dropNumber,
    balance.recipient,
    balance.amount,
    proof
  )
  const txReceipt = await txResponse.wait()
  const gas = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

  const events = txReceipt.events
  if (!events) { throw new Error("no errors") }
  const event = events[0]
  if (!event) { throw new Error("no event") }
  const args = event.args
  if (!args) { throw new Error("no args") }
  expect(args.dropNumber).to.eq(dropNumber, "event drop number")
  expect(args.recipient).to.eq(balance.recipient, "event recipient")
  expect(args.amount).to.eq(balance.amount, "event amount")
  expect(args.wrapped).to.be.false

  const claimed2 = await drops.isClaimed(
    dropNumber,
    balance.recipient
  )
  expect(claimed2).to.be.true

  const unclaimedEth2 = await drops.unclaimedEth()
  expect(unclaimedEth2).to.eq(
    unclaimedEth1.sub(balance.amount),
    "unclaimedEth"
  )
  
  const contractBalance2 = await provider.getBalance(drops.address)
  expect(contractBalance2).to.eq(
    contractBalance1.sub(balance.amount), 
    "contract balance"
  )

  const claimerBalance2 = await provider.getBalance(balance.recipient)
  expect(claimerBalance2).to.eq(
    claimerBalance1.add(balance.amount).sub(gas), 
    "contract balance"
  )
}

export function recipientsAndAmounts(
  balancesArray: Balance[][], 
  balanceIndices: number[]
): { recipients: string[], amounts: BigNumber[], balances: Balance[] } {
  const recipients: string[] = []
  const amounts: BigNumber[] = []
  const resultBalances: Balance[] = []
  for(let i = 0; i < balancesArray.length; i ++) {
    const balances = balancesArray[i]
    if (!balances) { throw new Error("no balances") }
    const balanceIndex = balanceIndices[i]
    if (balanceIndex === undefined) { throw new Error("no balance index") }
    const balance = balances[balanceIndex]
    if (!balance) { throw new Error("no balance") }
    recipients.push(balance.recipient)
    amounts.push(balance.amount)
    resultBalances.push(balance)
  }
  return { recipients, amounts, balances: resultBalances }
}

export async function checkClaimedArray(
  drops: Drops,
  dropNumbers: number[], 
  recipients: string[],
  expectation: boolean
) {
  const claimedArray: boolean[] = []
  for(let i = 0; i < dropNumbers.length; i ++) {
    const dropNumber = dropNumbers[i]
    if (dropNumber === undefined) { throw new Error("no drop number") }
    const recipient = recipients[i]
    if (!recipient) { throw new Error("no recipient") }
    const result = await drops.isClaimed(
      dropNumber,
      recipient
    )
    expect(result).to.eq(expectation, "isClaimed")
    claimedArray.push()
  }
  return claimedArray
}

export async function getBalances(
  addresses: string[],
  provider: providers.BaseProvider
): Promise<BigNumber[]> {
  const balances: BigNumber[] = []
  for(let i = 0; i < addresses.length; i++) {
    const address = addresses[i]
    if (!address) { throw new Error("no address") }
    balances.push(await provider.getBalance(address))
  }
  return balances
}

export function getProofs(
  trees: MerkleTree[], 
  balances: Balance[]
): string[][] {
  const proofs: string[][] = []
  for(let i = 0; i < trees.length; i++) {
    const tree = trees[i]
    if (!tree) { throw new Error("no tree") }
    const balance = balances[i]
    if (!balance) { throw new Error("no balance") }
    proofs.push(getHexProof(
      tree,
      toHexLeaf(balance)
    ))
  }
  return proofs
}

export async function checkedMultiClaim(
  provider: providers.BaseProvider,
  drops: Drops,
  dropNumbers: number[],
  balancesArray: Balance[][],
  balanceIndices: number[],
  trees: MerkleTree[],
  operator: string
) {
  const { recipients, amounts, balances } = 
    recipientsAndAmounts(balancesArray, balanceIndices)

  await checkClaimedArray(
    drops,
    dropNumbers,
    recipients,
    false
  )

  const unclaimedEth1 = await drops.unclaimedEth()
  const contractBalance1 = await provider.getBalance(drops.address)
  const startingBalances = await getBalances(recipients, provider)

  const proofs = getProofs(trees, balances)

  const txResponse = await drops.multiClaim(
    dropNumbers,
    recipients,
    amounts,
    proofs
  )
  const txReceipt = await txResponse.wait()
  const gas = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

  let totalAmount = BigNumber.from(0)

  const events = txReceipt.events
  if (!events) { throw new Error("no errors") }
  for(let i = 0; i < events.length; i++) {
    const event = events[i]
    if (!event) { throw new Error("no event") }
    const args = event.args
    if (!args) { throw new Error("no args") }
    const dropNumber = dropNumbers[i]
    if (dropNumber === undefined) { throw new Error("no drop number") }
    const recipient = recipients[i]
    if (!recipient) { throw new Error("no recipient") }
    const amount = amounts[i]
    if (!amount) { throw new Error("no amount") }

    expect(args.dropNumber).to.eq(dropNumber, "event drop number")
    expect(args.recipient).to.eq(recipient, "event recipient")
    expect(args.amount).to.eq(amount, "event amount")
    expect(args.wrapped).to.be.false

    totalAmount = totalAmount.add(amount)

    const claimerBalance1 = startingBalances[i]
    if (!claimerBalance1) { throw new Error("no claimer balance") }

    const claimerBalance2 = await provider.getBalance(recipient)
    let claimerBalanceDerived = claimerBalance1.add(amount)
    if (recipient === operator) {
      claimerBalanceDerived = claimerBalanceDerived.sub(gas)
    }
    expect(claimerBalance2).to.eq(
      claimerBalanceDerived, 
      "contract balance"
    )
  }

  await checkClaimedArray(
    drops,
    dropNumbers,
    recipients,
    true
  )

  const unclaimedEth2 = await drops.unclaimedEth()
  expect(unclaimedEth2).to.eq(
    unclaimedEth1.sub(totalAmount),
    "unclaimedEth"
  )
  
  const contractBalance2 = await provider.getBalance(drops.address)
  expect(contractBalance2).to.eq(
    contractBalance1.sub(totalAmount), 
    "contract balance"
  )
}