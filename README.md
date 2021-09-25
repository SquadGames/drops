A protocol that lets any number of revenue splits be pooled, and when funds are made available, recipients can claim funds from all revenue shared with them in one cheap transaction.

Particularly useful when many people expect to receive revenue shares from many different sources.

- Example Payment endpoint

    **selling an NFT and rev sharing w/ drops**

    auction house style contract:

    - new auction sends NFT to contract and starts auction, includes split ID
    - people bid
    - winning bid is found, but payment is sent to Drops using `pay` and the split ID instead of directly to NFT owner
    - splitees wait for the next drop and withdraw funds then
