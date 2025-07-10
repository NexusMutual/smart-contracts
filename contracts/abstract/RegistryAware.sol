// SPDX-License-Identifier: GPL-3.0-only

// TODO: this is a temp copy from the gov updates

pragma solidity ^0.8.28;

import "../interfaces/IRegistry.sol";

// contract indexes
uint constant C_REGISTRY         = 1;
uint constant C_GOVERNOR         = 2;
uint constant C_TOKEN            = 4;
uint constant C_TOKEN_CONTROLLER = 8;
uint constant C_POOL             = 16;
uint constant C_MEMBER_ROLES     = 32;
uint constant C_COVER            = 64;
uint constant C_COVER_PRODUCTS   = 128;
uint constant C_STAKING_PRODUCTS = 256;
uint constant C_RAMM             = 512;
uint constant C_SAFE_TRACKER     = 1024;
uint constant C_LIMIT_ORDERS     = 2048;
uint constant C_STAKING_NFT      = 4096;
uint constant C_COVER_NFT        = 8192;
uint constant C_SWAP_OPERATOR    = 16384;
uint constant C_ASSESSMENT       = 32768;
uint constant C_CLAIMS           = 65536;

// pause types constants
uint constant PAUSE_GLOBAL       = 1;
uint constant PAUSE_RAMM         = 2;
uint constant PAUSE_SWAPS        = 4;

contract RegistryAware {

  IRegistry public immutable registry;

  error Paused(uint currentState, uint checks);
  error Unauthorized(address caller, uint callerIndex, uint authorizedBitmap);

  modifier whenNotPaused(uint mask) {
    uint config = registry.getPauseConfig();
    bool isPaused = (config & PAUSE_GLOBAL) != 0 || (config & mask) != 0;
    require(!isPaused, Paused(config, mask));
    _;
  }

  modifier onlyContracts(uint authorizedBitmap) {
    uint callerIndex = registry.getContractIndexByAddress(msg.sender);
    bool isAuthorized = callerIndex & authorizedBitmap != 0;
    require(isAuthorized, Unauthorized(msg.sender, callerIndex, authorizedBitmap));
    _;
  }

  // TODO: find a better short name for this function
  function fetch(uint index) internal view returns (address) {
    return registry.getContractAddressByIndex(index);
  }

  constructor(address _registry) {
    registry = IRegistry(_registry);
  }

}
