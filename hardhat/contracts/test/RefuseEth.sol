// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

contract RefuseEth {
  fallback() external {
    // this is not payable
  }
}