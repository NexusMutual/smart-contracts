// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IProductsV1.sol";

contract ProductsV1 is IProductsV1 {
  function getNewProductId(address legacyProductId) external pure override returns (uint) {
    
    // Product: 0x v3
    // Type: protocol
    if (legacyProductId == 0xB27F1DB0a7e473304A5a06E54bdf035F671400C0) {
      return 0;
    }

    // Product: 1Inch (DEX & Liquidity Pools)
    // Type: protocol
    if (legacyProductId == 0x11111254369792b2Ca5d084aB5eEA397cA8fa48B) {
      return 1;
    }

    // Product: Aave v2
    // Type: protocol
    if (legacyProductId == 0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9) {
      return 2;
    }

    // Product: Abracadabra
    // Type: protocol
    if (legacyProductId == 0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce) {
      return 3;
    }

    // Product: Alchemix v2
    // Type: protocol
    if (legacyProductId == 0x5C6374a2ac4EBC38DeA0Fc1F8716e5Ea1AdD94dd) {
      return 4;
    }

    // Product: Alpaca Finance
    // Type: protocol
    if (legacyProductId == 0xA625AB01B08ce023B2a342Dbb12a16f2C8489A8F) {
      return 5;
    }

    // Product: Anchor
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000001) {
      return 6;
    }

    // Product: Angle
    // Type: protocol
    if (legacyProductId == 0xfdA462548Ce04282f4B6D6619823a7C64Fdc0185) {
      return 7;
    }

    // Product: Argent
    // Type: protocol
    if (legacyProductId == 0xB1dD690Cc9AF7BB1a906A9B5A94F94191cc553Ce) {
      return 8;
    }

    // Product: Aura
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000031) {
      return 9;
    }

    // Product: Babylon Finance
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000020) {
      return 10;
    }

    // Product: BadgerDAO
    // Type: protocol
    if (legacyProductId == 0x6354E79F21B56C11f48bcD7c451BE456D7102A36) {
      return 11;
    }

    // Product: Balancer v2
    // Type: protocol
    if (legacyProductId == 0xBA12222222228d8Ba445958a75a0704d566BF2C8) {
      return 12;
    }

    // Product: Bancor v2
    // Type: protocol
    if (legacyProductId == 0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C) {
      return 13;
    }

    // Product: Bancor v3
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000022) {
      return 14;
    }

    // Product: Beefy
    // Type: protocol
    if (legacyProductId == 0x453D4Ba9a2D594314DF88564248497F7D74d6b2C) {
      return 15;
    }

    // Product: Binance
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000007) {
      return 16;
    }

    // Product: BlockFi
    // Type: custodian
    if (legacyProductId == 0xC57D000000000000000000000000000000000002) {
      return 17;
    }

    // Product: Bundle: Gelt + mStable + Aave v2
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000018) {
      return 18;
    }

    // Product: Centrifuge Tinlake
    // Type: protocol
    if (legacyProductId == 0x0CED6166873038Ac0cc688e7E6d19E2cBE251Bf0) {
      return 19;
    }

    // Product: Coinbase
    // Type: custodian
    if (legacyProductId == 0xc57D000000000000000000000000000000000008) {
      return 20;
    }

    // Product: Compound v2
    // Type: protocol
    if (legacyProductId == 0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B) {
      return 21;
    }

    // Product: Convex 3CRV (cvx3CRV)
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000014) {
      return 22;
    }

    // Product: Convex Finance v1
    // Type: protocol
    if (legacyProductId == 0xF403C135812408BFbE8713b5A23a04b3D48AAE31) {
      return 23;
    }

    // Product: Convex stethCrv (cvxstethCrv)
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000013) {
      return 24;
    }

    // Product: Crypto.com
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000012) {
      return 25;
    }

    // Product: Curve 3pool LP (3Crv)
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000009) {
      return 26;
    }

    // Product: Curve All Pools (incl staking)
    // Type: protocol
    if (legacyProductId == 0x79a8C46DeA5aDa233ABaFFD40F3A0A2B1e5A4F27) {
      return 27;
    }

    // Product: Curve sETH LP (eCrv)
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000010) {
      return 28;
    }

    // Product: dydx Perpetual
    // Type: protocol
    if (legacyProductId == 0x364508A5cA0538d8119D3BF40A284635686C98c4) {
      return 29;
    }

    // Product: Ease
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000023) {
      return 30;
    }

    // Product: Enzyme v3
    // Type: protocol
    if (legacyProductId == 0x7e6d3b1161DF9c9c7527F68d651B297d2Fdb820B) {
      return 31;
    }

    // Product: Enzyme v4
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000032) {
      return 32;
    }

    // Product: Eth 2.0 (deposit contract)
    // Type: protocol
    if (legacyProductId == 0x00000000219ab540356cBB839Cbe05303d7705Fa) {
      return 33;
    }

    // Product: Euler
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000028) {
      return 34;
    }

    // Product: FODL
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000017) {
      return 35;
    }

    // Product: FTX
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000011) {
      return 36;
    }

    // Product: Gearbox V2
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000030) {
      return 37;
    }

    // Product: Gemini
    // Type: custodian
    if (legacyProductId == 0xc57d000000000000000000000000000000000010) {
      return 38;
    }

    // Product: GMX
    // Type: protocol
    if (legacyProductId == 0x3D6bA331e3D9702C5e8A8d254e5d8a285F223aba) {
      return 39;
    }

    // Product: Goldfinch
    // Type: protocol
    if (legacyProductId == 0x8481a6EbAf5c7DABc3F7e09e44A89531fd31F822) {
      return 40;
    }

    // Product: Hodlnaut
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000006) {
      return 41;
    }

    // Product: Kraken
    // Type: custodian
    if (legacyProductId == 0xc57d000000000000000000000000000000000009) {
      return 42;
    }

    // Product: Ledn
    // Type: custodian
    if (legacyProductId == 0xC57D000000000000000000000000000000000005) {
      return 43;
    }

    // Product: Liquid Collective
    // Type: eth2slashing
    if (legacyProductId == 0x0000000000000000000000000000000000000033) {
      return 44;
    }

    // Product: Liquity
    // Type: protocol
    if (legacyProductId == 0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2) {
      return 45;
    }

    // Product: MakerDAO MCD
    // Type: protocol
    if (legacyProductId == 0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B) {
      return 46;
    }

    // Product: mStable
    // Type: protocol
    if (legacyProductId == 0xAFcE80b19A8cE13DEc0739a1aaB7A028d6845Eb3) {
      return 47;
    }

    // Product: Nested
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000027) {
      return 48;
    }

    // Product: Nexo
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000003) {
      return 49;
    }

    // Product: Notional Finance v2
    // Type: protocol
    if (legacyProductId == 0x1344A36A1B56144C3Bc62E7757377D288fDE0369) {
      return 50;
    }

    // Product: OlympusDAO
    // Type: protocol
    if (legacyProductId == 0x575409F8d77c12B05feD8B455815f0e54797381c) {
      return 51;
    }

    // Product: Opyn v2
    // Type: protocol
    if (legacyProductId == 0x7C06792Af1632E77cb27a558Dc0885338F4Bdf8E) {
      return 52;
    }

    // Product: Origin OUSD
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000016) {
      return 53;
    }

    // Product: Pangolin
    // Type: protocol
    if (legacyProductId == 0xefa94DE7a4656D787667C749f7E1223D71E9FD88) {
      return 54;
    }

    // Product: Perpetual Protocol
    // Type: protocol
    if (legacyProductId == 0xA51156F3F1e39d1036Ca4ba4974107A1C1815d1e) {
      return 55;
    }

    // Product: Pool Together v4
    // Type: protocol
    if (legacyProductId == 0xd89a09084555a7D0ABe7B111b1f78DFEdDd638Be) {
      return 56;
    }

    // Product: Premia Finance
    // Type: protocol
    if (legacyProductId == 0x48D49466CB2EFbF05FaA5fa5E69f2984eDC8d1D7) {
      return 57;
    }

    // Product: Rari Capital
    // Type: protocol
    if (legacyProductId == 0x835482FE0532f169024d5E9410199369aAD5C77E) {
      return 58;
    }

    // Product: Reflexer
    // Type: protocol
    if (legacyProductId == 0xCC88a9d330da1133Df3A7bD823B95e52511A6962) {
      return 59;
    }

    // Product: Ribbon Finance v2
    // Type: protocol
    if (legacyProductId == 0x25751853Eab4D0eB3652B5eB6ecB102A2789644B) {
      return 60;
    }

    // Product: Safe (formerly, Gnosis Safe)
    // Type: protocol
    if (legacyProductId == 0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F) {
      return 61;
    }

    // Product: Set Protocol
    // Type: protocol
    if (legacyProductId == 0x5B67871C3a857dE81A1ca0f9F7945e5670D986Dc) {
      return 62;
    }

    // Product: Set Protocol v2
    // Type: protocol
    if (legacyProductId == 0xa4c8d221d8BB851f83aadd0223a8900A6921A349) {
      return 63;
    }

    // Product: Sherlock
    // Type: sherlock
    if (legacyProductId == 0x0000000000000000000000000000000000000029) {
      return 64;
    }

    // Product: Stake DAO
    // Type: protocol
    if (legacyProductId == 0xB17640796e4c27a39AF51887aff3F8DC0daF9567) {
      return 65;
    }

    // Product: Stakewise 3rd party (3 ETH / validator)
    // Type: eth2slashing
    if (legacyProductId == 0x0000000000000000000000000000000000000026) {
      return 66;
    }

    // Product: Stakewise operated (3 ETH / validator)
    // Type: eth2slashing
    if (legacyProductId == 0x0000000000000000000000000000000000000025) {
      return 67;
    }

    // Product: SushiSwap v1
    // Type: protocol
    if (legacyProductId == 0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd) {
      return 68;
    }

    // Product: Synthetix
    // Type: protocol
    if (legacyProductId == 0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F) {
      return 69;
    }

    // Product: THORChain (Thorchain Network)
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000004) {
      return 70;
    }

    // Product: Trader Joe
    // Type: protocol
    if (legacyProductId == 0x60aE616a2155Ee3d9A68541Ba4544862310933d4) {
      return 71;
    }

    // Product: Uniswap v2
    // Type: protocol
    if (legacyProductId == 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f) {
      return 72;
    }

    // Product: Uniswap v3
    // Type: protocol
    if (legacyProductId == 0x1F98431c8aD98523631AE4a59f267346ea31F984) {
      return 73;
    }

    // Product: Vector
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000021) {
      return 74;
    }

    // Product: Vesper
    // Type: protocol
    if (legacyProductId == 0xa4F1671d3Aee73C05b552d57f2d16d3cfcBd0217) {
      return 75;
    }

    // Product: Yearn Finance (all vaults)
    // Type: protocol
    if (legacyProductId == 0x9D25057e62939D3408406975aD75Ffe834DA4cDd) {
      return 76;
    }

    // Product: Yearn yvUSDC v2
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000007) {
      return 77;
    }

    // Product: Yeti Finance
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000019) {
      return 78;
    }

    // Product: Yield.app
    // Type: custodian
    if (legacyProductId == 0xc57d000000000000000000000000000000000013) {
      return 79;
    }

    revert("Invalid product!");
  }
}
