import { clearStore, test, assert, newMockEvent } from "matchstick-as/assembly/index"
import { ethereum, BigInt, Bytes, Address, crypto } from "@graphprotocol/graph-ts"

import {
  NewClaim,
  NewDrop,
  NewPayment
} from "../generated/Drops/Drops"
import {
  handleNewClaim,
  handleNewDrop,
  handleNewPayment
} from "./mapping"

export function runTests(): void {
  test("handles NewPayment with new split", () => {
    let splitString = "{split}"
    let fromString = "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7"
    let amountString = "1000"

    let newPayment = createNewPayment(
      splitString,
      Address.fromString(fromString),
      BigInt.fromString(amountString)
    )

    handleNewPayment(newPayment)

    let splitId = crypto.keccak256(
      Bytes.fromUTF8(newPayment.params.split)
    ).toHex()
    let paymentId = newPayment.transaction.hash.toHex()

    checkSplit(splitId, splitString)
    checkPayment(paymentId, splitId, fromString, amountString)
    
    clearStore()
  })

  test("handles NewPayment with existing split", () => {
    let splitString = "{split}"
    let fromString1 = "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7"
    let fromString2 = "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e8"
    let amountString = "1000"

    let newPayment1 = createNewPayment(
      splitString,
      Address.fromString(fromString1),
      BigInt.fromString(amountString)
    )
    let newPayment2 = createNewPayment(
      splitString,
      Address.fromString(fromString2),
      BigInt.fromString(amountString)
    )

    handleNewPayment(newPayment1)

    let splitId1 = crypto.keccak256(
      Bytes.fromUTF8(newPayment1.params.split)
    ).toHex()
    let paymentId1 = newPayment1.transaction.hash.toHex()

    checkSplit(splitId1, splitString)
    checkPayment(paymentId1, splitId1, fromString1, amountString)

    handleNewPayment(newPayment2)

    let splitId2 = crypto.keccak256(
      Bytes.fromUTF8(newPayment1.params.split)
    ).toHex()
    let paymentId2 = newPayment1.transaction.hash.toHex()

    checkSplit(splitId2, splitString)
    checkPayment(paymentId2, splitId2, fromString2, amountString)

    clearStore()
  })

  test("handles NewDrop", () => {
    let dropRoot = "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7"
    let dropBlockString = "10"
    let dropTotalString = "100000000"
    let dropIndexString = "1"

    let newDrop = createNewDrop(
      Address.fromString(dropRoot),
      BigInt.fromString(dropBlockString),
      BigInt.fromString(dropTotalString),
      BigInt.fromString(dropIndexString)
    )

    handleNewDrop(newDrop)

    let dropId = BigInt.fromString(dropIndexString).toHex()
    checkDrop(
      dropId,
      dropRoot,
      dropBlockString,
      dropTotalString,
      dropTotalString,
      dropIndexString
    )

    clearStore()
  })

  test("rejects NewClaim if referencing non-existant Drop", () => {
    let newClaim = createNewClaim(
      BigInt.fromString("0"),
      Address.fromString("0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7"),
      BigInt.fromString("1000"),
      false
    )

    handleNewClaim(newClaim)

    let claimId = newClaim.transaction.hash.toHex()
    assert.notInStore("Claim", claimId)

    clearStore()
  })

  test("rejects NewClaim if remaining would go below zero", () => {
    // create new drop
    let dropRoot = "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7"
    let dropBlockString = "10"
    let dropTotalString = "100"
    let dropIndexString = "1"

    let newDrop = createNewDrop(
      Address.fromString(dropRoot),
      BigInt.fromString(dropBlockString),
      BigInt.fromString(dropTotalString),
      BigInt.fromString(dropIndexString)
    )

    handleNewDrop(newDrop)

    // check drop
    let dropId = BigInt.fromString(dropIndexString).toHex()
    checkDrop(
      dropId,
      dropRoot,
      dropBlockString,
      dropTotalString,
      dropTotalString,
      dropIndexString
    )
    
    // create new claim
    let recipientString = "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7"
    let amountString = '1000'
    let wrapped = false

    let newClaim = createNewClaim(
      BigInt.fromString(dropIndexString),
      Address.fromString(recipientString),
      BigInt.fromString(amountString),
      wrapped
    )

    handleNewClaim(newClaim)

    // check claim did not get saved
    let claimId = newClaim.transaction.hash.toHex()
    assert.notInStore("Claim", claimId)

    clearStore()
  })

  test("handles NewClaim", () => {
    // create new drop
    let dropRoot = "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7"
    let dropBlockString = "10"
    let dropTotalString = "100000000"
    let dropIndexString = "1"

    let newDrop = createNewDrop(
      Address.fromString(dropRoot),
      BigInt.fromString(dropBlockString),
      BigInt.fromString(dropTotalString),
      BigInt.fromString(dropIndexString)
    )

    handleNewDrop(newDrop)

    // check drop
    let dropId = BigInt.fromString(dropIndexString).toHex()
    checkDrop(
      dropId,
      dropRoot,
      dropBlockString,
      dropTotalString,
      dropTotalString,
      dropIndexString
    )
    
    // create new claim
    let recipientString = "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7"
    let amountString = '100'
    let wrapped = false

    let newClaim = createNewClaim(
      BigInt.fromString(dropIndexString),
      Address.fromString(recipientString),
      BigInt.fromString(amountString),
      wrapped
    )

    handleNewClaim(newClaim)

    // check claim & drop updated remaining
    let claimId = newClaim.transaction.hash.toHex()
    checkClaim(
      claimId,
      dropId,
      recipientString,
      amountString,
      dropTotalString
    )

    clearStore()
  })
}

