const { ethers, nexus } = require('hardhat');
const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const { hexlify } = require('ethers/lib/utils');

const { parseEther, parseUnits, ZeroAddress, MaxUint256 } = ethers;
const { ContractIndexes, AggregatorType, Assets } = nexus.constants;
const { numberToBytes32 } = nexus.helpers;

const assignRoles = accounts => ({
  defaultSender: accounts[0],
  nonMembers: accounts.slice(1, 5),
  members: accounts.slice(5, 10),
  advisoryBoardMembers: accounts.slice(10, 15),
  internalContracts: accounts.slice(15, 20),
  nonInternalContracts: accounts.slice(20, 25),
  governanceContracts: accounts.slice(25, 30),
  stakingPoolManagers: accounts.slice(30, 40),
  emergencyAdmin: accounts[40],
  generalPurpose: accounts.slice(41),
});

async function setup() {
  const accounts = assignRoles(await ethers.getSigners());
  const {
    // basic accounts
    advisoryBoardMembers,
    defaultSender,
    emergencyAdmin,
    members,
    stakingPoolManagers,
  } = accounts;

  const INITIAL_SUPPLY = parseEther('6750000');
  const INITIAL_SPOT_PRICE_B = parseEther('0.0152');
  const INVESTMENT_LIMIT = parseUnits('25000000', 6);

  // deploy external contracts
  const investmentSafe = await ethers.deployContract('ERC20Mock');
  await setBalance(await investmentSafe.getAddress(), parseEther('1000'));

  const weth = await ethers.deployContract('WETH9');

  const dai = await ethers.deployContract('ERC20Mock');
  await dai.setMetadata('MockDai', 'DAI', 18);

  const stETH = await ethers.deployContract('ERC20Mock');
  await stETH.setMetadata('MockStETH', 'stETH', 18);

  const rETH = await ethers.deployContract('ERC20Mock');
  await rETH.setMetadata('MockReth', 'rETH', 18);

  const enzymeVault = await ethers.deployContract('ERC20Mock');
  await enzymeVault.setMetadata('MockNxmty', 'NXMTY', 18);

  const usdcDecimals = 6;
  const usdc = await ethers.deployContract('ERC20Mock');
  await usdc.setMetadata('MockUsdc', 'USDC', usdcDecimals);

  const debtUsdcDecimals = 6;
  const debtUsdc = await ethers.deployContract('ERC20Mock');
  await debtUsdc.setMetadata('MockDebtUsdc', 'debtUSDC', debtUsdcDecimals);

  const aWETH = await ethers.deployContract('ERC20Mock');
  await aWETH.setMetadata('MockAweth', 'aWETH', 18);

  // fund investmentSafe
  await aWETH.setBalance(investmentSafe, parseEther('10000'));
  await usdc.setBalance(investmentSafe, parseUnits('1000000', usdcDecimals));
  await debtUsdc.setBalance(investmentSafe, parseUnits('1000000', usdcDecimals));

  // deploy oracles

  // eth usd oracle
  const chainlinkEthUsd = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkEthUsd.setLatestAnswer(parseUnits('2500', 8));
  await chainlinkEthUsd.setDecimals(8);

  // eth derivatives
  const chainlinkSteth = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkSteth.setLatestAnswer(parseEther('1'));

  const chainlinkReth = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkReth.setLatestAnswer(parseEther('1'));

  const chainlinkAweth = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkAweth.setLatestAnswer(parseEther('1'));

  // stablecoins
  const chainlinkDAI = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkDAI.setLatestAnswer(parseEther('1'));

  const chainlinkUSDC = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkUSDC.setLatestAnswer(parseEther('1'));

  // enzyme vault
  const chainlinkEnzymeVault = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkEnzymeVault.setLatestAnswer(parseEther('1'));

  // deploy registry

  const registryProxy = await ethers.deployContract('UpgradeableProxy');
  const legacyMaster = await ethers.deployContract('LegacyMaster');
  const registryImplementation = await ethers.deployContract('DisposableRegistry', [registryProxy, legacyMaster]);
  await registryProxy.upgradeTo(registryImplementation);
  const registry = await ethers.getContractAt('DisposableRegistry', registryProxy);

  // initialize registry

  await registry.setGovernor(defaultSender);
  await registry.addContract(
    ContractIndexes.C_REGISTRY,
    registry,
    false, // registry does not track itself as a proxy
  );

  const proxyStubIndexes = [
    ContractIndexes.C_TOKEN_CONTROLLER,
    ContractIndexes.C_POOL,
    ContractIndexes.C_COVER,
    ContractIndexes.C_COVER_PRODUCTS,
    ContractIndexes.C_STAKING_PRODUCTS,
    ContractIndexes.C_RAMM,
    ContractIndexes.C_SAFE_TRACKER,
    ContractIndexes.C_LIMIT_ORDERS,
    ContractIndexes.C_SWAP_OPERATOR,
    ContractIndexes.C_ASSESSMENT,
    ContractIndexes.C_CLAIMS,
  ];

  for (let i = 0; i < proxyStubIndexes.length; i++) {
    console.log('contract index:', proxyStubIndexes[i]);
    console.log('salt:', numberToBytes32(i));
    await registry.deployContract(proxyStubIndexes[i], numberToBytes32(i), ZeroAddress);
  }

  const token = await ethers.deployContract('NXMToken', [defaultSender, INITIAL_SUPPLY]);
  const coverAddress = await registry.getContractAddressByIndex(ContractIndexes.C_COVER);

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [coverAddress]);

  const stakingNFTDescriptor = await ethers.deployContract('StakingNFTDescriptor');
  const stakingNFT = await ethers.deployContract('StakingNFT', [
    'Nexus Mutual Deposit',
    'NMD',
    stakingPoolFactory,
    coverAddress, // operator
    stakingNFTDescriptor,
  ]);

  const coverNFTDescriptor = await ethers.deployContract('CoverNFTDescriptor', [coverAddress]);
  const coverNFT = await ethers.deployContract('CoverNFT', [
    'Nexus Mutual Cover',
    'NMC',
    coverAddress, // operator
    coverNFTDescriptor,
  ]);

  await registry.addContract(ContractIndexes.C_TOKEN, token, false);
  await registry.addContract(ContractIndexes.C_COVER_NFT, coverNFT, false);
  await registry.addContract(ContractIndexes.C_STAKING_NFT, stakingNFT, false);

  // deploy proxy implementations

  const governorImplementation = await ethers.deployContract('Governor', [registry]);
  const tokenControllerImplementation = await ethers.deployContract('TokenController', [
    stakingPoolFactory,
    token,
    stakingNFT,
  ]);
  const poolImplementation = await ethers.deployContract('Pool', [registry]);

  const stakingPoolImplementation = await ethers.deployContract('StakingPool', [
    stakingNFT,
    token,
    coverAddress,
    await registry.getContractAddressByIndex(ContractIndexes.C_TOKEN_CONTROLLER),
    registry, // master
    await registry.getContractAddressByIndex(ContractIndexes.C_STAKING_PRODUCTS),
  ]);

  const coverImplementation = await ethers.deployContract('Cover', [
    coverNFT,
    stakingNFT,
    stakingPoolFactory,
    stakingPoolImplementation,
  ]);

  // TODO: call on proxy!
  // await coverImplementation.changeMasterAddress(registry);
  // await coverImplementation.changeDependentContractAddress();

  const coverProductsImplementation = await ethers.deployContract('CoverProducts', []);

  const stakingProductsImplementation = await ethers.deployContract('StakingProducts', [
    coverAddress,
    stakingPoolFactory,
  ]);

  const rammImplementation = await ethers.deployContract('Ramm', [registry, INITIAL_SPOT_PRICE_B]);

  const safeTrackerImplementation = await ethers.deployContract('SafeTracker', [
    registry,
    INVESTMENT_LIMIT,
    investmentSafe,
    usdc,
    dai,
    weth,
    aWETH,
    debtUsdc,
  ]);

  const limitOrdersImplementation = await ethers.deployContract('LimitOrders', [token, weth, defaultSender]);

  const swapOperatorImplementation = await ethers.deployContract('SwapOperator', [
    registry,
    ZeroAddress, // _cowSettlement - no swaps in integration testing
    ZeroAddress, // _enzymeV4VaultProxyAddress - no enzyme in integration testing
    ZeroAddress, // _enzymeFundValueCalculatorRouter
    weth,
    investmentSafe,
    defaultSender, // swap controller
  ]);

  const assessmentImplementation = await ethers.deployContract('Assessment', [token]);

  const claimsImplementation = await ethers.deployContract('IndividualClaims', [coverNFT]);

  // upgrade proxies

  await registry.upgradeContract(ContractIndexes.C_TOKEN_CONTROLLER, tokenControllerImplementation);
  await registry.upgradeContract(ContractIndexes.C_POOL, poolImplementation);
  await registry.upgradeContract(ContractIndexes.C_COVER, coverImplementation);
  await registry.upgradeContract(ContractIndexes.C_COVER_PRODUCTS, coverProductsImplementation);
  await registry.upgradeContract(ContractIndexes.C_STAKING_PRODUCTS, stakingProductsImplementation);
  await registry.upgradeContract(ContractIndexes.C_RAMM, rammImplementation);
  await registry.upgradeContract(ContractIndexes.C_SAFE_TRACKER, safeTrackerImplementation);
  await registry.upgradeContract(ContractIndexes.C_LIMIT_ORDERS, limitOrdersImplementation);
  await registry.upgradeContract(ContractIndexes.C_SWAP_OPERATOR, swapOperatorImplementation);
  await registry.upgradeContract(ContractIndexes.C_ASSESSMENT, assessmentImplementation);
  await registry.upgradeContract(ContractIndexes.C_CLAIMS, claimsImplementation);

  await registry.replaceGovernor(numberToBytes32(1337), governorImplementation);

  const masterAwareConctracts = [
    ContractIndexes.C_TOKEN_CONTROLLER,
    ContractIndexes.C_COVER,
    ContractIndexes.C_COVER_PRODUCTS,
    ContractIndexes.C_STAKING_PRODUCTS,
    ContractIndexes.C_LIMIT_ORDERS,
    // TODO: remove Assessment and Claims from here once we've merged the new assessment
    ContractIndexes.C_ASSESSMENT,
    ContractIndexes.C_CLAIMS,
  ];

  // !!!!!! CONTINUE FROM HERE
  // TODO: deploy (Legacy)NXMaster

  for (const contract of masterAwareConctracts) {
    const contractAddress = await registry.getContractAddressByIndex(contract);
    const masterAwareContract = await ethers.getContractAt('IMasterAwareV2', contractAddress);
    await masterAwareContract.changeMasterAddress(legacyMaster);
    await masterAwareContract.changeDependentContractAddress();
  }

  // whatever was here before

  const priceFeedOracleAssets = [
    { contract: dai, aggregator: chainlinkDAI, aggregatorType: AggregatorType.ETH, decimals: 18 },
    { contract: stETH, aggregator: chainlinkSteth, aggregatorType: AggregatorType.ETH, decimals: 18 },
    { contract: rETH, aggregator: chainlinkReth, aggregatorType: AggregatorType.ETH, decimals: 18 },
    { contract: aWETH, aggregator: chainlinkAweth, aggregatorType: AggregatorType.ETH, decimals: 18 },
    { contract: safeTrackerAddress, aggregator: safeTrackerAddress, aggregatorType: AggregatorType.ETH, decimals: 18 },
    { contract: enzymeVault, aggregator: chainlinkEnzymeVault, aggregatorType: AggregatorType.ETH, decimals: 18 },
    { contract: usdc, aggregator: chainlinkUSDC, aggregatorType: AggregatorType.ETH, decimals: usdcDecimals },
    { contract: debtUsdc, aggregator: chainlinkUSDC, aggregatorType: AggregatorType.ETH, decimals: debtUsdcDecimals },
    { contract: Assets.ETH, aggregator: chainlinkEthUsd, aggregatorType: AggregatorType.USD, decimals: 18 },
  ];

  const legacyPool = await ethers.deployContract(
    'LegacyPool',
    [master, priceFeedOracle, swapOperator, dai, stETH, enzymeVault, token].map(c => c.address),
  );

  // update operators  await spf.changeOperator(stakingProducts.address);
  await stakingNFT.changeOperator(cover.address);
  await coverNFT.changeOperator(cover.address);
  await cover.changeMasterAddress(master.address);
  await stakingProducts.changeMasterAddress(master.address);

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

  await tc.changeMasterAddress(master.address);
  await token.changeOperator(tc.address);

  // whitelist Assessment contract
  await impersonateAccount(mr.address);
  await setNextBlockBaseFee(0);
  await tc.connect(await ethers.getSigner(mr.address)).addToWhitelist(as.address, { gasPrice: 0 });

  await mr.initialize(
    owner.address,
    master.address,
    tc.address,
    [owner.address], // initial members
    [parseEther('10000')], // initial tokens
    [owner.address], // advisory board members
  );

  await gv.initialize(
    3 * 24 * 3600, // tokenHoldingTime
    14 * 24 * 3600, // maxDraftTime
    5, // maxVoteWeigthPer
    40, // maxFollowers
    75, // specialResolutionMajPerc
    24 * 3600, // actionWaitingTime
  );

  const CLAIM_METHOD = {
    INDIVIDUAL_CLAIMS: 0,
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
  ]);

  const defaultProduct = {
    productName: 'Product 0',
    productId: MaxUint256,
    ipfsMetadata: 'product 0 metadata',
    product: {
      productType: 0, // Protocol Cover
      minPrice: 0,
      __gap: 0,
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

  await upgradeProxy(mr.address, 'MemberRoles', [token.address]);
  await upgradeProxy(pc.address, 'ProposalCategory');
  await upgradeProxy(master.address, 'NXMaster');
  await upgradeProxy(gv.address, 'Governance');

  // replace legacy pool after Ramm is initialized
  const governanceSigner = await getGovernanceSigner(gv);
  const p1 = await ethers.deployContract(
    'Pool',
    [master, priceFeedOracle, swapOperator, token, legacyPool].map(c => c.address),
  );

  // deploy CoverBroker
  const coverBroker = await ethers.deployContract('CoverBroker', [
    cover.address,
    mr.address,
    token.address,
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
  await as.changeDependentContractAddress();
  await mc.changeDependentContractAddress();
  await mr.changeDependentContractAddress();
  await tc.changeDependentContractAddress();

  await transferProxyOwnership(mr.address, master.address);
  await transferProxyOwnership(tc.address, master.address);
  await transferProxyOwnership(pc.address, master.address);
  await transferProxyOwnership(gv.address, master.address);
  await transferProxyOwnership(ci.address, master.address);
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
  const assetToEthRate = (rate, powValue = 36) => BigInt(10).pow(BigInt(powValue)).div(rate);

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
  };
  const nonUpgradable = { spf, coverNFT, stakingNFT };
  const instances = { tk: token, p1, mcr: mc };

  // we upgraded them, get non-disposable instances because
  const proxies = {
    master: await ethers.getContractAt('NXMaster', master.address),
    tc: await ethers.getContractAt('TokenController', tc.address),
    gv: await ethers.getContractAt('Governance', gv.address),
    pc: await ethers.getContractAt('ProposalCategory', pc.address),
    mr: await ethers.getContractAt('MemberRoles', mr.address),
    ra: await ethers.getContractAt('Ramm', ramm.address),
    st: await ethers.getContractAt('SafeTracker', st.address),
    ci: await ethers.getContractAt('IndividualClaims', ci.address),
    as: await ethers.getContractAt('Assessment', as.address),
    cover: await ethers.getContractAt('Cover', cover.address),
    limitOrders: await ethers.getContractAt('LimitOrders', limitOrders.address),
  };

  const nonInternal = {
    priceFeedOracle,
    swapOperator,
    coverBroker,
    stakingViewer,
    assessmentViewer,
    nexusViewer,
  };

  const fixture = {};

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
        minPrice: 0,
        __gap: 0,
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
        productType: 0, // Protocol Cover
        minPrice: 0,
        __gap: 0,
        coverAssets: 0, // Use fallback
        initialPriceRatio: 500,
        capacityReductionRatio: 0,
        useFixedPrice: true,
      },
      allowedPools: [1, 7],
    },
    {
      productName: 'Product 3',
      productId: MaxUint256,
      ipfsMetadata: 'product 3 metadata',
      product: {
        productType: 0, // Protocol Cover
        minPrice: 0,
        __gap: 0,
        coverAssets: 0b10000, // use usdc
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
        minPrice: 0,
        __gap: 0,
        coverAssets: 0, // Use fallback
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
        useFixedPrice: true,
        isDeprecated: true,
      },
      allowedPools: [],
    },
    {
      productName: 'Product 5',
      productId: MaxUint256,
      ipfsMetadata: 'product 5 metadata',
      product: {
        productType: 0, // Protocol Cover
        minPrice: 0,
        __gap: 0,
        coverAssets: 0, // Use fallback
        initialPriceRatio: 200,
        capacityReductionRatio: 0,
        useFixedPrice: false,
      },
      allowedPools: [],
    },
  ];

  await coverProducts.setProducts(productList);

  const config = {
    TRANCHE_DURATION: await fixture.contracts.stakingPool1.TRANCHE_DURATION(),
    MAX_RENEWABLE_PERIOD_BEFORE_EXPIRATION:
      await fixture.contracts.limitOrders.MAX_RENEWABLE_PERIOD_BEFORE_EXPIRATION(),
    BUCKET_SIZE: BigInt(7 * 24 * 3600), // 7 days
    BUCKET_DURATION: BigInt(28 * 24 * 3600), // 28 days
    GLOBAL_REWARDS_RATIO: 5000n, // 50%
    COMMISSION_DENOMINATOR: 10000n,
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
