import { expect } from "chai"
import { BigNumber, Signer, providers } from "ethers"
import { ethers, waffle } from "hardhat"
import { getHexRoot, getHexProof, toHexLeaf, MerkleTree, Balance } from "@drops/lib"

import { Drops } from '../typechain/Drops'
import { Drops__factory } from '../typechain/factories/Drops__factory'
import config from '../config'
import {
  scenarioToDropData,
  Scenario,
  checkedPay,
  checkedDrop,
  checkedClaim,
  checkedMultiClaim,
  recipientsAndAmounts,
  checkClaimedArray,
  getProofs
} from './utils'

const scenarios: Scenario[] = [
  {
    payments: [BigNumber.from(10e10)],
    amounts: [
      BigNumber.from(1e10), 
      BigNumber.from(2e10), 
      BigNumber.from(3e10), 
      BigNumber.from(4e10)
    ]
  },
  {
    payments: [BigNumber.from(9e10)],
    amounts: [
      BigNumber.from(1e10), 
      BigNumber.from(2e10), 
      BigNumber.from(3e10), 
      BigNumber.from(3e10)
    ]
  }
]

describe('Drops', () => {
  let provider: providers.BaseProvider
  let signers: Signer[]
  let signer0: Signer
  let dropsSigner0: Drops

  beforeEach(async () => {
    provider = waffle.provider
    signers = await ethers.getSigners()
    if (!signers[0]) { throw new Error("no signer0") }
    signer0 = signers[0]
    const DropsFactory = new Drops__factory(signer0)
    dropsSigner0 = await DropsFactory.deploy(config.hardhat.WETH_ADDRESS)
  })

  describe('pay', () => {
    it('increases balance and emits Payment correctly', async () => {
      await checkedPay(
        provider, 
        dropsSigner0,
        "split",
        await signer0.getAddress(),
        ethers.utils.parseEther("1")
      )
    })

    it('reverts if value is 0', async () => {
      const split = "split"
      const from = await signer0.getAddress()
      const amount = ethers.utils.parseEther("0")

      await expect(dropsSigner0.pay(
        split,
        from,
        { value: amount }
      ))
        .to.be.revertedWith("Value was 0")
    })
  })

  describe('drop', () => {
    let tree: MerkleTree
    let paymentSum: BigNumber
    let block: providers.Block

    beforeEach(async () => {
      const scenario = scenarios[0]
      if (!scenario) { throw new Error("no scenario 0") }
      const dropData = await scenarioToDropData(scenario, signers)
      tree = dropData.tree
      const payments = dropData.payments
      paymentSum = dropData.paymentSum

      const split = "split"

      for(let i = 0; i < payments.length; i++) {
        const payment = payments[i]
        if (payment) {
          await checkedPay(
            provider,
            dropsSigner0,
            split,
            await signer0.getAddress(),
            payment
          )
        }
      }

      block = await provider.getBlock("latest")
    })

    it('updates dropRoots, dropBlocks, and unclaimedEth, and emits Drop', async () => {
      await checkedDrop(
        dropsSigner0,
        tree,
        block,
        paymentSum
      )
    })

    it('reverts if dropBlock is not less than tx block', async () => {
      block.number = block.number + 1e10
      await expect(dropsSigner0.drop(
        getHexRoot(tree),
        block.number,
        paymentSum
      ))
        .to.be.revertedWith("Drop block passed")
    })

    it('reverts if dropAmount + unclaimedEth is greater than contract balance', async () => {
      await expect(dropsSigner0.drop(
        getHexRoot(tree),
        block.number,
        paymentSum.add(1000)
      ))
        .to.be.revertedWith("Drop too large")
    })
  })

  describe('claim', () => {
    let tree: MerkleTree
    let balances: Balance[]
    let paymentSum: BigNumber

    beforeEach(async () => {
      const scenario = scenarios[0]
      if (!scenario) { throw new Error("no scenario 0") }
      const dropData = await scenarioToDropData(scenario, signers)
      tree = dropData.tree
      balances = dropData.balances
      const payments = dropData.payments
      paymentSum = dropData.paymentSum

      const split = "split"

      for(let i = 0; i < payments.length; i++) {
        const payment = payments[i]
        if (payment) {
          await checkedPay(
            provider,
            dropsSigner0,
            split,
            await signer0.getAddress(),
            payment
          )
        }
      }

      const block: providers.Block = await provider.getBlock("latest")
      
      await checkedDrop(
        dropsSigner0,
        tree,
        block,
        paymentSum
      )
    })

    it('updates claimed, transfers ETH to user, and emits Claim', async () => {
      await checkedClaim(
        provider,
        dropsSigner0,
        0,
        balances,
        0,
        tree
      )
    })

    it.skip('updates claimed, transfers WETH if ETH fails, and emits Claim', async () => {})

    it('reverts if drop does not exist', async () => {
      const dropNumber = 1
      const balance = balances[0]
      if (balance) {
        const proof = getHexProof(tree, toHexLeaf(balance))
        await expect(dropsSigner0.claim(
          dropNumber,
          balance.recipient,
          balance.amount,
          proof
        ))
          .to.be.revertedWith("Drop doesn't exist")
      }
    })

    it('reverts if recipient already claimed for this drop', async () => {
      const dropNumber = 0
      const balanceIndex = 0
      await checkedClaim(
        provider,
        dropsSigner0,
        0,
        balances,
        balanceIndex,
        tree
      )
      
      const balance = balances[balanceIndex]
      if (balance) {
        const proof = getHexProof(tree, toHexLeaf(balance))
        await expect(dropsSigner0.claim(
          dropNumber,
          balance.recipient,
          balance.amount,
          proof
        ))
          .to.be.revertedWith("Already claimed")
      }
    })

    it('reverts if proof is invalid', async () => {
      const dropNumber = 0
      const balance = balances[0]
      const balance2 = balances[1]
      if (balance && balance2) {
        const proof = getHexProof(tree, toHexLeaf(balance2))
        await expect(dropsSigner0.claim(
          dropNumber,
          balance.recipient,
          balance.amount,
          proof
        ))
          .to.be.revertedWith("Invalid proof")
      }
    })

    it('allows resubmission after trying with an invalid proof', async () => {
      const dropNumber = 0
      const balanceIndex = 0
      const balance = balances[balanceIndex]
      const balance2 = balances[1]
      if (balance && balance2) {
        const proof = getHexProof(tree, toHexLeaf(balance2))
        await expect(dropsSigner0.claim(
          dropNumber,
          balance.recipient,
          balance.amount,
          proof
        ))
          .to.be.revertedWith("Invalid proof")
      }

      await checkedClaim(
        provider,
        dropsSigner0,
        dropNumber,
        balances,
        balanceIndex,
        tree
      )
    })
  })

  describe('multiClaim', () => {
    let trees: MerkleTree[]
    let balancesArray: Balance[][]
    let paymentSums: BigNumber[]

    beforeEach(async () => {
      trees = []
      balancesArray = []
      paymentSums = []

      for(let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i]
        if (!scenario) { throw new Error("no scenario 0") }
        const dropData = await scenarioToDropData(scenario, signers)
        trees.push(dropData.tree)
        balancesArray.push(dropData.balances)
        const payments = dropData.payments
        paymentSums.push(dropData.paymentSum)

        const split = "split"

        for(let i = 0; i < payments.length; i++) {
          const payment = payments[i]
          if (payment) {
            await checkedPay(
              provider,
              dropsSigner0,
              split,
              await signer0.getAddress(),
              payment
            )
          }
        }

        const block: providers.Block = await provider.getBlock("latest")
      
        const tree = trees[i]
        if (!tree) { throw new Error("no tree") }
        const paymentSum = paymentSums[i]
        if (!paymentSum) { throw new Error("no payment sum") }

        await checkedDrop(
          dropsSigner0,
          tree,
          block,
          paymentSum
        )
      }
    })

    it('calls claim multiple times successfully', async () => {
      await checkedMultiClaim(
        provider,
        dropsSigner0,
        [0, 1],
        balancesArray,
        [0, 1],
        trees,
        await signer0.getAddress()
      )
    })

    it('reverts with wrong drop numbers', async () => {
      const balanceIndices = [0, 1]
      const dropNumbers = [1, 1] // [0, 1] would be valid
      const { recipients, amounts, balances } = 
        recipientsAndAmounts(balancesArray, balanceIndices)

      await checkClaimedArray(
        dropsSigner0,
        dropNumbers,
        recipients,
        false
      )

      const proofs = getProofs(trees, balances)

      await expect(dropsSigner0.multiClaim(
        dropNumbers,
        recipients,
        amounts,
        proofs
      ))
        .to.be.revertedWith("Invalid proof")
    })

    it('reverts with incorrect recipients', async () => {
      const balanceIndices = [0, 1]
      const dropNumbers = [0, 1] 
      const { recipients, amounts, balances } = 
        recipientsAndAmounts(balancesArray, balanceIndices)
      recipients[0] = ethers.Wallet.createRandom().address

      await checkClaimedArray(
        dropsSigner0,
        dropNumbers,
        recipients,
        false
      )

      const proofs = getProofs(trees, balances)

      await expect(dropsSigner0.multiClaim(
        dropNumbers,
        recipients,
        amounts,
        proofs
      ))
        .to.be.revertedWith("Invalid proof")
    })

    it('reverts with incorrect amounts', async () => {
      const balanceIndices = [0, 1]
      const dropNumbers = [0, 1] 
      const { recipients, amounts, balances } = 
        recipientsAndAmounts(balancesArray, balanceIndices)
      amounts[0] = BigNumber.from(1)

      await checkClaimedArray(
        dropsSigner0,
        dropNumbers,
        recipients,
        false
      )

      const proofs = getProofs(trees, balances)

      await expect(dropsSigner0.multiClaim(
        dropNumbers,
        recipients,
        amounts,
        proofs
      ))
        .to.be.revertedWith("Invalid proof")
    })

    it('reverts with incorrect proofs', async () => {
      const balanceIndices = [0, 1]
      const dropNumbers = [0, 1] 
      const { recipients, amounts, balances } = 
        recipientsAndAmounts(balancesArray, balanceIndices)

      await checkClaimedArray(
        dropsSigner0,
        dropNumbers,
        recipients,
        false
      )

      const proofs = getProofs(trees, balances)
      proofs[0] = [
        ethers.utils.id("fake"), // random strings
        ethers.utils.id("proof")
      ]

      await expect(dropsSigner0.multiClaim(
        dropNumbers,
        recipients,
        amounts,
        proofs
      ))
        .to.be.revertedWith("Invalid proof")
    })

    it('reverts if input arrays have different lengths', async () => {
      const balanceIndices = [0, 1]
      const dropNumbers = [0, 1] 
      const { recipients, amounts, balances } = 
        recipientsAndAmounts(balancesArray, balanceIndices)

      await checkClaimedArray(
        dropsSigner0,
        dropNumbers,
        recipients,
        false
      )

      const proofs = getProofs(trees, balances)
      proofs.push([
        ethers.utils.id("fake"),
        ethers.utils.id("proof")
      ])

      await expect(dropsSigner0.multiClaim(
        dropNumbers,
        recipients,
        amounts,
        proofs
      ))
        .to.be.revertedWith("Input array lengths mismatched")
    })
  })
})