function createNewClaim(
  dropIndex: BigInt, 
  recipient: Address,
  amount: BigInt,
  wrapped: boolean
): NewClaim {
  let mockEvent = newMockEvent()
  let newClaim = new NewClaim(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  )

  let dropIndexParam = new ethereum.EventParam(
    "dropIndex", 
    ethereum.Value.fromUnsignedBigInt(dropIndex)
  )
  let recipientParam = new ethereum.EventParam(
    "recipient",
    ethereum.Value.fromAddress(recipient)
  )
  let amountParam = new ethereum.EventParam(
    "amount",
    ethereum.Value.fromUnsignedBigInt(amount)
  )
  let wrappedParam = new ethereum.EventParam(
    "wrapped",
    ethereum.Value.fromBoolean(wrapped)
  )

  newClaim.parameters = new Array()
  newClaim.parameters.push(dropIndexParam)
  newClaim.parameters.push(recipientParam)
  newClaim.parameters.push(amountParam)
  newClaim.parameters.push(wrappedParam)
  return newClaim
}

function createNewDrop(
  dropRoot: Bytes,
  dropBlock: BigInt,
  dropTotal: BigInt,
  dropIndex: BigInt
): NewDrop {
  let mockEvent = newMockEvent()
  let newDrop = new NewDrop(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  )

  let dropRootParam = new ethereum.EventParam(
    "dropRoot",
    ethereum.Value.fromBytes(dropRoot)
  )
  let dropBlockParam = new ethereum.EventParam(
    "dropBlock",
    ethereum.Value.fromUnsignedBigInt(dropBlock)
  )
  let dropTotalParam = new ethereum.EventParam(
    "dropTotal",
    ethereum.Value.fromUnsignedBigInt(dropTotal)
  )
  let dropIndexParam = new ethereum.EventParam(
    "dropIndex",
    ethereum.Value.fromUnsignedBigInt(dropIndex)
  )

  newDrop.parameters = new Array()
  newDrop.parameters.push(dropRootParam)
  newDrop.parameters.push(dropBlockParam)
  newDrop.parameters.push(dropTotalParam)
  newDrop.parameters.push(dropIndexParam)
  return newDrop
}

function createNewPayment(
  split: string,
  from: Address,
  amount: BigInt
): NewPayment {
  let mockEvent = newMockEvent()
  let newPayment = new NewPayment(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  )

  let splitParam = new ethereum.EventParam(
    "split",
    ethereum.Value.fromString(split)
  )
  let fromParam = new ethereum.EventParam(
    "from",
    ethereum.Value.fromAddress(from)
  )
  let amountParam = new ethereum.EventParam(
    "amount",
    ethereum.Value.fromUnsignedBigInt(amount)
  )

  newPayment.parameters = new Array()
  newPayment.parameters.push(splitParam)
  newPayment.parameters.push(fromParam)
  newPayment.parameters.push(amountParam)
  return newPayment
}

function checkSplit(splitId: string, splitString: string): void {
  assert.fieldEquals("Split", splitId, "splitString", splitString)
  // we cannot check payments, probably b/c derived fields are constructed at query time
  // assert.fieldEquals("Split", splitId, "payments", `[${paymentId}]`)
}

function checkPayment(
  paymentId: string,
  splitId: string,
  fromString: string,
  amountString: string
): void {
  assert.fieldEquals("Payment", paymentId, "split", splitId)
  assert.fieldEquals("Payment", paymentId, "from", fromString.toLowerCase())
  assert.fieldEquals("Payment", paymentId, "amount", amountString)
}

function checkDrop(
  dropId: string,
  dropRoot: string,
  dropBlockString: string,
  dropTotalString: string,
  dropRemainingString: string,
  dropIndexString: string
): void {
  assert.fieldEquals("Drop", dropId, "root", dropRoot.toLowerCase())
  assert.fieldEquals("Drop", dropId, "block", dropBlockString)
  assert.fieldEquals("Drop", dropId, "total", dropTotalString)
  assert.fieldEquals("Drop", dropId, "remaining", dropRemainingString)
  assert.fieldEquals("Drop", dropId, "index", dropIndexString)
}

function checkClaim(
  claimId: string,
  dropId: string,
  recipientString: string,
  amountString: string,
  prevTotalString: string
): void {
  let remaining = BigInt.fromString(prevTotalString)
    .minus(BigInt.fromString(amountString))
  assert.fieldEquals("Claim", claimId, "drop", dropId)
  assert.fieldEquals("Claim", claimId, "recipient", recipientString.toLowerCase())
  assert.fieldEquals("Claim", claimId, "amount", amountString)
  assert.fieldEquals("Claim", claimId, "wrapped", "false")
  assert.fieldEquals("Drop", dropId, "remaining", remaining.toString())
}