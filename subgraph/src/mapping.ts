import { crypto, log, Bytes, BigInt } from "@graphprotocol/graph-ts"

import {
  NewClaim,
  NewDrop,
  NewPayment
} from "../generated/Drops/Drops"
import {
  Claim,
  Drop,
  Payment,
  Split
} from "../generated/schema"
export { runTests } from "./mapping.test"

export function handleNewClaim(event: NewClaim): void {
  // Load Drop and deduct claim amount from remaining
  let dropId = event.params.dropIndex.toHex()
  let drop = Drop.load(dropId)
  if (drop == null) {
    log.warning("Drop not found", [])
    return
  }
  if (drop.remaining < event.params.amount) {
    log.warning("Claim amount more than Drop remaining", [])
    return
  }
  drop.remaining = drop.remaining.minus(event.params.amount)
  drop.save()

  // Create Claim
  let claimId = event.transaction.hash.toHex()
  let claim = new Claim(claimId)
  claim.drop = dropId
  claim.amount = event.params.amount
  claim.recipient = event.params.recipient
  claim.wrapped = event.params.wrapped
  claim.save()
}

export function handleNewDrop(event: NewDrop): void {
  let dropId = event.params.dropIndex.toHex()
  let drop = new Drop(dropId)
  drop.root = event.params.dropRoot
  drop.block = event.params.dropBlock
  drop.index = event.params.dropIndex
  drop.total = event.params.dropTotal
  drop.remaining = event.params.dropTotal
  drop.save()
}

export function handleNewPayment(event: NewPayment): void {
  // Load or create Split
  let splitId = crypto.keccak256(
    Bytes.fromUTF8(event.params.split)
  ).toHex()
  let split = Split.load(splitId)
  if (split == null) {
    split = new Split(splitId)
    split.splitString = event.params.split
    split.save()
  }

  // Create Payment
  let paymentId = event.transaction.hash.toHex()
  let payment = new Payment(paymentId)
  payment.split = splitId
  payment.from = event.params.from
  payment.amount = event.params.amount
  payment.save()
}
