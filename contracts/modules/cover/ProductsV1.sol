// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IProductsV1.sol";

contract ProductsV1 is IProductsV1 {
  function getNewProductId(address legacyProductId) external pure override returns (uint) {
    
    // Product: bZx v1
    // Type: protocol
    if (legacyProductId == 0x8B3d70d628Ebd30D4A2ea82DB95bA2e906c71633) {
      return 0;
    }
    
    // Product: Saturn DAO Token
    // Type: protocol
    if (legacyProductId == 0xAF350211414C5DC176421Ea05423F0cC494261fB) {
      return 1;
    }
    
    // Product: Legacy Gnosis MultiSig
    // Type: protocol
    if (legacyProductId == 0x6e95C8E8557AbC08b46F3c347bA06F8dC012763f) {
      return 2;
    }
    
    // Product: dxDAO
    // Type: protocol
    if (legacyProductId == 0x519b70055af55A007110B4Ff99b0eA33071c720a) {
      return 3;
    }
    
    // Product: Argent
    // Type: protocol
    if (legacyProductId == 0xB1dD690Cc9AF7BB1a906A9B5A94F94191cc553Ce) {
      return 4;
    }
    
    // Product: dydx Perpetual
    // Type: protocol
    if (legacyProductId == 0x364508A5cA0538d8119D3BF40A284635686C98c4) {
      return 5;
    }
    
    // Product: DDEX
    // Type: protocol
    if (legacyProductId == 0x241e82C79452F51fbfc89Fac6d912e021dB1a3B7) {
      return 6;
    }
    
    // Product: Tornado Cash
    // Type: protocol
    if (legacyProductId == 0x12D66f87A04A9E220743712cE6d9bB1B5616B8Fc) {
      return 7;
    }
    
    // Product: Deversifi
    // Type: protocol
    if (legacyProductId == 0x5d22045DAcEAB03B158031eCB7D9d06Fad24609b) {
      return 8;
    }
    
    // Product: RenVM
    // Type: protocol
    if (legacyProductId == 0xe80d347DF1209a76DD9d2319d62912ba98C54DDD) {
      return 9;
    }
    
    // Product: 0x v3
    // Type: protocol
    if (legacyProductId == 0xB27F1DB0a7e473304A5a06E54bdf035F671400C0) {
      return 10;
    }
    
    // Product: Compound v2
    // Type: protocol
    if (legacyProductId == 0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B) {
      return 11;
    }
    
    // Product: Gnosis Safe
    // Type: protocol
    if (legacyProductId == 0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F) {
      return 12;
    }
    
    // Product: Uniswap v1
    // Type: protocol
    if (legacyProductId == 0xc0a47dFe034B400B47bDaD5FecDa2621de6c4d95) {
      return 13;
    }
    
    // Product: MakerDAO MCD
    // Type: protocol
    if (legacyProductId == 0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B) {
      return 14;
    }
    
    // Product: Aave v1
    // Type: protocol
    if (legacyProductId == 0xc1D2819CE78f3E15Ee69c6738eB1B400A26e632A) {
      return 15;
    }
    
    // Product: 1Inch (DEX & Liquidity Pools)
    // Type: protocol
    if (legacyProductId == 0x11111254369792b2Ca5d084aB5eEA397cA8fa48B) {
      return 16;
    }
    
    // Product: Opyn
    // Type: protocol
    if (legacyProductId == 0xb529964F86fbf99a6aA67f72a27e59fA3fa4FEaC) {
      return 17;
    }
    
    // Product: Yearn Finance (all vaults)
    // Type: protocol
    if (legacyProductId == 0x9D25057e62939D3408406975aD75Ffe834DA4cDd) {
      return 18;
    }
    
    // Product: Totle
    // Type: protocol
    if (legacyProductId == 0x77208a6000691E440026bEd1b178EF4661D37426) {
      return 19;
    }
    
    // Product: Flexa Staking
    // Type: protocol
    if (legacyProductId == 0x12f208476F64De6e6f933E55069Ba9596D818e08) {
      return 20;
    }
    
    // Product: Curve All Pools (incl staking)
    // Type: protocol
    if (legacyProductId == 0x79a8C46DeA5aDa233ABaFFD40F3A0A2B1e5A4F27) {
      return 21;
    }
    
    // Product: Set Protocol
    // Type: protocol
    if (legacyProductId == 0x5B67871C3a857dE81A1ca0f9F7945e5670D986Dc) {
      return 22;
    }
    
    // Product: Uniswap v2
    // Type: protocol
    if (legacyProductId == 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f) {
      return 23;
    }
    
    // Product: Balancer v1
    // Type: protocol
    if (legacyProductId == 0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd) {
      return 24;
    }
    
    // Product: Ampleforth Tokengeyser
    // Type: protocol
    if (legacyProductId == 0xD36132E0c1141B26E62733e018f12Eb38A7b7678) {
      return 25;
    }
    
    // Product: Paraswap v1
    // Type: protocol
    if (legacyProductId == 0x86969d29F5fd327E1009bA66072BE22DB6017cC6) {
      return 26;
    }
    
    // Product: Melon v1
    // Type: protocol
    if (legacyProductId == 0x5f9AE054C7F0489888B1ea46824b4B9618f8A711) {
      return 27;
    }
    
    // Product: MolochDAO
    // Type: protocol
    if (legacyProductId == 0x1fd169A4f5c59ACf79d0Fd5d91D1201EF1Bce9f1) {
      return 28;
    }
    
    // Product: mStable
    // Type: protocol
    if (legacyProductId == 0xAFcE80b19A8cE13DEc0739a1aaB7A028d6845Eb3) {
      return 29;
    }
    
    // Product: Synthetix
    // Type: protocol
    if (legacyProductId == 0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F) {
      return 30;
    }
    
    // Product: IDEX v1
    // Type: protocol
    if (legacyProductId == 0x2a0c0DBEcC7E4D658f48E01e3fA353F44050c208) {
      return 31;
    }
    
    // Product: Kyber (Katalyst)
    // Type: protocol
    if (legacyProductId == 0x9AAb3f75489902f3a48495025729a0AF77d4b11e) {
      return 32;
    }
    
    // Product: Bancor v2
    // Type: protocol
    if (legacyProductId == 0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C) {
      return 33;
    }
    
    // Product: UMA
    // Type: protocol
    if (legacyProductId == 0x3e532e6222afe9Bcf02DCB87216802c75D5113aE) {
      return 34;
    }
    
    // Product: dForce Yield Market
    // Type: protocol
    if (legacyProductId == 0x02285AcaafEB533e03A7306C55EC031297df9224) {
      return 35;
    }
    
    // Product: Idle v4
    // Type: protocol
    if (legacyProductId == 0x3fE7940616e5Bc47b0775a0dccf6237893353bB4) {
      return 36;
    }
    
    // Product: Mooniswap
    // Type: protocol
    if (legacyProductId == 0x71CD6666064C3A1354a3B4dca5fA1E2D3ee7D303) {
      return 37;
    }
    
    // Product: tBTC Contracts v1
    // Type: protocol
    if (legacyProductId == 0xe20A5C79b39bC8C363f0f49ADcFa82C2a01ab64a) {
      return 38;
    }
    
    // Product: NuCypher Worklock
    // Type: protocol
    if (legacyProductId == 0xe9778E69a961e64d3cdBB34CF6778281d34667c2) {
      return 39;
    }
    
    // Product: Akropolis Delphi
    // Type: protocol
    if (legacyProductId == 0x4C39b37f5F20a0695BFDC59cf10bd85a6c4B7c30) {
      return 40;
    }
    
    // Product: DODO Exchange
    // Type: protocol
    if (legacyProductId == 0x3A97247DF274a17C59A3bd12735ea3FcDFb49950) {
      return 41;
    }
    
    // Product: Pool Together v3
    // Type: protocol
    if (legacyProductId == 0xCB876f60399897db24058b2d58D0B9f713175eeF) {
      return 42;
    }
    
    // Product: Set Protocol v2
    // Type: protocol
    if (legacyProductId == 0xa4c8d221d8BB851f83aadd0223a8900A6921A349) {
      return 43;
    }
    
    // Product: Yield Protocol
    // Type: protocol
    if (legacyProductId == 0xB94199866Fe06B535d019C11247D3f921460b91A) {
      return 44;
    }
    
    // Product: Eth 2.0 (deposit contract)
    // Type: protocol
    if (legacyProductId == 0x00000000219ab540356cBB839Cbe05303d7705Fa) {
      return 45;
    }
    
    // Product: Hegic
    // Type: protocol
    if (legacyProductId == 0x878F15ffC8b894A1BA7647c7176E4C01f74e140b) {
      return 46;
    }
    
    // Product: Keeper DAO
    // Type: protocol
    if (legacyProductId == 0xfA5047c9c78B8877af97BDcb85Db743fD7313d4a) {
      return 47;
    }
    
    // Product: CREAM v1
    // Type: protocol
    if (legacyProductId == 0x3d5BC3c8d13dcB8bF317092d84783c2697AE9258) {
      return 48;
    }
    
    // Product: TrueFi
    // Type: protocol
    if (legacyProductId == 0x7a9701453249e84fd0D5AfE5951e9cBe9ed2E90f) {
      return 49;
    }
    
    // Product: Alpha Homora v1
    // Type: protocol
    if (legacyProductId == 0x67B66C99D3Eb37Fa76Aa3Ed1ff33E8e39F0b9c7A) {
      return 50;
    }
    
    // Product: Aave v2
    // Type: protocol
    if (legacyProductId == 0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9) {
      return 51;
    }
    
    // Product: SushiSwap v1
    // Type: protocol
    if (legacyProductId == 0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd) {
      return 52;
    }
    
    // Product: Perpetual Protocol
    // Type: protocol
    if (legacyProductId == 0xA51156F3F1e39d1036Ca4ba4974107A1C1815d1e) {
      return 53;
    }
    
    // Product: BadgerDAO
    // Type: protocol
    if (legacyProductId == 0x6354E79F21B56C11f48bcD7c451BE456D7102A36) {
      return 54;
    }
    
    // Product: Notional Finance v1
    // Type: protocol
    if (legacyProductId == 0x9abd0b8868546105F6F48298eaDC1D9c82f7f683) {
      return 55;
    }
    
    // Product: Origin Dollar
    // Type: protocol
    if (legacyProductId == 0xE75D77B1865Ae93c7eaa3040B038D7aA7BC02F70) {
      return 56;
    }
    
    // Product: Opyn v2
    // Type: protocol
    if (legacyProductId == 0x7C06792Af1632E77cb27a558Dc0885338F4Bdf8E) {
      return 57;
    }
    
    // Product: Reflexer
    // Type: protocol
    if (legacyProductId == 0xCC88a9d330da1133Df3A7bD823B95e52511A6962) {
      return 58;
    }
    
    // Product: Vesper
    // Type: protocol
    if (legacyProductId == 0xa4F1671d3Aee73C05b552d57f2d16d3cfcBd0217) {
      return 59;
    }
    
    // Product: Benchmark Protocol
    // Type: protocol
    if (legacyProductId == 0x5D9972dD3Ba5602574ABeA6bF9E1713568D49903) {
      return 60;
    }
    
    // Product: Stake DAO
    // Type: protocol
    if (legacyProductId == 0xB17640796e4c27a39AF51887aff3F8DC0daF9567) {
      return 61;
    }
    
    // Product: Liquity
    // Type: protocol
    if (legacyProductId == 0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2) {
      return 62;
    }
    
    // Product: Harvest Finance
    // Type: protocol
    if (legacyProductId == 0x284D7200a0Dabb05ee6De698da10d00df164f61d) {
      return 63;
    }
    
    // Product: Uniswap v3
    // Type: protocol
    if (legacyProductId == 0x1F98431c8aD98523631AE4a59f267346ea31F984) {
      return 64;
    }
    
    // Product: Barnbridge Smart Yield v1
    // Type: protocol
    if (legacyProductId == 0x4B8d90D68F26DEF303Dcb6CFc9b63A1aAEC15840) {
      return 65;
    }
    
    // Product: Convex Finance v1
    // Type: protocol
    if (legacyProductId == 0xF403C135812408BFbE8713b5A23a04b3D48AAE31) {
      return 66;
    }
    
    // Product: Alchemix v1
    // Type: protocol
    if (legacyProductId == 0xc21D353FF4ee73C572425697f4F5aaD2109fe35b) {
      return 67;
    }
    
    // Product: Alpha Homora v2
    // Type: protocol
    if (legacyProductId == 0x99c666810bA4Bf9a4C2318CE60Cb2c279Ee2cF56) {
      return 68;
    }
    
    // Product: Balancer v2
    // Type: protocol
    if (legacyProductId == 0xBA12222222228d8Ba445958a75a0704d566BF2C8) {
      return 69;
    }
    
    // Product: Alpaca Finance
    // Type: protocol
    if (legacyProductId == 0xA625AB01B08ce023B2a342Dbb12a16f2C8489A8F) {
      return 70;
    }
    
    // Product: Visor Finance
    // Type: protocol
    if (legacyProductId == 0x08FB62c84909dA3Aa5F59E01763E5FDC62De76e9) {
      return 71;
    }
    
    // Product: Goldfinch
    // Type: protocol
    if (legacyProductId == 0x8481a6EbAf5c7DABc3F7e09e44A89531fd31F822) {
      return 72;
    }
    
    // Product: Celsius
    // Type: custodian
    if (legacyProductId == 0xc57D000000000000000000000000000000000001) {
      return 73;
    }
    
    // Product: BlockFi
    // Type: custodian
    if (legacyProductId == 0xC57D000000000000000000000000000000000002) {
      return 74;
    }
    
    // Product: Nexo
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000003) {
      return 75;
    }
    
    // Product: inLock
    // Type: custodian
    if (legacyProductId == 0xc57d000000000000000000000000000000000004) {
      return 76;
    }
    
    // Product: Ledn
    // Type: custodian
    if (legacyProductId == 0xC57D000000000000000000000000000000000005) {
      return 77;
    }
    
    // Product: Hodlnaut
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000006) {
      return 78;
    }
    
    // Product: Binance
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000007) {
      return 79;
    }
    
    // Product: Coinbase
    // Type: custodian
    if (legacyProductId == 0xc57D000000000000000000000000000000000008) {
      return 80;
    }
    
    // Product: Kraken
    // Type: custodian
    if (legacyProductId == 0xc57d000000000000000000000000000000000009) {
      return 81;
    }
    
    // Product: Gemini
    // Type: custodian
    if (legacyProductId == 0xc57d000000000000000000000000000000000010) {
      return 82;
    }
    
    // Product: FTX
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000011) {
      return 83;
    }
    
    // Product: Crypto.com
    // Type: custodian
    if (legacyProductId == 0xC57d000000000000000000000000000000000012) {
      return 84;
    }
    
    // Product: Yield.app
    // Type: custodian
    if (legacyProductId == 0xc57d000000000000000000000000000000000013) {
      return 85;
    }
    
    // Product: Pangolin
    // Type: protocol
    if (legacyProductId == 0xefa94DE7a4656D787667C749f7E1223D71E9FD88) {
      return 86;
    }
    
    // Product: Centrifuge Tinlake
    // Type: protocol
    if (legacyProductId == 0x0CED6166873038Ac0cc688e7E6d19E2cBE251Bf0) {
      return 87;
    }
    
    // Product: Rari Capital
    // Type: protocol
    if (legacyProductId == 0x835482FE0532f169024d5E9410199369aAD5C77E) {
      return 88;
    }
    
    // Product: Abracadabra
    // Type: protocol
    if (legacyProductId == 0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce) {
      return 89;
    }
    
    // Product: Premia Finance
    // Type: protocol
    if (legacyProductId == 0x48D49466CB2EFbF05FaA5fa5E69f2984eDC8d1D7) {
      return 90;
    }
    
    // Product: Anchor
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000001) {
      return 91;
    }
    
    // Product: Bunny
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000002) {
      return 92;
    }
    
    // Product: Venus
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000003) {
      return 93;
    }
    
    // Product: Thorchain
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000004) {
      return 94;
    }
    
    // Product: Pancakeswap v1
    // Type: protocol
    if (legacyProductId == 0x0000000000000000000000000000000000000005) {
      return 95;
    }
    
    // Product: Yearn yvDAI v2
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000006) {
      return 96;
    }
    
    // Product: Yearn yvUSDC v2
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000007) {
      return 97;
    }
    
    // Product: Yearn ycrvstETH v2
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000008) {
      return 98;
    }
    
    // Product: Curve 3pool LP (3Crv)
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000009) {
      return 99;
    }
    
    // Product: Curve sETH LP (eCrv)
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000010) {
      return 100;
    }
    
    // Product: Idle DAI v4 (idleDAIYield)
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000011) {
      return 101;
    }
    
    // Product: Idle USDT v4 (idleUSDTYield)
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000012) {
      return 102;
    }
    
    // Product: Convex stethCrv (cvxstethCrv)
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000013) {
      return 103;
    }
    
    // Product: Convex 3CRV (cvx3CRV)
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000014) {
      return 104;
    }
    
    // Product: Convex mimCrv (cvxmimCrv)
    // Type: token
    if (legacyProductId == 0x0000000000000000000000000000000000000015) {
      return 105;
    }
    
    // Product: Popsicle Finance
    // Type: protocol
    if (legacyProductId == 0xaE7b92C8B14E7bdB523408aE0A6fFbf3f589adD9) {
      return 106;
    }
    
    // Product: Notional Finance v2
    // Type: protocol
    if (legacyProductId == 0x1344A36A1B56144C3Bc62E7757377D288fDE0369) {
      return 107;
    }
    
    // Product: OlympusDAO
    // Type: protocol
    if (legacyProductId == 0x575409F8d77c12B05feD8B455815f0e54797381c) {
      return 108;
    }
    
    // Product: Ribbon Finance v2
    // Type: protocol
    if (legacyProductId == 0x25751853Eab4D0eB3652B5eB6ecB102A2789644B) {
      return 109;
    }
    
    // Product: Pool Together v4
    // Type: protocol
    if (legacyProductId == 0xd89a09084555a7D0ABe7B111b1f78DFEdDd638Be) {
      return 110;
    }
    
    // Product: Trader Joe
    // Type: protocol
    if (legacyProductId == 0x60aE616a2155Ee3d9A68541Ba4544862310933d4) {
      return 111;
    }
    
    revert("Invalid product!");
  }
}
