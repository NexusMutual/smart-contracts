// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

abstract contract ReentrancyGuard {

  bool transient internal reentrancyLocked;

  error ReentrantCall();

  modifier nonReentrant() {
    require(!reentrancyLocked, ReentrantCall());
    reentrancyLocked = true;
    _;
    reentrancyLocked = false;
  }
}
