const { BigNumber } = require('ethers');
const { ethers } = require('hardhat');
const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;
const { ContractTypes } = require('../utils').constants;
const { hex } = require('../utils').helpers;
const { proposalCategories } = require('../utils');
const { enrollMember } = require('./utils/enroll');

const { getAccounts, stakingPoolManagers } = require('../utils').accounts;

async function setup() {
  // external
  const ERC20BlacklistableMock = await ethers.getContractFactory('ERC20BlacklistableMock');
  const OwnedUpgradeabilityProxy = await ethers.getContractFactory('OwnedUpgradeabilityProxy');
  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
  // const Lido = await ethers.getContractFactory('P1MockLido');
  const ProductsV1 = await ethers.getContractFactory('ProductsV1');
  const IntegrationMockStakingPool = await ethers.getContractFactory('IntegrationMockStakingPool');

  // nexusmutual
  const NXMToken = await ethers.getContractFactory('NXMToken');
  // const LegacyClaims = await ethers.getContractFactory('LegacyClaims');
  // const LegacyIncidents = await ethers.getContractFactory('LegacyIncidents');
  // const LegacyClaimsData = await ethers.getContractFactory('LegacyClaimsData');
  const LegacyClaimsReward = await ethers.getContractFactory('LegacyClaimsReward');
  const DisposableMCR = await ethers.getContractFactory('DisposableMCR');
  const MCR = await ethers.getContractFactory('MCR');
  const Pool = await ethers.getContractFactory('Pool');
  const QuotationData = await ethers.getContractFactory('LegacyQuotationData');
  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
  const SwapOperator = await ethers.getContractFactory('SwapOperator');
  const CoverNFT = await ethers.getContractFactory('CoverNFT');
  // const StakingPool = await ethers.getContractFactory('StakingPool');

  const CoverUtilsLib = await ethers.getContractFactory('CoverUtilsLib');

  const ethersAccounts = await getAccounts();

  // external
  const WETH9 = await ethers.getContractFactory('WETH9');
  const SOMockSettlement = await ethers.getContractFactory('SOMockSettlement');
  const SOMockVaultRelayer = await ethers.getContractFactory('SOMockVaultRelayer');

  const deployProxy = async (contract, deployParams = [], options = {}) => {
    const contractFactory = await ethers.getContractFactory(contract, options);
    const implementation = await contractFactory.deploy(...deployParams);
    const proxy = await OwnedUpgradeabilityProxy.deploy(implementation.address);

    return await ethers.getContractAt(contract, proxy.address);
  };

  const upgradeProxy = async (proxyAddress, contract, constructorArgs = [], options = {}) => {
    const contractFactory = await ethers.getContractFactory(contract, options);

    const impl = await contractFactory.deploy(...constructorArgs);
    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', proxyAddress);
    await proxy.upgradeTo(impl.address);
    const instance = await ethers.getContractAt(contract, proxyAddress);

    return instance;
  };

  const transferProxyOwnership = async (proxyAddress, newOwner) => {
    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', proxyAddress);
    await proxy.transferProxyOwnership(newOwner);
  };

  const coverUtilsLib = await CoverUtilsLib.deploy();
  const options = { libraries: { CoverUtilsLib: coverUtilsLib.address } };

  const QE = '0x51042c4d8936a7764d18370a6a0762b860bb8e07';
  const INITIAL_SUPPLY = parseEther('15000000000');

  const {
    defaultSender: { address: owner },
    emergencyAdmin,
  } = ethersAccounts;

  // deploy external contracts
  const weth = await WETH9.deploy();
  const dai = await ERC20BlacklistableMock.deploy();

  await dai.mint(owner, parseEther('10000000'));

  const stETH = await ERC20BlacklistableMock.deploy();
  await stETH.mint(owner, parseEther('10000000'));

  const chainlinkDAI = await ChainlinkAggregatorMock.deploy();

  const chainlinkSteth = await ChainlinkAggregatorMock.deploy();
  await chainlinkSteth.setLatestAnswer(parseEther('1').toString());

  const priceFeedOracle = await PriceFeedOracle.deploy(
    [dai.address, stETH.address],
    [chainlinkDAI.address, chainlinkSteth.address],
    [18, 18],
  );

  // const lido = await Lido.new();

  const ybDAI = await ERC20BlacklistableMock.deploy();
  await ybDAI.mint(owner, parseEther('10000000'));

  const ybETH = await ERC20BlacklistableMock.deploy();
  await ybETH.mint(owner, parseEther('10000000'));

  // proxy contracts
  const master = await deployProxy('DisposableNXMaster');
  const mr = await deployProxy('DisposableMemberRoles');
  const ps = await deployProxy('DisposablePooledStaking');
  const pc = await deployProxy('DisposableProposalCategory');
  const gv = await deployProxy('DisposableGovernance');
  const gateway = await deployProxy('DisposableGateway');

  // non-proxy contracts and libraries

  // regular contracts
  // const lcl = await LegacyClaims.new();
  // const lic = await LegacyIncidents.new();
  // const lcd = await LegacyClaimsData.new();
  const lcr = await LegacyClaimsReward.deploy(master.address, dai.address);

  const mcrEth = parseEther('50000');

  const mcrFloor = mcrEth.sub(parseEther('10000'));

  const latestBlock = await ethers.provider.getBlock('latest');
  const lastUpdateTime = latestBlock.timestamp;
  const mcrFloorIncrementThreshold = 13000;
  const maxMCRFloorIncrement = 100;
  const maxMCRIncrement = 500;
  const gearingFactor = 48000;
  const minUpdateTime = 3600;
  const desiredMCR = mcrEth;

  const disposableMCR = await DisposableMCR.deploy(
    mcrEth,
    mcrFloor,
    desiredMCR,
    lastUpdateTime,
    mcrFloorIncrementThreshold,
    maxMCRFloorIncrement,
    maxMCRIncrement,
    gearingFactor,
    minUpdateTime,
  );

  // deploy MCR with DisposableMCR as a fake master
  const mc = await MCR.deploy(disposableMCR.address);

  // trigger initialize and update master address
  await disposableMCR.initializeNextMcr(mc.address, master.address);

  const p1 = await Pool.deploy(master.address, priceFeedOracle.address, AddressZero, dai.address, stETH.address);

  const cowVaultRelayer = await SOMockVaultRelayer.deploy();
  const cowSettlement = await SOMockSettlement.deploy(cowVaultRelayer.address);
  const swapOperator = await SwapOperator.deploy(
    cowSettlement.address,
    owner, // _swapController,
    master.address,
    weth.address,
    AddressZero,
    AddressZero,
    '0',
  );

  const productsV1 = await ProductsV1.deploy();

  const tk = await NXMToken.deploy(owner, INITIAL_SUPPLY);
  const qd = await QuotationData.deploy(QE, owner);

  const tc = await deployProxy('DisposableTokenController', [qd.address, lcr.address]);
  const ic = await deployProxy('DisposableIndividualClaims', []);
  const yt = await deployProxy('DisposableYieldTokenIncidents', []);
  let as = await deployProxy('DisposableAssessment', []);
  const cl = await deployProxy('CoverMigrator', []);

  let cover = await deployProxy(
    'DisposableCover',
    [qd.address, productsV1.address, AddressZero, AddressZero, AddressZero],
    options,
  );

  await cover.changeMasterAddress(master.address);

  const coverNFT = await CoverNFT.deploy('Nexus Mutual Cover', 'NMC', cover.address);

  const stakingPool = await IntegrationMockStakingPool.deploy(tk.address, cover.address, tc.address);

  const contractType = code => {
    const upgradable = ['MC', 'P1', 'CR'];
    const proxies = ['GV', 'MR', 'PC', 'PS', 'TC', 'GW', 'IC', 'YT', 'AS', 'CO', 'CL'];

    if (upgradable.includes(code)) {
      return ContractTypes.Replaceable;
    }

    if (proxies.includes(code)) {
      return ContractTypes.Proxy;
    }

    return 0;
  };

  const codes = ['QD', 'TC', 'P1', 'MC', 'GV', 'PC', 'MR', 'PS', 'GW', 'IC', 'CL', 'YT', 'AS', 'CO', 'CR'];
  const addresses = [qd, tc, p1, mc, { address: owner }, pc, mr, ps, gateway, ic, cl, yt, as, cover, lcr].map(
    c => c.address,
  );

  await master.initialize(
    owner,
    tk.address,
    emergencyAdmin.address,
    codes.map(hex), // codes
    codes.map(contractType), // types
    addresses, // addresses
  );

  await tc.initialize(master.address, tk.address, ps.address, as.address);

  await tc.addToWhitelist(lcr.address);

  await mr.initialize(
    owner,
    master.address,
    tc.address,
    [owner], // initial members
    [parseEther('10000')], // initial tokens
    [owner], // advisory board members
  );

  await mr.setKycAuthAddress(ethersAccounts.defaultSender.address);

  await pc.initialize(mr.address);

  // FIXME gas override
  for (const category of proposalCategories) {
    await pc.addInitialCategory(...category);
  }

  await gv.initialize(
    3 * 24 * 3600, // tokenHoldingTime
    14 * 24 * 3600, // maxDraftTime
    5, // maxVoteWeigthPer
    40, // maxFollowers
    75, // specialResolutionMajPerc
    24 * 3600, // actionWaitingTime
  );

  await ps.initialize(
    tc.address,
    parseEther('20'), // min stake
    parseEther('20'), // min unstake
    10, // max exposure
    90 * 24 * 3600, // unstake lock time
  );

  await ic.initialize(master.address);

  const CLAIM_METHOD = {
    INDIVIDUAL_CLAIMS: 0,
    YIELD_TOKEN_INCIDENTS: 1,
  };

  await cover.changeDependentContractAddress();

  await cover.setCoverAssetsFallback(0b11); // eth and dai

  await cover.setProductTypes([
    {
      // Protocol Cover
      productTypeId: MaxUint256,
      ipfsMetadata: 'protocolCoverIPFSHash',
      productType: {
        claimMethod: CLAIM_METHOD.INDIVIDUAL_CLAIMS,
        gracePeriodInDays: 30,
      },
    },
    {
      // Custody Cover
      productTypeId: MaxUint256,
      ipfsMetadata: 'custodyCoverIPFSHash',
      productType: {
        claimMethod: CLAIM_METHOD.INDIVIDUAL_CLAIMS,
        gracePeriodInDays: 90,
      },
    },
    // Yield Token Cover
    {
      productTypeId: MaxUint256,
      ipfsMetadata: 'yieldTokenCoverIPFSHash',
      productType: {
        claimMethod: CLAIM_METHOD.YIELD_TOKEN_INCIDENTS,
        gracePeriodInDays: 14,
      },
    },
  ]);

  await cover.setProducts([
    {
      productId: MaxUint256,
      ipfsMetadata: 'product 0 metadata',
      product: {
        productType: 0, // Protocol Cover
        yieldTokenAddress: '0x0000000000000000000000000000000000000000',
        coverAssets: 0, // Use fallback
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
      },
    },
    {
      productId: MaxUint256,
      ipfsMetadata: 'product 0 metadata',
      product: {
        productType: 1, // Custody Cover
        yieldTokenAddress: '0x0000000000000000000000000000000000000000',
        coverAssets: 0, // Use fallback
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
      },
    },
    {
      productId: MaxUint256,
      ipfsMetadata: 'product 0 metadata',
      product: {
        productType: 2, // Yield Token Cover
        yieldTokenAddress: ybETH.address,
        coverAssets: 0b01, // ETH
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
      },
    },
    {
      productId: MaxUint256,
      ipfsMetadata: 'product 0 metadata',
      product: {
        productType: 2, // Yield Token Cover
        yieldTokenAddress: ybDAI.address,
        coverAssets: 0b10, // DAI
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
      },
    },
  ]);

  await p1.updateAddressParameters(hex('SWP_OP').padEnd(2 + 16, '0'), swapOperator.address);

  await cover.updateUintParametersDisposable(
    [0, 1], // CoverUintParams.globalCapacityRatio, CoverUintParams.globalRewardsRatio
    [10000, 5000],
  );

  await gv.changeMasterAddress(master.address);
  await master.switchGovernanceAddress(gv.address);

  await gateway.initialize(master.address, dai.address);

  await yt.initialize(master.address);

  await upgradeProxy(mr.address, 'MemberRoles');
  await upgradeProxy(tc.address, 'TokenController', [qd.address, lcr.address]);
  await upgradeProxy(ps.address, 'LegacyPooledStaking', [cover.address, productsV1.address]);
  await upgradeProxy(pc.address, 'ProposalCategory');
  await upgradeProxy(master.address, 'NXMaster');
  await upgradeProxy(gv.address, 'Governance');
  await upgradeProxy(gateway.address, 'LegacyGateway');
  await upgradeProxy(ic.address, 'IndividualClaims', [tk.address, coverNFT.address]);
  await upgradeProxy(yt.address, 'YieldTokenIncidents', [tk.address, coverNFT.address]);
  await upgradeProxy(as.address, 'Assessment', [tk.address]);
  await upgradeProxy(
    cover.address,
    'Cover',
    [qd.address, productsV1.address, coverNFT.address, stakingPool.address, cover.address],
    options,
  );

  cover = await ethers.getContractAt('Cover', cover.address);

  as = await ethers.getContractAt('Assessment', as.address);

  // [todo] We should probably call changeDependentContractAddress on every contract
  await gateway.changeDependentContractAddress();
  await cover.changeDependentContractAddress();
  await ic.changeDependentContractAddress();
  await as.changeDependentContractAddress();
  await yt.changeDependentContractAddress();

  await transferProxyOwnership(mr.address, master.address);
  await transferProxyOwnership(tc.address, master.address);
  await transferProxyOwnership(ps.address, master.address);
  await transferProxyOwnership(pc.address, master.address);
  await transferProxyOwnership(gv.address, master.address);
  await transferProxyOwnership(gateway.address, master.address);
  await transferProxyOwnership(ic.address, master.address);
  await transferProxyOwnership(cl.address, master.address);
  await transferProxyOwnership(as.address, master.address);
  await transferProxyOwnership(cover.address, gv.address);
  await transferProxyOwnership(master.address, gv.address);

  const POOL_ETHER = parseEther('90000');
  const POOL_DAI = parseEther('2000000');

  // fund pool
  await ethers.provider.getSigner().sendTransaction({ from: owner, to: p1.address, value: POOL_ETHER.toString() });
  await dai.transfer(p1.address, POOL_DAI);

  const ethToDaiRate = 20000;

  const daiToEthRate = BigNumber.from('10')
    .pow(BigNumber.from('36'))
    .div(parseEther((ethToDaiRate / 100).toString()));
  await chainlinkDAI.setLatestAnswer(daiToEthRate);

  await as.initialize();

  const external = { chainlinkDAI, dai, weth, productsV1, ybDAI, ybETH };
  const nonUpgradable = { qd };
  const instances = { tk, cl, p1, mcr: mc };

  // we upgraded them, get non-disposable instances because
  const proxies = {
    master: await ethers.getContractAt('NXMaster', master.address),
    tc: await ethers.getContractAt('TokenController', tc.address),
    gv: await ethers.getContractAt('Governance', gv.address),
    pc: await ethers.getContractAt('ProposalCategory', pc.address),
    mr: await ethers.getContractAt('MemberRoles', mr.address),
    ps: await ethers.getContractAt('LegacyPooledStaking', ps.address),
    gateway: await ethers.getContractAt('LegacyGateway', gateway.address),
    ic: await ethers.getContractAt('IndividualClaims', ic.address),
    yc: await ethers.getContractAt('YieldTokenIncidents', yt.address),
    cl: await ethers.getContractAt('CoverMigrator', cl.address),
    as: await ethers.getContractAt('Assessment', as.address),
    cover: await ethers.getContractAt('Cover', cover.address),
    coverNFT: await ethers.getContractAt('CoverNFT', coverNFT.address),
  };

  const nonInternal = { priceFeedOracle, swapOperator };

  this.contracts = {
    ...external,
    ...nonUpgradable,
    ...instances,
    ...proxies,
    ...nonInternal,
  };

  this.rates = {
    daiToEthRate,
    ethToDaiRate,
  };

  this.contractType = contractType;

  await enrollMember(this.contracts, ethersAccounts.members, ethersAccounts.defaultSender);

  const DEFAULT_POOL_FEE = '5';

  const DEFAULT_PRODUCT_INITIALIZATION = [
    {
      productId: 0,
      weight: 100,
      initialPrice: 1000,
      targetPrice: 1000,
    },
  ];

  for (let i = 0; i < 3; i++) {
    const tx = await this.contracts.cover.createStakingPool(
      stakingPoolManagers[i],
      false, // isPrivatePool,
      DEFAULT_POOL_FEE, // initialPoolFee
      DEFAULT_POOL_FEE, // maxPoolFee,
      DEFAULT_PRODUCT_INITIALIZATION,
      '0', // depositAmount,
      '0', // trancheId
    );

    await tx.wait();
    const stakingPoolAddress = await cover.stakingPool(i);
    const stakingPoolInstance = await ethers.getContractAt('IntegrationMockStakingPool', stakingPoolAddress);

    this.contracts['stakingPool' + i] = stakingPoolInstance;
  }

  this.accounts = ethersAccounts;
  this.DEFAULT_PRODUCT_INITIALIZATION = DEFAULT_PRODUCT_INITIALIZATION;
}

module.exports = setup;
