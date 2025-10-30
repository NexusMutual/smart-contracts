// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../interfaces/IRegistry.sol";

// contract indexes
uint constant C_REGISTRY             = 1 << 0;   // 1
uint constant C_GOVERNOR             = 1 << 1;   // 2
uint constant C_TOKEN                = 1 << 2;   // 4
uint constant C_TOKEN_CONTROLLER     = 1 << 3;   // 8
uint constant C_POOL                 = 1 << 4;   // 16
uint constant C_COVER                = 1 << 5;   // 32
uint constant C_COVER_PRODUCTS       = 1 << 6;   // 64
uint constant C_STAKING_PRODUCTS     = 1 << 7;   // 128
uint constant C_RAMM                 = 1 << 8;   // 256
uint constant C_SAFE_TRACKER         = 1 << 9;   // 512
uint constant C_LIMIT_ORDERS         = 1 << 10;  // 1024
uint constant C_STAKING_NFT          = 1 << 11;  // 2048
uint constant C_COVER_NFT            = 1 << 12;  // 4096
uint constant C_SWAP_OPERATOR        = 1 << 13;  // 8192
uint constant C_ASSESSMENTS          = 1 << 14;  // 16384
uint constant C_CLAIMS               = 1 << 15;  // 32768
uint constant C_STAKING_POOL_FACTORY = 1 << 16;  // 65536

// pause types constants
uint constant PAUSE_GLOBAL        = 1 << 0;   // 1
uint constant PAUSE_RAMM          = 1 << 1;   // 2
uint constant PAUSE_SWAPS         = 1 << 2;   // 4
uint constant PAUSE_MEMBERSHIP    = 1 << 3;   // 8
uint constant PAUSE_ASSESSMENTS   = 1 << 4;   // 16
uint constant PAUSE_CLAIMS        = 1 << 5;   // 32
uint constant PAUSE_COVER         = 1 << 6;   // 64

contract RegistryAware {

  IRegistry public immutable registry;

  error Paused(uint currentState, uint checks);
  error Unauthorized(address caller, uint callerIndex, uint authorizedBitmap);
  error OnlyMember();
  error OnlyAdvisoryBoard();

  modifier whenNotPaused(uint mask) {
    uint config = registry.getPauseConfig();
    uint maskWithGlobal = mask | PAUSE_GLOBAL;
    require(config & maskWithGlobal == 0, Paused(config, mask));
    _;
  }

  modifier onlyContracts(uint authorizedBitmap) {
    uint callerIndex = msg.sender == address(registry)
      ? C_REGISTRY
      : registry.getContractIndexByAddress(msg.sender);
    bool isAuthorized = callerIndex & authorizedBitmap != 0;
    require(isAuthorized, Unauthorized(msg.sender, callerIndex, authorizedBitmap));
    _;
  }

  modifier onlyAdvisoryBoard() {
    require(registry.isAdvisoryBoardMember(msg.sender), OnlyAdvisoryBoard());
    _;
  }

  modifier onlyMember() {
    require(registry.isMember(msg.sender), OnlyMember());
    _;
  }

  function fetch(uint index) internal view returns (address) {
    return registry.getContractAddressByIndex(index);
  }

  constructor(address _registry) {
    registry = IRegistry(_registry);
  }

}
