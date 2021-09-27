import { expect } from "chai"
import { BigNumber, Signer, providers } from "ethers"
import { ethers, waffle } from "hardhat"
import { makeMerkleTree, MerkleTree, getHexRoot, toHexLeaf, toLeaf, Balance } from "@drops/lib"

import { Drops } from '../typechain/Drops'
import { Drops__factory } from '../typechain/factories/Drops__factory'
import config from '../config'

interface Scenario {
  payments: BigNumber[],
  amounts: BigNumber[]
}

const scenario: Scenario = {
  payments: [BigNumber.from(10e10)],
  amounts: [
    BigNumber.from(1e10), 
    BigNumber.from(2e10), 
    BigNumber.from(3e10), 
    BigNumber.from(4e10)
  ]
}

interface DropData {
  tree: MerkleTree,
  balances: Balance[],
  payments: BigNumber[],
  paymentSum: BigNumber
}

async function scenarioToDropData(scenario: Scenario, signers: Signer[]): Promise<DropData> {
  // check amounts total lte payments total
  const amountSum = scenario.amounts.reduce(
    (total, a) => total = total.add(a), 
    BigNumber.from(0)
  )
  const paymentSum = scenario.payments.reduce(
    (total, p) => total = total.add(p), 
    BigNumber.from(0)
  )
  expect(amountSum).to.be.lte(paymentSum, "scenario sums")

  const balances: Balance[] = []
  const leaves: Buffer[] = []
  for(let i = 0; i < scenario.amounts.length; i++) {
    const signer = signers[i]
    if (signer) {
      const balance: Balance = {
        recipient: await signer.getAddress(),
        amount: BigNumber.from(scenario.amounts[i])
      }
      balances.push(balance)
      leaves.push(toLeaf(balance))
    }
  }

  return {
    balances,
    tree: makeMerkleTree(leaves),
    payments: scenario.payments,
    paymentSum
  }
}

async function checkedPay(
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

async function checkedDrop(
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
    it('updates dropRoots, dropBlocks, and unclaimedEth, and emits Drop', async () => {
      const { tree, balances, payments, paymentSum } = await scenarioToDropData(scenario, signers)
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

    it('reverts if dropBlock is not less than tx block', async () => {
      
    })

    it('reverts if dropAmount + unclaimedEth is greater than contract balance', async () => {
      
    })
  })

  describe('claim', () => {
    it('updates claimed, transfers ETH or WETH, and emits Claim', async () => {
      
    })

    it('reverts if drop does not exist', async () => {
      
    })

    it('reverts if recipient already claimed for this drop', async () => {
      
    })

    it('reverts if proof is invalid', async () => {
      
    })

    it('allows resubmission after trying with an invalid proof', async () => {
      
    })
  })

  describe('multiClaim', () => {
    it('calls claim multiple times successfully', async () => {
      
    })

    it('reverts if any single set of claim inputs is invalid', async () => {
      
    })

    it('reverts if input arrays have different lengths', async () => {
      
    })
  })
})