// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IProductsV1.sol";

contract ProductsV1 is IProductsV1 {
  function getNewProductId(address legacyProductId) external pure override returns (uint) {
    
    // Product: Compound Sai
    // Type: protocol
    if (legacyProductId == 0xF5DCe57282A584D2746FaF1593d3121Fcac444dC) {
      return 0;
    }

    // Product: Unknown
    // Type: protocol
    if (legacyProductId == 0x5504a1d88005236147EC86C62cfb53043bD1276a) {
      return 1;
    }

    // Product: 0x v2.1
    // Type: protocol
    if (legacyProductId == 0x080bf510FCbF18b91105470639e9561022937712) {
      return 2;
    }

    // Product: iearn yDAI v1
    // Type: protocol
    if (legacyProductId == 0x16de59092dAE5CcF4A1E6439D611fd0653f0Bd01) {
      return 3;
    }

    // Product: Compound DAI
    // Type: protocol
    if (legacyProductId == 0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643) {
      return 4;
    }

    // Product: Uniswap Exchange Template
    // Type: protocol
    if (legacyProductId == 0x2157A7894439191e520825fe9399aB8655E0f708) {
      return 5;
    }

    // Product: Bancor ETHBNT Token
    // Type: protocol
    if (legacyProductId == 0xb1CD6e4153B2a390Cf00A6556b0fC1458C4A5533) {
      return 6;
    }

    // Product: Pool Together DAI
    // Type: protocol
    if (legacyProductId == 0x29fe7D60DdF151E5b52e5FAB4f1325da6b2bD958) {
      return 7;
    }

    // Product: Pool Together SAI
    // Type: protocol
    if (legacyProductId == 0xb7896fce748396EcFC240F5a0d3Cc92ca42D7d84) {
      return 8;
    }

    // Product: Argent
    // Type: protocol
    if (legacyProductId == 0xB1dD690Cc9AF7BB1a906A9B5A94F94191cc553Ce) {
      return 9;
    }

    // Product: dydx Perpetual
    // Type: protocol
    if (legacyProductId == 0x364508A5cA0538d8119D3BF40A284635686C98c4) {
      return 10;
    }

    // Product: DAI Token
    // Type: protocol
    if (legacyProductId == 0x6B175474E89094C44Da98b954EedeAC495271d0F) {
      return 11;
    }

    // Product: Compound v2
    // Type: protocol
    if (legacyProductId == 0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B) {
      return 12;
    }

    // Product: Gnosis Safe
    // Type: protocol
    if (legacyProductId == 0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F) {
      return 13;
    }

    // Product: MakerDAO MCD
    // Type: protocol
    if (legacyProductId == 0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B) {
      return 14;
    }

    // Product: Aave Lending Core
    // Type: protocol
    if (legacyProductId == 0x3dfd23A6c5E8BbcFc9581d2E864a68feb6a076d3) {
      return 15;
    }

    // Product: Yearn Finance (all vaults)
    // Type: protocol
    if (legacyProductId == 0x9D25057e62939D3408406975aD75Ffe834DA4cDd) {
      return 16;
    }

    // Product: Idle v3
    // Type: protocol
    if (legacyProductId == 0x78751B12Da02728F467A44eAc40F5cbc16Bd7934) {
      return 17;
    }

    // Product: Curve All Pools (incl staking)
    // Type: protocol
    if (legacyProductId == 0x79a8C46DeA5aDa233ABaFFD40F3A0A2B1e5A4F27) {
      return 18;
    }

    // Product: Set Protocol
    // Type: protocol
    if (legacyProductId == 0x5B67871C3a857dE81A1ca0f9F7945e5670D986Dc) {
      return 19;
    }

    // Product: Uniswap v2
    // Type: protocol
    if (legacyProductId == 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f) {
      return 20;
    }

    // Product: Synthetix
    // Type: protocol
    if (legacyProductId == 0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F) {
      return 21;
    }

    // Product: Bancor v2
    // Type: protocol
    if (legacyProductId == 0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C) {
      return 22;
    }

    // Product: CoFix
    // Type: protocol
    if (legacyProductId == 0x26aaD4D82f6c9FA6E34D8c1067429C986A055872) {
      return 23;
    }

    // Product: Yield Protocol
    // Type: protocol
    if (legacyProductId == 0xB94199866Fe06B535d019C11247D3f921460b91A) {
      return 24;
    }

    // Product: Eth 2.0 (deposit contract)
    // Type: protocol
    if (legacyProductId == 0x00000000219ab540356cBB839Cbe05303d7705Fa) {
      return 25;
    }

    // Product: Aave v2
    // Type: protocol
    if (legacyProductId == 0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9) {
      return 26;
    }

    // Product: BadgerDAO
    // Type: protocol
    if (legacyProductId == 0x6354E79F21B56C11f48bcD7c451BE456D7102A36) {
      return 27;
    }

    // Product: Opyn v2
    // Type: protocol
    if (legacyProductId == 0x7C06792Af1632E77cb27a558Dc0885338F4Bdf8E) {
      return 28;
    }

    // Product: Reflexer
    // Type: protocol
    if (legacyProductId == 0xCC88a9d330da1133Df3A7bD823B95e52511A6962) {
      return 29;
    }

    // Product: Stake DAO
    // Type: protocol
    if (legacyProductId == 0xB17640796e4c27a39AF51887aff3F8DC0daF9567) {
      return 30;
    }

    // Product: Liquity
    // Type: protocol
    if (legacyProductId == 0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2) {
      return 31;
    }

    // Product: Uniswap v3
    // Type: protocol
    if (legacyProductId == 0x1F98431c8aD98523631AE4a59f267346ea31F984) {
      return 32;
    }

    // Product: Convex Finance v1
    // Type: protocol
    if (legacyProductId == 0xF403C135812408BFbE8713b5A23a04b3D48AAE31) {
      return 33;
    }

    // Product: Balancer v2
    // Type: protocol
    if (legacyProductId == 0xBA12222222228d8Ba445958a75a0704d566BF2C8) {
      return 34;
    }

    // Product: Goldfinch
    // Type: protocol
    if (legacyProductId == 0x8481a6EbAf5c7DABc3F7e09e44A89531fd31F822) {
      return 35;
    }

    // Product: BlockFi
    // Type: custodian
    if (legacyProductId == 0xC57D000000000000000000000000000000000002) {
      return 36;
    }

    // Product: Nexo
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000003) {
      return 37;
    }

    // Product: inLock
    // Type: custodian
    if (legacyProductId == 0xc57d000000000000000000000000000000000004) {
      return 38;
    }

    // Product: Ledn
    // Type: custodian
    if (legacyProductId == 0xC57D000000000000000000000000000000000005) {
      return 39;
    }

    // Product: Hodlnaut
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000006) {
      return 40;
    }

    // Product: Binance
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000007) {
      return 41;
    }

    // Product: Coinbase
    // Type: custodian
    if (legacyProductId == 0xc57D000000000000000000000000000000000008) {
      return 42;
    }

    // Product: Kraken
    // Type: custodian
    if (legacyProductId == 0xc57d000000000000000000000000000000000009) {
      return 43;
    }

    // Product: Gemini
    // Type: custodian
    if (legacyProductId == 0xc57d000000000000000000000000000000000010) {
      return 44;
    }

    // Product: FTX
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000011) {
      return 45;
    }

    // Product: Crypto.com
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000012) {
      return 46;
    }

    // Product: Yield.app
    // Type: custodian
    if (legacyProductId == 0xc57d000000000000000000000000000000000013) {
      return 47;
    }

    // Product: Centrifuge Tinlake
    // Type: protocol
    if (legacyProductId == 0x0CED6166873038Ac0cc688e7E6d19E2cBE251Bf0) {
      return 48;
    }

    // Product: Rari Capital
    // Type: protocol
    if (legacyProductId == 0x835482FE0532f169024d5E9410199369aAD5C77E) {
      return 49;
    }

    // Product: Abracadabra
    // Type: protocol
    if (legacyProductId == 0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce) {
      return 50;
    }

    // Product: Premia Finance
    // Type: protocol
    if (legacyProductId == 0x48D49466CB2EFbF05FaA5fa5E69f2984eDC8d1D7) {
      return 51;
    }

    // Product: Anchor
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000001) {
      return 52;
    }

    // Product: Thorchain
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000004) {
      return 53;
    }

    // Product: Notional Finance v2
    // Type: protocol
    if (legacyProductId == 0x1344A36A1B56144C3Bc62E7757377D288fDE0369) {
      return 54;
    }

    // Product: OlympusDAO
    // Type: protocol
    if (legacyProductId == 0x575409F8d77c12B05feD8B455815f0e54797381c) {
      return 55;
    }

    // Product: Ribbon Finance v2
    // Type: protocol
    if (legacyProductId == 0x25751853Eab4D0eB3652B5eB6ecB102A2789644B) {
      return 56;
    }

    // Product: Trader Joe
    // Type: protocol
    if (legacyProductId == 0x60aE616a2155Ee3d9A68541Ba4544862310933d4) {
      return 57;
    }

    // Product: Origin OUSD
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000016) {
      return 58;
    }

    // Product: Ondo
    // Type: protocol
    if (legacyProductId == 0x2BB8de958134AFd7543d4063CaFAD0b7c6de08BC) {
      return 59;
    }

    // Product: Enzyme v3
    // Type: protocol
    if (legacyProductId == 0x7e6d3b1161DF9c9c7527F68d651B297d2Fdb820B) {
      return 60;
    }

    // Product: Beefy
    // Type: protocol
    if (legacyProductId == 0x453D4Ba9a2D594314DF88564248497F7D74d6b2C) {
      return 61;
    }

    // Product: Angle
    // Type: protocol
    if (legacyProductId == 0xfdA462548Ce04282f4B6D6619823a7C64Fdc0185) {
      return 62;
    }

    // Product: Alchemix v2
    // Type: protocol
    if (legacyProductId == 0x5C6374a2ac4EBC38DeA0Fc1F8716e5Ea1AdD94dd) {
      return 63;
    }

    // Product: Bundle: Gelt + mStable + Aave v2
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000018) {
      return 64;
    }

    // Product: Yeti Finance
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000019) {
      return 65;
    }

    // Product: Babylon Finance
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000020) {
      return 66;
    }

    // Product: Vector
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000021) {
      return 67;
    }

    // Product: Bancor v3
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000022) {
      return 68;
    }

    // Product: Ease
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000023) {
      return 69;
    }

    // Product: Iron Bank
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000024) {
      return 70;
    }

    // Product: Stakewise operated (3 ETH / validator)
    // Type: eth2slashing
    if (legacyProductId == 0x0000000000000000000000000000000000000025) {
      return 71;
    }

    // Product: Stakewise 3rd party (3 ETH / validator)
    // Type: eth2slashing
    if (legacyProductId == 0x0000000000000000000000000000000000000026) {
      return 72;
    }

    // Product: Nested
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000027) {
      return 73;
    }

    // Product: Euler
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000028) {
      return 74;
    }

    // Product: GMX
    // Type: protocol
    if (legacyProductId == 0x3D6bA331e3D9702C5e8A8d254e5d8a285F223aba) {
      return 75;
    }

    // Product: Sherlock
    // Type: sherlock
    if (legacyProductId == 0x0000000000000000000000000000000000000029) {
      return 76;
    }

    // Product: Gearbox V2
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000030) {
      return 77;
    }

    // Product: Aura
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000031) {
      return 78;
    }

    // Product: Enzyme v4
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000032) {
      return 79;
    }

    revert("Invalid product!");
  }
}
