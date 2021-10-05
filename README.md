# Drops
A protocol that lets any number of revenue splits be pooled into periodic "merkle drops." When a new drop is created, recipients can claim funds from all revenue shared with them during the previous period in one cheap transaction.

Particularly useful when many people expect to receive revenue shares from many different sources over extended periods of time (i.e. a world where rev shares are an important part of people's income).

## Approach
The Drops contract resembles [Mirror's Splitter](https://github.com/mirror-xyz/splits/blob/main/contracts/Splitter.sol) contract, with a few modifications:
- Some things have been renamed (e.g. windows -> drops)
- Each window has its own merkle root
- Only the owner can add new merkle roots
- Merkle leaves are hashed from recipient + amount instead of recipient + percentage
- a payable `pay` function and `Payment` event have been added that take and emit a `split` string

The process for using the contract is as follows:
1. Payment endpoints seeking to split revenue send Eth to the contract using the `pay` function, including their revenue share information as a JSON string (`"[{"recipient": "0x1234...", "basisPoints": "5000"}, ...]"`).
2. A subgraph reads and records the resulting `Payment` events.
3. Anyone uses a script to read the subgraph and calculate the total funds _all_ recipients received during a period, generating a set of addresses and amounts and a merkle tree. The addresses and amounts are stored publicly off-chain.
4. The Drops contract owner calls `drop` to add the new drop to the contract. It's vital that the owner be extremely trustworthy since they are responsible for unlocking _all_ funds sent to the contract.
5. Anyone may withdraw amounts to the addresses with `claim` (or amounts for multiple drops with `multiClaim`).
6. Repeat.

## Achieving a trusted contract owner
As mentioned above, this system requires a resilient, secure way to add new drops to the contract. One way to achieve that might be to have the contract owned by a DAO where everyone paid in a preivous Drop _and_ verified in a sybil-resistance system (like BrightId) gets 1 vote.

A second method could be to add a dispute system like Kleros Court between the owner and the contract, allowing people to challenge the correctness of a new Drop before it goes into effect.

A third option could be to use an oracle system like Chainlink or API3 to calculate new merkleroots and upload new Drops.

## Example use case: selling an NFT and rev sharing w/ Drops
An auction house style contract where:
- `newAuction` sends NFT to contract and starts auction, includes split string
- People bid
- Winning bid is found, payment is sent to Drops (instead of to NFT owner or other current variations) using `pay` and including the split string
- Splitees wait for the next drop to be added and withdraw funds then, along with any other funds they have been shared during the period.

## Future improvements
Longer term, there is an improved version of the system that allows on-demand withdrawals:
- Contract accepts payments
- Contract emits events with split information for each payment (or off-chain signed messages from the payers)
- Off-chain system reads this payment/split information and maintains a constant withdrawal balance for everyone
- Anyone with a positive balance can request the off-chain system to give them a withdrawal
- If they do, the system sends that person a signed message they can submit to the contract to withdraw their pay and subtracts the amount from their balance in the off-chain system
