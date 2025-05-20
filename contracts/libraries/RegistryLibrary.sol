// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../interfaces/IRegistry.sol";

library RegistryLibrary {

  // contract indexes
  uint constant C_REGISTRY         = 1;
  uint constant C_TOKEN            = 2;
  uint constant C_GOVERNOR         = 4;
  uint constant C_TOKEN_CONTROLLER = 8;
  uint constant C_POOL             = 16;
  uint constant C_MEMBER_ROLES     = 32;
  uint constant C_COVER            = 64;
  uint constant C_STAKING_PRODUCTS = 128;
  uint constant C_RAMM             = 256;
  uint constant C_COVER_PRODUCTS   = 512;
  uint constant C_SAFE_TRACKER     = 1024;
  uint constant C_LIMIT_ORDERS     = 2048;
  uint constant C_STAKING_NFT      = 4096;
  uint constant C_COVER_NFT        = 8192;
  // todo: add more constants

  // pause types constants
  uint constant PAUSE_GLOBAL = 1;
  uint constant PAUSE_RAMM   = 2;
  // uint constant PAUSE_X      = 4;
  // uint constant PAUSE_Y      = 8;

}
