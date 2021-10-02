// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

contract TooMuchGas {
  fallback() external payable {
    // this uses too much gas
    uint256 count = 0;
    for(uint256 i = 0; i < 1 ether; i++) {
      count += 1;
    }
  }
}