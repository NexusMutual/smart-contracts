const { ethers } = require('hardhat');

const { ContractTypes } = require('../utils').constants;
const { toBytes2 } = require('../utils').helpers;
const { proposalCategories } = require('../utils');
const { enrollMember, enrollABMember, getGovernanceSigner } = require('./utils/enroll');
const { getAccounts } = require('../utils/accounts');
const { impersonateAccount, setEtherBalance } = require('../utils').evm;

const { BigNumber } = ethers;
const { parseEther, parseUnits } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

const deployProxy = async (contract, deployParams = [], options = {}) => {
  const contractFactory = await ethers.getContractFactory(contract, options);
  const implementation = await contractFactory.deploy(...deployParams);
  const proxy = await ethers.deployContract('OwnedUpgradeabilityProxy', [implementation.address]);
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

async function setup() {
  const fixture = {};
  const accounts = await getAccounts();
  const { members, emergencyAdmin, advisoryBoardMembers } = accounts;
  const owner = accounts.defaultSender;
  const { stakingPoolManagers } = accounts;

  const QE = '0x51042c4d8936a7764d18370a6a0762b860bb8e07';
  const INITIAL_SUPPLY = parseEther('6750000'); // https://etherscan.io/token/0xd7c49cee7e9188cca6ad8ff264c1da2e69d4cf3b
  const INITIAL_SPOT_PRICE_B = parseEther('0.0152');

  const INVESTMENT_LIMIT = parseUnits('25000000', 6);

  // deploy external contracts
  const gnosisSafe = await ethers.deployContract('ERC20Mock');
  await setEtherBalance(gnosisSafe.address, parseEther('1000'));

  const weth = await ethers.deployContract('WETH9');

  const dai = await ethers.deployContract('ERC20MockNameable', ['MockDai', 'DAI']);
  await dai.mint(owner.address, parseEther('10000000'));

  const stETH = await ethers.deployContract('ERC20MockNameable', ['MockStETH', 'stETH']);
  await stETH.mint(owner.address, parseEther('10000000'));

  const rETH = await ethers.deployContract('ERC20MockNameable', ['MockReth', 'rETH']);
  await rETH.mint(owner.address, parseEther('10000000'));

  const enzymeVault = await ethers.deployContract('ERC20MockNameable', ['MockNxmty', 'NXMTY']);
  await enzymeVault.mint(owner.address, parseEther('10000000'));

  const usdcDecimals = 6;
  const usdc = await ethers.deployContract('ERC20CustomDecimalsMock', [usdcDecimals]);
  await usdc.mint(owner.address, parseUnits('10000000', usdcDecimals));

  const debtUsdcDecimals = 6;
  const debtUsdc = await ethers.deployContract('ERC20CustomDecimalsMock', [debtUsdcDecimals]);
  const aWETH = await ethers.deployContract('ERC20MockNameable', ['MockAweth', 'aWETH']);

  // fund gnosisSafe
  await aWETH.mint(gnosisSafe.address, parseEther('10000'));
  await usdc.mint(gnosisSafe.address, parseUnits('1000000', usdcDecimals));
  await debtUsdc.mint(gnosisSafe.address, parseUnits('1000000', usdcDecimals));

  const chainlinkDAI = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkDAI.setLatestAnswer(parseEther('1'));

  const chainlinkSteth = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkSteth.setLatestAnswer(parseEther('1'));

  const chainlinkReth = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkReth.setLatestAnswer(parseEther('1'));

  const chainlinkAweth = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkAweth.setLatestAnswer(parseEther('1'));

  const chainlinkUSDC = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkUSDC.setLatestAnswer(parseEther('1'));

  const chainlinkEnzymeVault = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkEnzymeVault.setLatestAnswer(parseEther('1'));

  const chainlinkSt = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkSt.setLatestAnswer(parseEther('1'));

  const ybDAI = await ethers.deployContract('ERC20Mock');
  await ybDAI.mint(owner.address, parseEther('10000000'));

  const ybETH = await ethers.deployContract('ERC20Mock');
  await ybETH.mint(owner.address, parseEther('10000000'));

  const ybUSDC = await ethers.deployContract('ERC20CustomDecimalsMock', [usdcDecimals]);
  await ybUSDC.mint(owner.address, parseEther('10000000'));

  const tk = await ethers.deployContract('NXMToken', [owner.address, INITIAL_SUPPLY]);

  const qd = await ethers.deployContract('TestnetQuotationData', [QE, owner.address]);

  // proxy contracts
  const master = await deployProxy('DisposableNXMaster');
  const mr = await deployProxy('DisposableMemberRoles', [tk.address]);
  const ps = await deployProxy('DisposablePooledStaking', [tk.address]);
  const ramm = await deployProxy('Ramm', [INITIAL_SPOT_PRICE_B]);
  const pc = await deployProxy('DisposableProposalCategory');
  const gv = await deployProxy('DisposableGovernance');
  const st = await deployProxy('SafeTracker', [
    INVESTMENT_LIMIT,
    gnosisSafe.address,
    usdc.address,
    dai.address,
    weth.address,
    aWETH.address,
    debtUsdc.address,
  ]);

  // non-proxy contracts
  const lcr = await ethers.deployContract('LegacyClaimsReward', [master.address, dai.address]);

  const mcrEth = parseEther('50000');
  const latestBlock = await ethers.provider.getBlock('latest');
  const lastUpdateTime = latestBlock.timestamp;
  const maxMCRIncrement = 500;
  const gearingFactor = 48000;
  const minUpdateTime = 3600;
  const desiredMCR = mcrEth;

  const disposableMCR = await ethers.deployContract('DisposableMCR', [
    mcrEth,
    desiredMCR,
    lastUpdateTime,
    maxMCRIncrement,
    gearingFactor,
    minUpdateTime,
  ]);

  // deploy MCR with DisposableMCR as a fake master
  const block = await ethers.provider.getBlock('latest');
  const mcrUpdateDeadline = block.timestamp + 30 * 24 * 3600;
  const mc = await ethers.deployContract('MCR', [disposableMCR.address, mcrUpdateDeadline]);

  // trigger initialize and update master address
  await disposableMCR.initializeNextMcr(mc.address, master.address);

  const priceFeedOracleAssets = [
    { contract: dai, aggregator: chainlinkDAI, decimals: 18 },
    { contract: stETH, aggregator: chainlinkSteth, decimals: 18 },
    { contract: rETH, aggregator: chainlinkReth, decimals: 18 },
    { contract: aWETH, aggregator: chainlinkAweth, decimals: 18 },
    { contract: st, aggregator: chainlinkSt, decimals: 18 },
    { contract: enzymeVault, aggregator: chainlinkEnzymeVault, decimals: 18 },
    { contract: usdc, aggregator: chainlinkUSDC, decimals: usdcDecimals },
    { contract: debtUsdc, aggregator: chainlinkUSDC, decimals: debtUsdcDecimals },
  ];
  const priceFeedOracle = await ethers.deployContract('PriceFeedOracle', [
    priceFeedOracleAssets.map(a => a.contract.address),
    priceFeedOracleAssets.map(a => a.aggregator.address),
    priceFeedOracleAssets.map(a => a.decimals),
    st.address,
  ]);

  const cowVaultRelayer = await ethers.deployContract('SOMockVaultRelayer');
  const cowSettlement = await ethers.deployContract('SOMockSettlement', [cowVaultRelayer.address]);
  const swapOperator = await ethers.deployContract('SwapOperator', [
    cowSettlement.address,
    owner.address, // _swapController,
    master.address,
    weth.address,
    AddressZero, // _enzymeV4VaultProxyAddress
    AddressZero, // _safe
    dai.address, // _dai
    usdc.address, // _usdc
    AddressZero, // _enzymeFundValueCalculatorRouter
    '0',
  ]);

  const legacyPool = await ethers.deployContract(
    'LegacyPool',
    [master, priceFeedOracle, swapOperator, dai, stETH, enzymeVault, tk].map(c => c.address),
  );

  const stakingNFTDescriptor = await ethers.deployContract('StakingNFTDescriptor');
  const coverNFTDescriptor = await ethers.deployContract('CoverNFTDescriptor', [master.address]);

  // 1. deploy StakingPoolFactory, StakingNFT and CoverNFT with owner as temporary operator
  const spf = await ethers.deployContract('StakingPoolFactory', [owner.address]);
  const stakingNFT = await ethers.deployContract('StakingNFT', [
    'Nexus Mutual Deposit',
    'NMD',
    spf.address,
    owner.address,
    stakingNFTDescriptor.address,
  ]);
  const coverNFT = await ethers.deployContract('CoverNFT', [
    'Nexus Mutual Cover',
    'NMC',
    owner.address,
    coverNFTDescriptor.address,
  ]);

  // 2. deploy Cover, StakingProducts, CoverProducts and TokenController proxies
  let cover = await deployProxy('Stub');
  let stakingProducts = await deployProxy('Stub');
  let tc = await deployProxy('Stub');

  // 3. deploy StakingPool implementation
  const stakingExtrasLib = await ethers.deployContract('StakingExtrasLib');
  await stakingExtrasLib.deployed();

  const spArgs = [stakingNFT, tk, cover, tc, master, stakingProducts].map(c => c.address);
  const stakingPool = await ethers.deployContract('StakingPool', spArgs, {
    libraries: { StakingExtrasLib: stakingExtrasLib.address },
  });

  // 4. deploy implementations and upgrade Cover, StakingProducts and DisposableTokenController proxies
  await upgradeProxy(cover.address, 'Cover', [coverNFT.address, stakingNFT.address, spf.address, stakingPool.address]);
  cover = await ethers.getContractAt('Cover', cover.address);

  await upgradeProxy(stakingProducts.address, 'StakingProducts', [cover.address, spf.address]);
  stakingProducts = await ethers.getContractAt('StakingProducts', stakingProducts.address);

  // TODO: get rid of DisposableTokenController and use TokenController instead with owner as operator
  await upgradeProxy(tc.address, 'DisposableTokenController', [
    qd.address,
    lcr.address,
    spf.address,
    tk.address,
    stakingNFT.address,
  ]);
  tc = await ethers.getContractAt('DisposableTokenController', tc.address);

  // 5. update operators
  await spf.changeOperator(stakingProducts.address);
  await stakingNFT.changeOperator(cover.address);
  await coverNFT.changeOperator(cover.address);
  await cover.changeMasterAddress(master.address);
  await stakingProducts.changeMasterAddress(master.address);

  const ci = await deployProxy('IndividualClaims', [tk.address, coverNFT.address]);
  const cg = await deployProxy('YieldTokenIncidents', [tk.address, coverNFT.address]);
  const as = await deployProxy('Assessment', [tk.address]);
  const coverProducts = await deployProxy('CoverProducts');

  await coverProducts.changeMasterAddress(master.address);

  const contractType = code => {
    const upgradable = ['MC', 'P1', 'CR'];
    const proxies = ['GV', 'MR', 'PC', 'PS', 'TC', 'CI', 'CG', 'AS', 'CO', 'SP', 'RA', 'ST', 'CP'];

    if (upgradable.includes(code)) {
      return ContractTypes.Replaceable;
    }

    if (proxies.includes(code)) {
      return ContractTypes.Proxy;
    }

    return 0;
  };

  const addressCodes = [
    { address: qd.address, code: 'QD' },
    { address: tc.address, code: 'TC' },
    { address: legacyPool.address, code: 'P1' },
    { address: mc.address, code: 'MC' },
    { address: owner.address, code: 'GV' },
    { address: pc.address, code: 'PC' },
    { address: mr.address, code: 'MR' },
    { address: ps.address, code: 'PS' },
    { address: ci.address, code: 'CI' },
    { address: cg.address, code: 'CG' },
    { address: as.address, code: 'AS' },
    { address: cover.address, code: 'CO' },
    { address: lcr.address, code: 'CR' },
    { address: stakingProducts.address, code: 'SP' },
    { address: ramm.address, code: 'RA' },
    { address: st.address, code: 'ST' },
    { address: coverProducts.address, code: 'CP' },
  ];

  await master.initialize(
    owner.address,
    tk.address,
    emergencyAdmin.address,
    addressCodes.map(ac => toBytes2(ac.code)), // codes
    addressCodes.map(ac => contractType(ac.code)), // types
    addressCodes.map(ac => ac.address), // addresses
  );

  await legacyPool.changeDependentContractAddress();

  await ramm.changeMasterAddress(master.address);
  await ramm.changeDependentContractAddress();
  await ramm.connect(emergencyAdmin).setEmergencySwapPause(false);

  // Manually add pool assets that are not automatically added via LegacyPool constructor
  await legacyPool.addAsset(
    usdc.address,
    true,
    parseUnits('1000000', usdcDecimals),
    parseUnits('2000000', usdcDecimals),
    250,
  );
  await legacyPool.addAsset(rETH.address, false, parseEther('10000'), parseEther('20000'), 250);
  await legacyPool.addAsset(st.address, false, parseEther('10000'), parseEther('20000'), 250);

  await tc.initialize(master.address, ps.address, as.address);
  await tc.addToWhitelist(lcr.address);

  await mr.initialize(
    owner.address,
    master.address,
    tc.address,
    [owner.address], // initial members
    [parseEther('10000')], // initial tokens
    [owner.address], // advisory board members
  );

  await mr.setKycAuthAddress(owner.address);

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

  const CLAIM_METHOD = {
    INDIVIDUAL_CLAIMS: 0,
    YIELD_TOKEN_INCIDENTS: 1,
  };

  await cover.changeDependentContractAddress();
  await stakingProducts.changeDependentContractAddress();
  await coverProducts.changeDependentContractAddress();

  await coverProducts.setProductTypes([
    {
      // Protocol Cover
      productTypeName: 'Protocol',
      productTypeId: MaxUint256,
      ipfsMetadata: 'protocolCoverIPFSHash',
      productType: {
        descriptionIpfsHash: 'protocolCoverIPFSHash',
        claimMethod: CLAIM_METHOD.INDIVIDUAL_CLAIMS,
        gracePeriod: 30 * 24 * 3600, // 30 days
      },
    },
    {
      // Custody Cover
      productTypeName: 'Custody',
      productTypeId: MaxUint256,
      ipfsMetadata: 'custodyCoverIPFSHash',
      productType: {
        descriptionIpfsHash: 'custodyCoverIPFSHash',
        claimMethod: CLAIM_METHOD.INDIVIDUAL_CLAIMS,
        gracePeriod: 90 * 24 * 3600, // 90 days
      },
    },
    // Yield Token Cover
    {
      productTypeName: 'Yield Token',
      productTypeId: MaxUint256,
      ipfsMetadata: 'yieldTokenCoverIPFSHash',
      productType: {
        descriptionIpfsHash: 'yieldTokenCoverIPFSHash',
        claimMethod: CLAIM_METHOD.YIELD_TOKEN_INCIDENTS,
        gracePeriod: 14 * 24 * 3600, // 14 days
      },
    },
  ]);

  const defaultProduct = {
    productName: 'Product 0',
    productId: MaxUint256,
    ipfsMetadata: 'product 0 metadata',
    product: {
      productType: 0, // Protocol Cover
      yieldTokenAddress: AddressZero,
      coverAssets: 0, // Use fallback
      initialPriceRatio: 100,
      capacityReductionRatio: 0,
      useFixedPrice: false,
    },
    allowedPools: [],
  };

  // set default product
  await coverProducts.setProducts([defaultProduct]);

  await gv.changeMasterAddress(master.address);

  await master.switchGovernanceAddress(gv.address);

  await upgradeProxy(mr.address, 'MemberRoles', [tk.address]);
  await upgradeProxy(ps.address, 'LegacyPooledStaking', [cover.address, stakingNFT.address, tk.address]);
  await upgradeProxy(pc.address, 'ProposalCategory');
  await upgradeProxy(master.address, 'NXMaster');
  await upgradeProxy(gv.address, 'Governance');
  await upgradeProxy(tc.address, 'TokenController', [
    qd.address,
    lcr.address,
    spf.address,
    tk.address,
    stakingNFT.address,
  ]);

  // replace legacy pool after Ramm is initialized
  const governanceSigner = await getGovernanceSigner(gv);
  const p1 = await ethers.deployContract(
    'Pool',
    [master, priceFeedOracle, swapOperator, tk, legacyPool].map(c => c.address),
  );

  // deploy CoverBroker
  const coverBroker = await ethers.deployContract('CoverBroker', [
    cover.address,
    mr.address,
    tk.address,
    master.address,
    owner.address,
  ]);

  // deploy viewer contracts
  const stakingViewer = await ethers.deployContract('StakingViewer', [master.address, stakingNFT.address, spf.address]);
  const assessmentViewer = await ethers.deployContract('AssessmentViewer', [master.address]);
  const nexusViewer = await ethers.deployContract('NexusViewer', [
    master.address,
    stakingViewer.address,
    assessmentViewer.address,
  ]);

  await master.connect(governanceSigner).upgradeMultipleContracts([toBytes2('P1')], [p1.address]);

  // [todo] We should probably call changeDependentContractAddress on every contract
  await cover.changeDependentContractAddress();
  await ramm.changeDependentContractAddress();
  await ci.changeDependentContractAddress();
  await cg.changeDependentContractAddress();
  await as.changeDependentContractAddress();
  await mc.changeDependentContractAddress();
  await mr.changeDependentContractAddress();
  await tc.changeDependentContractAddress();

  await transferProxyOwnership(mr.address, master.address);
  await transferProxyOwnership(tc.address, master.address);
  await transferProxyOwnership(ps.address, master.address);
  await transferProxyOwnership(pc.address, master.address);
  await transferProxyOwnership(gv.address, master.address);
  await transferProxyOwnership(ci.address, master.address);
  await transferProxyOwnership(cg.address, master.address);
  await transferProxyOwnership(as.address, master.address);
  await transferProxyOwnership(cover.address, gv.address);
  await transferProxyOwnership(master.address, gv.address);

  // Ensure ALL pool supported assets has fund (except st)
  const POOL_ETHER = parseEther('90000');
  const poolAssets = [
    { asset: dai, poolValue: parseEther('2000000') },
    { asset: usdc, poolValue: parseUnits('2000000', usdcDecimals) },
    { asset: stETH, poolValue: parseEther('33202') },
    { asset: rETH, poolValue: parseEther('13358') },
    { asset: enzymeVault, poolValue: parseEther('15348') },
  ];
  await owner.sendTransaction({ to: p1.address, value: POOL_ETHER.toString() });
  await Promise.all(poolAssets.map(pa => pa.asset.transfer(p1.address, pa.poolValue)));

  // Rates
  const assetToEthRate = (rate, powValue = 36) => BigNumber.from(10).pow(BigNumber.from(powValue)).div(rate);

  const ethToDaiRate = 20000;
  const ethToNxmtyRate = 1000;
  const ethToUsdcRate = parseUnits('200', usdcDecimals);

  const daiToEthRate = assetToEthRate(parseEther((ethToDaiRate / 100).toString()));
  const nxmtyToEthRate = assetToEthRate(parseEther((ethToNxmtyRate / 100).toString()));
  const usdcToEthRate = assetToEthRate(ethToUsdcRate, 24);

  await chainlinkDAI.setLatestAnswer(daiToEthRate);
  await chainlinkUSDC.setLatestAnswer(usdcToEthRate);
  await chainlinkEnzymeVault.setLatestAnswer(nxmtyToEthRate);

  const external = {
    chainlinkDAI,
    dai,
    usdc,
    debtUsdc,
    weth,
    stETH,
    rETH,
    aWETH,
    enzymeVault,
    ybDAI,
    ybETH,
    ybUSDC,
  };
  const nonUpgradable = { qd, spf, coverNFT, stakingNFT };
  const instances = { tk, p1, mcr: mc, lcr };

  // we upgraded them, get non-disposable instances because
  const proxies = {
    master: await ethers.getContractAt('NXMaster', master.address),
    tc: await ethers.getContractAt('TokenController', tc.address),
    gv: await ethers.getContractAt('Governance', gv.address),
    pc: await ethers.getContractAt('ProposalCategory', pc.address),
    mr: await ethers.getContractAt('MemberRoles', mr.address),
    ps: await ethers.getContractAt('LegacyPooledStaking', ps.address),
    ra: await ethers.getContractAt('Ramm', ramm.address),
    st: await ethers.getContractAt('SafeTracker', st.address),
    ci: await ethers.getContractAt('IndividualClaims', ci.address),
    cg: await ethers.getContractAt('YieldTokenIncidents', cg.address),
    as: await ethers.getContractAt('Assessment', as.address),
    cover: await ethers.getContractAt('Cover', cover.address),
  };

  const nonInternal = { priceFeedOracle, swapOperator, coverBroker, stakingViewer, assessmentViewer, nexusViewer };

  fixture.contracts = {
    ...external,
    ...nonUpgradable,
    ...instances,
    ...proxies,
    ...nonInternal,
  };

  fixture.rates = {
    ethToDaiRate,
    ethToNxmtyRate,
    ethToUsdcRate,
    daiToEthRate,
    usdcToEthRate,
    nxmtyToEthRate,
  };

  fixture.contractType = contractType;

  await enrollMember(fixture.contracts, members, owner);
  await enrollMember(fixture.contracts, stakingPoolManagers, owner);
  await enrollMember(fixture.contracts, advisoryBoardMembers, owner);
  await enrollABMember(fixture.contracts, advisoryBoardMembers);

  // enroll coverBroker as member
  await impersonateAccount(coverBroker.address);
  await setEtherBalance(coverBroker.address, parseEther('1000'));
  const coverBrokerSigner = await ethers.getSigner(coverBroker.address);
  accounts.coverBrokerSigner = coverBrokerSigner;
  await enrollMember(fixture.contracts, [coverBrokerSigner], owner, { initialTokens: parseEther('0') });

  const product = {
    productId: 0,
    weight: 100,
    initialPrice: 1000,
    targetPrice: 100,
  };

  const DEFAULT_PRODUCTS = [product];
  const DEFAULT_POOL_FEE = '5';

  for (let i = 0; i < 10; i++) {
    await stakingProducts.connect(stakingPoolManagers[i]).createStakingPool(
      false, // isPrivatePool,
      DEFAULT_POOL_FEE, // initialPoolFee
      DEFAULT_POOL_FEE, // maxPoolFee,
      DEFAULT_PRODUCTS,
      'ipfs-hash', // ipfs hash
    );

    const poolId = i + 1;
    const stakingPoolAddress = await stakingProducts.stakingPool(poolId);
    const stakingPoolInstance = await ethers.getContractAt('StakingPool', stakingPoolAddress);

    fixture.contracts['stakingPool' + poolId] = stakingPoolInstance;
  }

  // set the rest of the products
  const productList = [
    {
      productName: 'Product 1',
      productId: MaxUint256,
      ipfsMetadata: 'product 1 metadata',
      product: {
        productType: 1, // Custody Cover
        yieldTokenAddress: AddressZero,
        coverAssets: 0, // Use fallback
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
        useFixedPrice: false,
      },
      allowedPools: [],
    },
    {
      productName: 'Product 2',
      productId: MaxUint256,
      ipfsMetadata: 'product 2 metadata',
      product: {
        productType: 2, // Yield Token Cover
        yieldTokenAddress: ybETH.address,
        coverAssets: 0b01, // ETH
        initialPriceRatio: 500,
        capacityReductionRatio: 0,
        useFixedPrice: false,
      },
      allowedPools: [],
    },
    {
      productName: 'Product 3',
      productId: MaxUint256,
      ipfsMetadata: 'product 3 metadata',
      product: {
        productType: 2, // Yield Token Cover
        yieldTokenAddress: ybDAI.address,
        coverAssets: 0b10, // DAI
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
        useFixedPrice: false,
      },
      allowedPools: [],
    },
    {
      productName: 'Product 4',
      productId: MaxUint256,
      ipfsMetadata: 'product 4 metadata',
      product: {
        productType: 0, // Protocol Cover
        yieldTokenAddress: AddressZero,
        coverAssets: 0, // Use fallback
        initialPriceRatio: 500,
        capacityReductionRatio: 0,
        useFixedPrice: true,
      },
      allowedPools: [1, 7],
    },
    {
      productName: 'Product 5',
      productId: MaxUint256,
      ipfsMetadata: 'product 5 metadata',
      product: {
        productType: 2, // Yield Token Cover
        yieldTokenAddress: ybUSDC.address,
        coverAssets: 0b10000, // USDC
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
        useFixedPrice: false,
      },
      allowedPools: [],
    },
    {
      productName: 'Product 6',
      productId: MaxUint256,
      ipfsMetadata: 'product 6 metadata',
      product: {
        productType: 0, // Protocol Cover
        yieldTokenAddress: ybUSDC.address,
        coverAssets: 0b10000, // use usdc
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
        useFixedPrice: false,
      },
      allowedPools: [],
    },
    {
      productName: 'Product 7',
      productId: MaxUint256,
      ipfsMetadata: 'product 7 metadata',
      product: {
        productType: 0, // Protocol Cover
        yieldTokenAddress: AddressZero,
        coverAssets: 0, // Use fallback
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
        useFixedPrice: true,
        isDeprecated: true,
      },
      allowedPools: [],
    },
  ];

  await coverProducts.setProducts(productList);

  const config = {
    TRANCHE_DURATION: await fixture.contracts.stakingPool1.TRANCHE_DURATION(),
    BUCKET_SIZE: BigNumber.from(7 * 24 * 3600), // 7 days
    BUCKET_DURATION: BigNumber.from(28 * 24 * 3600), // 28 days
    GLOBAL_REWARDS_RATIO: BigNumber.from(5000), // 50%
    COMMISSION_DENOMINATOR: BigNumber.from(10000),
    TARGET_PRICE_DENOMINATOR: await stakingProducts.TARGET_PRICE_DENOMINATOR(),
    ONE_NXM: parseEther('1'),
    NXM_PER_ALLOCATION_UNIT: await stakingPool.NXM_PER_ALLOCATION_UNIT(),
    USDC_DECIMALS: usdcDecimals,
  };

  fixture.contracts.stakingProducts = stakingProducts;
  fixture.contracts.coverProducts = coverProducts;
  fixture.contracts.coverNFTDescriptor = coverNFTDescriptor;
  fixture.contracts.stakingNFTDescriptor = stakingNFTDescriptor;
  fixture.config = config;
  fixture.accounts = accounts;
  fixture.DEFAULT_PRODUCTS = DEFAULT_PRODUCTS;
  fixture.productList = [defaultProduct, ...productList];

  return fixture;
}

module.exports = setup;
