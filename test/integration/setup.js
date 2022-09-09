const { accounts, artifacts, web3, ethers } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');
const { parseEther } = ethers.utils;
const { ContractTypes } = require('../utils').constants;
const { hex } = require('../utils').helpers;
const { proposalCategories } = require('../utils');
const { enrollMember } = require('./utils/enroll');

const { BN } = web3.utils;
const { getAccounts, stakingPoolManagers } = require('../utils').accounts;

// Convert web3 instances to ethers.js
const web3ToEthers = (x, signers) => {
  const { contracts, rates } = x;
  const { daiToEthRate, ethToDaiRate } = rates;

  const accounts = getAccounts(signers);
  return {
    contracts: Object.keys(contracts)
      .map(x => ({ val: new ethers.Contract(contracts[x].address, contracts[x].abi, accounts.defaultSender), key: x }))
      .reduce((acc, x) => ({ ...acc, [x.key]: x.val }), {}),
    rates: { daiToEthRate: parseEther(daiToEthRate.toString()), ethToDaiRate },
    accounts,
  };
};

async function setup() {
  // external
  const ERC20BlacklistableMock = artifacts.require('ERC20BlacklistableMock');
  const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
  const ChainlinkAggregatorMock = artifacts.require('ChainlinkAggregatorMock');
  // const Lido = artifacts.require('P1MockLido');
  const ProductsV1 = artifacts.require('ProductsV1');
  const CoverMigrator = artifacts.require('CoverMigrator');
  const IntegrationMockStakingPool = artifacts.require('IntegrationMockStakingPool');

  // nexusmutual
  const NXMToken = artifacts.require('NXMToken');
  // const LegacyClaims = artifacts.require('LegacyClaims');
  // const LegacyIncidents = artifacts.require('LegacyIncidents');
  // const LegacyClaimsData = artifacts.require('LegacyClaimsData');
  const LegacyClaimsReward = artifacts.require('LegacyClaimsReward');
  const DisposableMCR = artifacts.require('DisposableMCR');
  const MCR = artifacts.require('MCR');
  const Pool = artifacts.require('Pool');
  const QuotationData = artifacts.require('LegacyQuotationData');
  const PriceFeedOracle = artifacts.require('PriceFeedOracle');
  const SwapOperator = artifacts.require('CowSwapOperator');
  const CoverNFT = artifacts.require('CoverNFT');
  const Cover = artifacts.require('Cover');
  // const StakingPool = artifacts.require('StakingPool');
  const CoverUtilsLib = artifacts.require('CoverUtilsLib');

  // temporary contracts used for initialization
  const DisposableNXMaster = artifacts.require('DisposableNXMaster');
  const DisposableMemberRoles = artifacts.require('DisposableMemberRoles');
  const DisposableTokenController = artifacts.require('DisposableTokenController');
  const DisposableProposalCategory = artifacts.require('DisposableProposalCategory');
  const DisposableGovernance = artifacts.require('DisposableGovernance');
  const DisposablePooledStaking = artifacts.require('DisposablePooledStaking');
  const DisposableGateway = artifacts.require('DisposableGateway');
  const DisposableAssessment = artifacts.require('DisposableAssessment');
  const DisposableYieldTokenIncidents = artifacts.require('DisposableYieldTokenIncidents');
  const DisposableIndividualClaims = artifacts.require('DisposableIndividualClaims');
  const DisposableCover = artifacts.require('DisposableCover');

  // target contracts
  const NXMaster = artifacts.require('NXMaster');
  const MemberRoles = artifacts.require('MemberRoles');
  const TokenController = artifacts.require('TokenController');
  const ProposalCategory = artifacts.require('ProposalCategory');
  const Governance = artifacts.require('Governance');
  const PooledStaking = artifacts.require('LegacyPooledStaking');
  const Gateway = artifacts.require('LegacyGateway');
  const YieldTokenIncidents = artifacts.require('YieldTokenIncidents');
  const IndividualClaims = artifacts.require('IndividualClaims');
  const Assessment = artifacts.require('Assessment');

  const signers = await ethers.getSigners();
  const ethersAccounts = getAccounts(signers);

  // external
  const WETH9 = artifacts.require('WETH9');
  const CSMockSettlement = artifacts.require('CSMockSettlement');
  const CSMockVaultRelayer = artifacts.require('CSMockVaultRelayer');

  const coverUtilsLib = await CoverUtilsLib.new();
  DisposableCover.link(coverUtilsLib);

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const QE = '0x51042c4d8936a7764d18370a6a0762b860bb8e07';
  const INITIAL_SUPPLY = ether('15000000000');

  const deployProxy = async (contract, deployParams = []) => {
    const implementation = await contract.new(...deployParams);
    const proxy = await OwnedUpgradeabilityProxy.new(implementation.address);
    return contract.at(proxy.address);
  };

  const upgradeProxy = async (proxyAddress, contract, params = []) => {
    const implementation = await contract.new(...params);
    const proxy = await OwnedUpgradeabilityProxy.at(proxyAddress);
    await proxy.upgradeTo(implementation.address);
  };

  const transferProxyOwnership = async (proxyAddress, newOwner) => {
    const proxy = await OwnedUpgradeabilityProxy.at(proxyAddress);
    await proxy.transferProxyOwnership(newOwner);
  };

  const [owner, emergencyAdmin] = accounts;

  // deploy external contracts
  const weth = await WETH9.new();

  const dai = await ERC20BlacklistableMock.new();
  await dai.mint(owner, ether('10000000'));

  const stETH = await ERC20BlacklistableMock.new();
  await stETH.mint(owner, ether('10000000'));

  const chainlinkDAI = await ChainlinkAggregatorMock.new();
  const chainlinkSteth = await ChainlinkAggregatorMock.new();
  await chainlinkSteth.setLatestAnswer(new BN((1e18).toString()));
  const priceFeedOracle = await PriceFeedOracle.new(
    [dai.address, stETH.address],
    [chainlinkDAI.address, chainlinkSteth.address],
    [18, 18],
  );

  // const lido = await Lido.new();

  // proxy contracts
  const master = await deployProxy(DisposableNXMaster);
  const mr = await deployProxy(DisposableMemberRoles);
  const ps = await deployProxy(DisposablePooledStaking);
  const pc = await deployProxy(DisposableProposalCategory);
  const gv = await deployProxy(DisposableGovernance);
  const gateway = await deployProxy(DisposableGateway);

  // non-proxy contracts and libraries

  // regular contracts
  // const lcl = await LegacyClaims.new();
  // const lic = await LegacyIncidents.new();
  // const lcd = await LegacyClaimsData.new();
  const lcr = await LegacyClaimsReward.new(master.address, dai.address);

  const mcrEth = ether('50000');

  const mcrFloor = mcrEth.sub(ether('10000'));

  const latestBlock = await web3.eth.getBlock('latest');
  const lastUpdateTime = latestBlock.timestamp;
  const mcrFloorIncrementThreshold = 13000;
  const maxMCRFloorIncrement = 100;
  const maxMCRIncrement = 500;
  const gearingFactor = 48000;
  const minUpdateTime = 3600;
  const desiredMCR = mcrEth;

  const disposableMCR = await DisposableMCR.new(
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
  const mc = await MCR.new(disposableMCR.address);

  // trigger initialize and update master address
  await disposableMCR.initializeNextMcr(mc.address, master.address);

  const p1 = await Pool.new(master.address, priceFeedOracle.address, ZERO_ADDRESS, dai.address, stETH.address);

  const cowVaultRelayer = await CSMockVaultRelayer.new();
  const cowSettlement = await CSMockSettlement.new(cowVaultRelayer.address);
  const swapOperator = await SwapOperator.new(
    cowSettlement.address,
    owner, // _swapController,
    master.address,
    weth.address,
  );

  const productsV1 = await ProductsV1.new();

  const tk = await NXMToken.new(owner, INITIAL_SUPPLY);
  const qd = await QuotationData.new(QE, owner);

  const tc = await deployProxy(DisposableTokenController, [qd.address, lcr.address]);
  const ic = await deployProxy(DisposableIndividualClaims, []);
  const yt = await deployProxy(DisposableYieldTokenIncidents, []);
  let as = await deployProxy(DisposableAssessment, []);
  const cl = await deployProxy(CoverMigrator, []);

  await Cover.link(coverUtilsLib);

  let cover = await deployProxy(DisposableCover, [
    qd.address,
    productsV1.address,
    ZERO_ADDRESS,
    ZERO_ADDRESS,
    ZERO_ADDRESS,
  ]);

  await cover.changeMasterAddress(master.address);

  const coverNFT = await CoverNFT.new('Nexus Mutual Cover', 'NMC', cover.address);

  const stakingPool = await IntegrationMockStakingPool.new(tk.address, cover.address, tc.address);

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
    emergencyAdmin,
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
    [ether('10000')], // initial tokens
    [owner], // advisory board members
  );

  await mr.setKycAuthAddress(ethersAccounts.defaultSender.address);

  await pc.initialize(mr.address);

  for (const category of proposalCategories) {
    await pc.addInitialCategory(...category, { gas: 10e6 });
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
    ether('20'), // min stake
    ether('20'), // min unstake
    10, // max exposure
    90 * 24 * 3600, // unstake lock time
  );

  await ic.initialize(master.address);

  const CLAIM_METHOD = {
    INDIVIDUAL_CLAIMS: 0,
    YIELD_TOKEN_INCIDENTS: 1,
  };

  await cover.changeDependentContractAddress();

  await cover.addProductTypes(
    [
      // Protocol Cover
      {
        descriptionIpfsHash: 'protocolCoverIPFSHash',
        claimMethod: CLAIM_METHOD.INDIVIDUAL_CLAIMS,
        gracePeriodInDays: 30,
      },
      // Custody Cover
      {
        descriptionIpfsHash: 'custodyCoverIPFSHash',
        claimMethod: CLAIM_METHOD.INDIVIDUAL_CLAIMS,
        gracePeriodInDays: 90,
      },
      // Yield Token Cover
      {
        descriptionIpfsHash: 'yieldTokenCoverIPFSHash',
        claimMethod: CLAIM_METHOD.YIELD_TOKEN_INCIDENTS,
        gracePeriodInDays: 14,
      },
    ],
    ['', '', ''],
  );

  await cover.addProducts(
    [
      {
        productType: 0, // Protocol Cover
        productAddress: '0x0000000000000000000000000000000000000000',
        coverAssets: 0, // Use fallback
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
      },
      {
        productType: 1, // Custody Cover
        productAddress: '0x0000000000000000000000000000000000000000',
        coverAssets: 0, // Use fallback
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
      },
      {
        productType: 2, // Yield Token Cover
        productAddress: '0x0000000000000000000000000000000000000001',
        coverAssets: 0b01, // ETH
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
      },
      {
        productType: 2, // Yield Token Cover
        productAddress: '0x0000000000000000000000000000000000000002',
        coverAssets: 0b10, // DAI
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
      },
    ],
    ['', '', '', ''],
  );

  await cover.setCoverAssetsFallback(0b11); // eth and dai

  await p1.updateAddressParameters(hex('SWP_OP'), swapOperator.address);

  await cover.updateUintParameters(
    [0, 1], // CoverUintParams.globalCapacityRatio, CoverUintParams.globalRewardsRatio
    [10000, 50],
  );

  await gv.changeMasterAddress(master.address);
  await master.switchGovernanceAddress(gv.address);

  await gateway.initialize(master.address, dai.address);

  await upgradeProxy(mr.address, MemberRoles);
  await upgradeProxy(tc.address, TokenController, [qd.address, lcr.address]);
  await upgradeProxy(ps.address, PooledStaking, [cover.address, productsV1.address]);
  await upgradeProxy(pc.address, ProposalCategory);
  await upgradeProxy(master.address, NXMaster);
  await upgradeProxy(gv.address, Governance);
  await upgradeProxy(gateway.address, Gateway);
  await upgradeProxy(ic.address, IndividualClaims, [tk.address, coverNFT.address]);
  await upgradeProxy(yt.address, YieldTokenIncidents, [tk.address, coverNFT.address]);
  await upgradeProxy(as.address, Assessment, [master.address]);

  await upgradeProxy(cover.address, Cover, [
    qd.address,
    productsV1.address,
    coverNFT.address,
    stakingPool.address,
    cover.address,
  ]);

  cover = await Cover.at(cover.address);
  as = await Assessment.at(as.address);

  // [todo] We should probably call changeDependentContractAddress on every contract
  await gateway.changeDependentContractAddress();
  await cover.changeDependentContractAddress();
  await ic.changeDependentContractAddress();
  await as.changeDependentContractAddress();

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

  const POOL_ETHER = ether('90000');
  const POOL_DAI = ether('2000000');

  // fund pool
  await web3.eth.sendTransaction({ from: owner, to: p1.address, value: POOL_ETHER });
  await dai.transfer(p1.address, POOL_DAI);

  const ethToDaiRate = 20000;

  const daiToEthRate = new BN(10).pow(new BN(36)).div(ether((ethToDaiRate / 100).toString()));
  await chainlinkDAI.setLatestAnswer(daiToEthRate);

  await as.initialize();

  const external = { chainlinkDAI, dai, weth, productsV1 };
  const nonUpgradable = { qd };
  const instances = { tk, cl, p1, mcr: mc };

  // we upgraded them, get non-disposable instances because
  const proxies = {
    master: await NXMaster.at(master.address),
    tc: await TokenController.at(tc.address),
    gv: await Governance.at(gv.address),
    pc: await ProposalCategory.at(pc.address),
    mr: await MemberRoles.at(mr.address),
    ps: await PooledStaking.at(ps.address),
    gateway: await Gateway.at(gateway.address),
    ic: await IndividualClaims.at(ic.address),
    yc: await YieldTokenIncidents.at(yt.address),
    cl: await CoverMigrator.at(cl.address),
    as: await Assessment.at(as.address),
    cover: await Cover.at(cover.address),
    coverNFT: await CoverNFT.at(coverNFT.address),
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

  this.withEthers = web3ToEthers(this, signers);

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
    const tx = await this.withEthers.contracts.cover.createStakingPool(
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
    const stakingPoolInstance = await IntegrationMockStakingPool.at(stakingPoolAddress);

    this.contracts['stakingPool' + i] = stakingPoolInstance;
  }

  this.withEthers = web3ToEthers(this, signers);
  this.accounts = ethersAccounts;
  this.DEFAULT_PRODUCT_INITIALIZATION = DEFAULT_PRODUCT_INITIALIZATION;
}

module.exports = setup;
