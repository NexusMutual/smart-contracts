// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

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
uint constant C_ASSESSMENT       = 16384;
uint constant C_SWAP_OPERATOR    = 32768;
// todo: add more constants

// pause types constants
uint constant PAUSE_GLOBAL = 1;
uint constant PAUSE_RAMM   = 2;
// uint constant PAUSE_X      = 4;
// uint constant PAUSE_Y      = 8;

contract RegistryAware {

  IRegistry public immutable registry;

  error Paused(uint currentState, uint checks);
  error Unauthorized(address caller, uint callerIndex, uint authorizedBitmap);
  error NotEmergencyAdmin();

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

  function fetch(uint index) internal view returns (address) {
    return registry.getContractAddressByIndex(index);
  }

  constructor(address _registry) {
    registry = IRegistry(_registry);
  }

}
