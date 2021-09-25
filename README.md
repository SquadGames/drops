A protocol that lets any number of revenue splits be pooled, and when funds are made available, recipients can claim funds from all revenue shared with them in one cheap transaction.

Particularly useful when many people expect to receive revenue shares from many different sources.

- `Drops` smart contract
    - State

        `bytes32[] dropRoots` 

        `uint256 unclaimedEth`

    - Events
        - `Payment(split string, address from, amount uint256)`
        - `Drop(bytes32 dropRoot, dropAmount uint256)`
        - `Claim(recipient address, amount uint256, dropNumber uint256)`
    - Public methods
        - `pay(split string, from address) payable`

            Takes in Ether

            emits `Payment` 

        - `claim(recipient address, amount uint256, dropNumber uint256, proof bytes32[])`

            looks up drop root from `dropRoots` using `dropNumber`

            verifies that `recipient, amount` are in payout root using `proof`

            marks this claim as claimed

            subtracts `amount` from `unclaimedEth`

            tries to transfer `amount` Eth to `recipient` 

            if `recipient` cannot accept Eth transfers wrapped Eth instead

            emits `Claim`

        - `multiClaim(recipients address[], amounts uint256[], dropNumbers uint256[], proofs bytes32[][])`

            Checks arrays are the same length

            Calls `claim` multiple times

        - `drop(bytes32 dropRoot, uint256 dropAmount) onlyOwner`

            checks that `address(this).balance - dropAmount > unclaimedEth`

            appends `dropRoot` to `dropRoots`

            adds `dropAmount` to `unclaimedEth`

            emits `Drop`

    - Other methods

        if ether is sent outside of `pay`, it rejects it (is this possible?)

- `Drops` subgraph

    listens to `Drops` contract

    - schema
        - Split

            id

            Share[]

            - type Share

                address

                basisPoints

        - Payment

            split

            amount

            blockNumber

        - Drop

            root

            total

            blockNumber

    - `Payment` mapping

        parses the split string into Share[]

        parses the split string into Share[]

        saves new Split if Id not already registered

        saves new Payment

    - `Drop` mapping

        saves new Drop

- `calcDrop` script

    looks up block of previous Drop

    looks up all Payments since that block

    calculates the new drops shares

    hashes the shares into a merkle tree

    returns the shares array and the merkle tree

- Example Payment endpoint

    **selling an NFT and rev sharing w/ drops**

    auction house style contract:

    - new auction sends NFT to contract and starts auction, includes split ID
    - people bid
    - winning bid is found, but payment is sent to Drops using `pay` and the split ID instead of directly to NFT owner
    - splitees wait for the next drop and withdraw funds then