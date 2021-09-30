// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint256 value) external returns (bool);
}

/**
 * @title Drops
 *
 * Can pool any number of revenue splits into periodic "drops."
 * Requires a trusted owner (DAO) to calculate shares and make new drops.
 *
 * Extends work by other teams:
 * https://github.com/mirror-xyz/splits
 * https://github.com/Uniswap/merkle-distributor
 *
 */
contract Drops is Ownable {
  //======== State ========

  IWETH public weth;

  // Merkle roots for each drop
  bytes32[] public dropRoots;

  // Last block where payments were included for each drop
  uint256[] public dropBlocks;

  // Total eth included in drops yet to be claimed
  uint256 public unclaimedEth;

  mapping(bytes32 => bool) internal claimed;


  //======== Events ========
  
  event Payment(string split, address from, uint256 amount);

  event Drop(
    bytes32 dropRoot, 
    uint256 dropBlock, 
    uint256 dropTotal,
    uint256 dropCount
  );

  event Claim(
    uint256 dropNumber, 
    address recipient, 
    uint256 amount,
    bool wrapped
  );


  //======== Constructor ========

  constructor(address wethAddress) {
    weth = IWETH(wethAddress);
  }


  //======== External Functions ========

  function pay(string calldata split, address from) external payable {
    require(msg.value > 0, "Value was 0");
    emit Payment(split, from, msg.value);
  }

  function drop(
    bytes32 dropRoot, 
    uint256 dropBlock, 
    uint256 dropAmount
  ) external onlyOwner {
    require(dropBlock < block.number, "Drop block passed");
    require(
      dropAmount + unclaimedEth <= address(this).balance,
      "Drop too large"
    );
    dropRoots.push(dropRoot);
    dropBlocks.push(dropBlock);
    unclaimedEth += dropAmount;
    emit Drop(dropRoot, dropBlock, dropAmount, dropRoots.length);
  }

  function multiClaim(
    uint256[] calldata dropNumbers,
    address[] calldata recipients, 
    uint256[] calldata amounts, 
    bytes32[][] calldata proofs
  ) external {
    require(
      recipients.length == amounts.length &&
      amounts.length == dropNumbers.length &&
      dropNumbers.length == proofs.length,
      "Input array lengths mismatched"
    );
    for (uint256 i = 0; i < recipients.length; i++) {
      claim(
        dropNumbers[i],
        recipients[i],
        amounts[i],
        proofs[i]
      );
    }
  }

  function dropCount() external view returns(uint256) {
    return dropRoots.length;
  }
  

  //======== Public Functions ========

  function claim(
    uint256 dropNumber,
    address recipient, 
    uint256 amount,  
    bytes32[] calldata proof
  ) public {
    require(dropRoots.length > dropNumber, "Drop doesn't exist");
    require(!isClaimed(dropNumber, recipient), "Already claimed");
    claimed[getClaimHash(dropNumber, recipient)] = true;
    require(
      verifyProof(
        proof, 
        dropRoots[dropNumber], 
        getLeaf(recipient, amount)
      ),
      "Invalid proof"
    );
    bool wrapped = transferETHOrWETH(recipient, amount);
    unclaimedEth -= amount;
    emit Claim(dropNumber, recipient, amount, wrapped);
  }

  function isClaimed(
    uint256 dropNumber, 
    address recipient
  ) public view returns (bool) {
    return claimed[getClaimHash(dropNumber, recipient)];
  }


  //======== Private Functions ========
  
  function transferETHOrWETH(
    address to, 
    uint256 value
  ) private returns (bool) {
    // Try to transfer ETH to the given recipient.
    bool didSucceed = attemptETHTransfer(to, value);
    if (!didSucceed) {
      // If the transfer fails, wrap and send as WETH.
      weth.deposit{value: value}();
      weth.transfer(to, value);
    }
    return !didSucceed;
  }

  function attemptETHTransfer(
    address to, 
    uint256 value
  ) private returns (bool) {
    // Here increase the gas limit a reasonable amount above the default, and try
    // to send ETH to the recipient.
    // NOTE: This might allow the recipient to attempt a limited reentrancy attack, 
    // but this should be guarded against by setting claimed first.
    (bool success, ) = to.call{value: value, gas: 30000}("");
    return success;
  }

  function getClaimHash(
    uint256 dropNumber, 
    address recipient
  ) private pure returns (bytes32) {
    return keccak256(abi.encodePacked(dropNumber, recipient));
  }

  function getLeaf(
    address recipient, 
    uint256 amount
  ) private pure returns (bytes32) {
    return keccak256(abi.encodePacked(recipient, amount));
  }

  // From https://github.com/protofire/zeppelin-solidity/blob/master/contracts/MerkleProof.sol
  function verifyProof(
    bytes32[] calldata proof,
    bytes32 root,
    bytes32 leaf
  ) private pure returns (bool) {
    bytes32 computedHash = leaf;

    for (uint256 i = 0; i < proof.length; i++) {
      bytes32 proofElement = proof[i];

      if (computedHash <= proofElement) {
        // Hash(current computed hash + current element of the proof)
        computedHash = keccak256(
          abi.encodePacked(computedHash, proofElement)
        );
      } else {
        // Hash(current element of the proof + current computed hash)
        computedHash = keccak256(
          abi.encodePacked(proofElement, computedHash)
        );
      }
    }

    // Check if the computed hash (root) is equal to the provided root
    return computedHash == root;
  }
}