# Drops
A protocol that lets any number of revenue splits be pooled, and when funds are made available, recipients can claim funds from all revenue shared with them in one cheap transaction.

Particularly useful when many people expect to receive revenue shares from many different sources.

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
4. The Drops contract owner, ideally a DAO controlled by previous recipients or similar so incentives are aligned around doing this properly, calls `drop` to add the new drop to the contract. It's vital that the owner be extremely trustworthy since they are responsible for unlocking _all_ funds sent to the contract, hence the DAO recommendation.
5. Anyone may withdraw amounts to the addresses with `claim` (or amounts for multiple drops with `multiClaim`).
6. Repeat.

## Example use case: selling an NFT and rev sharing w/ Drops
An auction house style contract where:
- New auction sends NFT to contract and starts auction, includes split string
- People bid
- Winning bid is found, payment is sent to Drops (instead of to NFT owner or other current variations) using `pay` and including the split string
- Splitees wait for the next drop to be added and withdraw funds then, along with any other funds they have been shared during the period.
