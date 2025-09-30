const { ethers, nexus } = require('hardhat');
const { impersonateAccount, loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const { init } = require('../init');

const { parseEther, parseUnits, ZeroAddress, MaxUint256 } = ethers;
const { ContractIndexes, ClaimMethod, AggregatorType, Assets, PoolAsset } = nexus.constants;
const { numberToBytes32 } = nexus.helpers;
const { calculateFirstTrancheId } = nexus.protocol;

const assignRoles = accounts => ({
  defaultSender: accounts[0],
  nonMembers: accounts.slice(1, 5),
  members: accounts.slice(5, 10),
  advisoryBoardMembers: accounts.slice(10, 15),
  stakingPoolManagers: accounts.slice(15, 25),
  emergencyAdmins: accounts.slice(25, 30),
  generalPurpose: accounts.slice(30, 35),
});

async function setup() {
  await loadFixture(init);
  const accounts = assignRoles(await ethers.getSigners());
  const { defaultSender, members, advisoryBoardMembers, stakingPoolManagers, emergencyAdmins } = accounts;
  const [abMember] = advisoryBoardMembers;

  const INITIAL_SUPPLY = parseEther('6750000');
  const INITIAL_SPOT_PRICE_B = parseEther('0.0152');
  const INVESTMENT_LIMIT = parseUnits('25000000', 6);

  // deploy token
  const token = await ethers.deployContract('NXMToken', [defaultSender, INITIAL_SUPPLY]);

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
  await enzymeVault.setMetadata('MockTreasuryYield', 'NXMTY', 18);

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
  await debtUsdc.setBalance(investmentSafe, parseUnits('1000000', debtUsdcDecimals));

  const cbBTCDecimals = 8;
  const cbBTC = await ethers.deployContract('ERC20Mock');
  await cbBTC.setMetadata('MockCbtc', 'cbBTC', cbBTCDecimals);

  // deploy oracles

  // eth usd oracle
  const chainlinkEthUsd = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkEthUsd.setLatestAnswer(parseEther('2500'));
  await chainlinkEthUsd.setDecimals(8);

  // eth derivatives
  const chainlinkSteth = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkSteth.setLatestAnswer(parseEther('1'));

  const chainlinkReth = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkReth.setLatestAnswer(parseEther('1'));

  const chainlinkAweth = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkAweth.setLatestAnswer(parseEther('1'));

  // btc derivatives
  const chainlinkCbBTC = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkCbBTC.setLatestAnswer(parseEther('105000', 8)); // $105k per btc
  await chainlinkCbBTC.setDecimals(8); // USD based aggregator

  // stablecoins
  const chainlinkDAI = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkDAI.setLatestAnswer(parseEther((1 / 4000).toString())); // 1 DAI = 1/4000 ETH

  const chainlinkUSDC = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkUSDC.setLatestAnswer(parseEther((1 / 4000).toString())); // 1 USDC = 1/4000 ETH

  // enzyme vault
  const chainlinkEnzymeVault = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkEnzymeVault.setLatestAnswer(parseEther('1'));

  // deploy master
  const masterProxy = await ethers.deployContract('UpgradeableProxy');
  const masterDisposable = await ethers.deployContract('DisposableNXMaster');
  await masterProxy.upgradeTo(masterDisposable);
  let master = await ethers.getContractAt('DisposableNXMaster', masterProxy);

  // deploy registry
  const registryProxy = await ethers.deployContract('UpgradeableProxy');
  const registryDisposable = await ethers.deployContract('DisposableRegistry', [registryProxy, masterProxy]);
  await registryProxy.upgradeTo(registryDisposable);
  let registry = await ethers.getContractAt('DisposableRegistry', registryProxy);

  const memberRoles = await ethers.deployContract('LegacyMemberRoles', [registry, token]);
  await master.initialize(registry, memberRoles);

  // initialize registry

  // todo: enroll cover broker as well
  await registry.addMembers([...members, ...advisoryBoardMembers, ...stakingPoolManagers]);
  await registry.addAdvisoryBoardMembers(advisoryBoardMembers);
  await registry.addEmergencyAdmins(emergencyAdmins);

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
    ContractIndexes.C_ASSESSMENTS,
    ContractIndexes.C_CLAIMS,
  ];

  for (let i = 0; i < proxyStubIndexes.length; i++) {
    await registry.deployContract(proxyStubIndexes[i], numberToBytes32(i), ZeroAddress);
  }

  const coverAddress = await registry.getContractAddressByIndex(ContractIndexes.C_COVER);
  const stakingProductsAddress = await registry.getContractAddressByIndex(ContractIndexes.C_STAKING_PRODUCTS);

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [stakingProductsAddress]);

  const coverNFTDescriptor = await ethers.deployContract('CoverNFTDescriptor', [master.target]);
  const coverNFT = await ethers.deployContract('CoverNFT', [
    'Nexus Mutual Cover',
    'NMC',
    coverAddress, // operator
    coverNFTDescriptor,
  ]);

  const stakingNFTDescriptor = await ethers.deployContract('StakingNFTDescriptor');
  const stakingNFT = await ethers.deployContract('StakingNFT', [
    'Nexus Mutual Deposit',
    'NMD',
    stakingPoolFactory,
    coverAddress, // operator
    stakingNFTDescriptor,
  ]);

  await registry.addContract(ContractIndexes.C_TOKEN, token, false);
  await registry.addContract(ContractIndexes.C_COVER_NFT, coverNFT, false);
  await registry.addContract(ContractIndexes.C_STAKING_NFT, stakingNFT, false);
  await registry.addContract(ContractIndexes.C_STAKING_POOL_FACTORY, stakingPoolFactory, false);

  // deploy proxy implementations

  const governorImplementation = await ethers.deployContract('Governor', [registry]);
  const tokenControllerImplementation = await ethers.deployContract('TokenController', [registry]);
  const poolImplementation = await ethers.deployContract('Pool', [registry]);

  const stakingPoolImplementation = await ethers.deployContract('StakingPool', [
    stakingNFT,
    token,
    coverAddress,
    await registry.getContractAddressByIndex(ContractIndexes.C_TOKEN_CONTROLLER),
    master,
    await registry.getContractAddressByIndex(ContractIndexes.C_STAKING_PRODUCTS),
  ]);

  const coverImplementation = await ethers.deployContract('Cover', [
    registry,
    stakingPoolImplementation,
    await registry.getContractAddressByIndex(ContractIndexes.C_COVER), // verifying contract
  ]);

  const coverProductsImplementation = await ethers.deployContract('CoverProducts', []);

  const stakingProductsImplementation = await ethers.deployContract(
    'StakingProducts', // linterpls
    [coverAddress, stakingPoolFactory],
  );

  const rammDisposable = await ethers.deployContract('DisposableRamm', [registry, INITIAL_SPOT_PRICE_B]);
  const rammImplementation = await ethers.deployContract('Ramm', [registry, INITIAL_SPOT_PRICE_B]);

  const safeTrackerImplementation = await ethers.deployContract('SafeTracker', [
    registry,
    INVESTMENT_LIMIT,
    investmentSafe,
    usdc,
    weth,
    aWETH,
    debtUsdc,
  ]);

  const limitOrdersImplementation = await ethers.deployContract('LimitOrders', [token, weth, defaultSender]);

  const swapOperatorImplementation = await ethers.deployContract('SwapOperator', [
    registry,
    ZeroAddress, // _cowSettlement - no swaps in integration testing
    ZeroAddress, // _enzymeV4VaultProxyAddress - no enzyme in integration testing
    weth,
  ]);

  const assessmentsImplementation = await ethers.deployContract('Assessments', [registry]);

  const claimsImplementation = await ethers.deployContract('Claims', [registry]);

  // upgrade proxies

  await registry.upgradeContract(ContractIndexes.C_TOKEN_CONTROLLER, tokenControllerImplementation);
  await registry.upgradeContract(ContractIndexes.C_POOL, poolImplementation);
  await registry.upgradeContract(ContractIndexes.C_COVER, coverImplementation);
  await registry.upgradeContract(ContractIndexes.C_COVER_PRODUCTS, coverProductsImplementation);
  await registry.upgradeContract(ContractIndexes.C_STAKING_PRODUCTS, stakingProductsImplementation);
  await registry.upgradeContract(ContractIndexes.C_RAMM, rammDisposable);
  await registry.upgradeContract(ContractIndexes.C_SAFE_TRACKER, safeTrackerImplementation);
  await registry.upgradeContract(ContractIndexes.C_LIMIT_ORDERS, limitOrdersImplementation);
  await registry.upgradeContract(ContractIndexes.C_SWAP_OPERATOR, swapOperatorImplementation);
  await registry.upgradeContract(ContractIndexes.C_ASSESSMENTS, assessmentsImplementation);
  await registry.upgradeContract(ContractIndexes.C_CLAIMS, claimsImplementation);

  // get contract instances

  const fetch = async index => await registry.getContractAddressByIndex(index);
  const getContract = async (index, name) => ethers.getContractAt(name, await fetch(index));

  const governor = await getContract(ContractIndexes.C_GOVERNOR, 'Governor');
  const tokenController = await getContract(ContractIndexes.C_TOKEN_CONTROLLER, 'TokenController');
  const pool = await getContract(ContractIndexes.C_POOL, 'Pool');
  const cover = await getContract(ContractIndexes.C_COVER, 'Cover');
  const coverProducts = await getContract(ContractIndexes.C_COVER_PRODUCTS, 'CoverProducts');
  const stakingProducts = await getContract(ContractIndexes.C_STAKING_PRODUCTS, 'StakingProducts');
  const rammProxy = await getContract(ContractIndexes.C_RAMM, 'DisposableRamm');
  const safeTracker = await getContract(ContractIndexes.C_SAFE_TRACKER, 'SafeTracker');
  const limitOrders = await getContract(ContractIndexes.C_LIMIT_ORDERS, 'LimitOrders');
  const swapOperator = await getContract(ContractIndexes.C_SWAP_OPERATOR, 'SwapOperator');
  const assessments = await getContract(ContractIndexes.C_ASSESSMENTS, 'Assessments');
  const claims = await getContract(ContractIndexes.C_CLAIMS, 'Claims');

  const block = await ethers.provider.getBlock('latest');
  // current state of the contract
  await rammProxy.initialize(
    {
      nxmA: 198663167835623868889080n,
      nxmB: 209675175297957322394175n,
      eth: 4704907065875751479427n,
      budget: 0n,
      ratchetSpeedB: 400n,
      timestamp: block.timestamp,
    },
    1345717350623347035287899n, //  initialPriceA
    1247806022159962531468322n, //  initialPriceB
  );

  await registry.upgradeContract(ContractIndexes.C_RAMM, rammImplementation);
  const ramm = await getContract(ContractIndexes.C_RAMM, 'Ramm');

  const assets = [
    { asset: Assets.ETH, isCoverAsset: true, oracle: chainlinkEthUsd, type: AggregatorType.USD }, // 0 - ETH
    { asset: dai, isCoverAsset: true, oracle: chainlinkDAI, type: AggregatorType.ETH }, // 1 - DAI
    { asset: stETH, isCoverAsset: true, oracle: chainlinkSteth, type: AggregatorType.ETH }, // 2 - stETH
    { asset: enzymeVault, isCoverAsset: true, oracle: chainlinkEnzymeVault, type: AggregatorType.ETH }, // 3 - NXMTY
    { asset: rETH, isCoverAsset: true, oracle: chainlinkReth, type: AggregatorType.ETH }, // 4 - rETH
    { asset: safeTracker, isCoverAsset: true, oracle: safeTracker, type: AggregatorType.ETH }, // 5 - safeTracker
    { asset: usdc, isCoverAsset: true, oracle: chainlinkUSDC, type: AggregatorType.ETH }, // 6 - USDC
    { asset: cbBTC, isCoverAsset: true, oracle: chainlinkCbBTC, type: AggregatorType.USD }, // 7 - cbBTC
  ];

  for (const assetDetails of assets) {
    await pool.addAsset(
      assetDetails.asset,
      assetDetails.isCoverAsset,
      await assetDetails.oracle.getAddress(),
      assetDetails.type,
    );
  }

  const masterAwareContracts = [ContractIndexes.C_COVER_PRODUCTS, ContractIndexes.C_STAKING_PRODUCTS];

  for (const contract of masterAwareContracts) {
    const contractAddress = await registry.getContractAddressByIndex(contract);
    const masterAwareContract = await ethers.getContractAt('IMasterAwareV2', contractAddress);
    await masterAwareContract.changeMasterAddress(masterProxy);
    await masterAwareContract.changeDependentContractAddress();
  }

  const coverBroker = await ethers.deployContract('CoverBroker', [registry, defaultSender.address]);
  await registry.addMembers([coverBroker]);

  // work done, switch to the real Governor, registry and Master contracts
  await registry.replaceGovernor(numberToBytes32(1337), governorImplementation);
  const registryImplementation = await ethers.deployContract('Registry', [registry.target, master]);
  await registryProxy.upgradeTo(registryImplementation);
  registry = await ethers.getContractAt('Registry', registryProxy);

  const masterImplementation = await ethers.deployContract('NXMaster');
  await masterProxy.upgradeTo(masterImplementation);
  master = await ethers.getContractAt('NXMaster', masterProxy);

  await token.changeOperator(tokenController);

  await coverProducts.connect(abMember).setProductTypes([
    {
      // Protocol Cover
      productTypeName: 'Protocol',
      productTypeId: MaxUint256,
      ipfsMetadata: 'protocolCoverIPFSHash',
      productType: {
        claimMethod: ClaimMethod.IndividualClaims,
        gracePeriod: 30 * 24 * 3600, // 30 days
        assessmentCooldownPeriod: 24 * 3600, // 1 day
        payoutRedemptionPeriod: 30 * 24 * 3600, // 30 days
      },
    },
    {
      // Custody Cover
      productTypeName: 'Custody',
      productTypeId: MaxUint256,
      ipfsMetadata: 'custodyCoverIPFSHash',
      productType: {
        descriptionIpfsHash: 'custodyCoverIPFSHash',
        claimMethod: ClaimMethod.IndividualClaims,
        gracePeriod: 90 * 24 * 3600, // 90 days
        assessmentCooldownPeriod: 24 * 3600, // 1 day
        payoutRedemptionPeriod: 30 * 24 * 3600, // 30 days
      },
    },
  ]);

  // deploy viewer contracts
  const stakingViewer = await ethers.deployContract('StakingViewer', [registry]);

  // mint pool funds
  await setBalance(pool.target, parseEther('12500'));
  await dai.mint(pool, parseEther('2000000'));
  await usdc.mint(pool, parseUnits('2000000', usdcDecimals));
  await stETH.mint(pool, parseEther('34000'));
  await rETH.mint(pool, parseEther('12000'));
  await enzymeVault.mint(pool, parseEther('15000'));

  // mint safeTracker funds

  await setBalance(await safeTracker.getAddress(), parseEther('100')); // 100 eth

  await weth.deposit({ value: parseEther('100') }); // create 100 weth
  await weth.transfer(safeTracker, parseEther('100'));

  await aWETH.mint(safeTracker, parseEther('100')); // 100 eth collateral ~= 250k usd
  await debtUsdc.mint(safeTracker, parseUnits('50000', debtUsdcDecimals)); // 50k usdc debt
  await usdc.mint(safeTracker, parseUnits('100000', usdcDecimals)); // 100k USDC
  await cbBTC.mint(safeTracker, parseUnits('100000', cbBTCDecimals)); // 100k cbBTC

  await impersonateAccount(tokenController.target);
  const tokenControllerSigner = await ethers.getSigner(tokenController.target);
  await setBalance(tokenController.target, parseEther('10000'));

  for (const account of [...accounts.members, ...accounts.advisoryBoardMembers, ...accounts.stakingPoolManagers]) {
    await token.connect(tokenControllerSigner).addToWhiteList(account);
  }

  await setBalance(tokenController.target, parseEther('0'));

  const external = {
    dai,
    usdc,
    stETH,
    rETH,
    enzymeVault,
    cbBTC,
    weth,
    aWETH,
    debtUsdc,
    chainlinkEthUsd,
    chainlinkDAI,
    chainlinkUSDC,
    chainlinkSteth,
    chainlinkReth,
    chainlinkEnzymeVault,
    chainlinkCbBTC,
    chainlinkAweth,
  };

  const nonUpgradable = {
    token,
    stakingPoolFactory,
    coverNFT,
    stakingNFT,
    // not internally tracked but added for consistency:
    coverNFTDescriptor,
    stakingNFTDescriptor,
  };

  const proxies = {
    registry,
    master, // legacy
    memberRoles, // legacy
    tokenController,
    governor,
    pool,
    ramm,
    safeTracker,
    claims,
    assessments,
    cover,
    coverProducts,
    stakingProducts,
    limitOrders,
    swapOperator,
  };

  const nonInternal = {
    coverBroker,
    stakingViewer,
  };

  const fixture = {};

  fixture.contracts = {
    ...external,
    ...nonUpgradable,
    ...proxies,
    ...nonInternal,
  };

  for (let i = 0; i < 5; i++) {
    await stakingProducts.connect(stakingPoolManagers[i]).createStakingPool(
      false, // isPrivatePool
      '5', // initialPoolFee
      '5', // maxPoolFee,
      [], // products
      'ipfs-hash',
    );

    const poolId = i + 1;
    const stakingPoolAddress = await stakingProducts.stakingPool(poolId);
    const stakingPoolInstance = await ethers.getContractAt('StakingPool', stakingPoolAddress);
    fixture.contracts[`stakingPool${poolId}`] = stakingPoolInstance;
  }

  const products = [
    {
      productName: 'Product 0',
      productId: MaxUint256,
      ipfsMetadata: 'product 0 metadata',
      product: {
        productType: 1, // Custody Cover
        minPrice: 0,
        __gap: 0,
        coverAssets: 0, // Use fallback (all supported assets)
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
        isDeprecated: false,
        useFixedPrice: false,
      },
      allowedPools: [],
    },
    {
      productName: 'Product 1',
      productId: MaxUint256,
      ipfsMetadata: 'product 1 metadata',
      product: {
        productType: 0, // Protocol Cover
        minPrice: 0,
        __gap: 0,
        coverAssets: 0, // Use fallback (all supported assets)
        initialPriceRatio: 500,
        capacityReductionRatio: 0,
        isDeprecated: false,
        useFixedPrice: true,
      },
      allowedPools: [1, 3],
    },
    {
      productName: 'Product 2',
      productId: MaxUint256,
      ipfsMetadata: 'product 2 metadata',
      product: {
        productType: 0, // Protocol Cover
        minPrice: 0,
        __gap: 0,
        coverAssets: (1 << PoolAsset.ETH) | (1 << PoolAsset.USDC) | (1 << PoolAsset.cbBTC),
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
        isDeprecated: false,
        useFixedPrice: false,
      },
      allowedPools: [],
    },
    {
      productName: 'Product 3',
      productId: MaxUint256,
      ipfsMetadata: 'product 3 metadata',
      product: {
        productType: 0, // Protocol Cover
        minPrice: 0,
        __gap: 0,
        coverAssets: 0, // Use fallback (all supported assets)
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
        isDeprecated: true,
        useFixedPrice: true,
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
        coverAssets: 0, // Use fallback (all supported assets)
        initialPriceRatio: 200,
        capacityReductionRatio: 0,
        isDeprecated: false,
        useFixedPrice: false,
      },
      allowedPools: [],
    },
  ];

  await coverProducts.connect(abMember).setProducts(products);

  const stakingPoolProduct0 = {
    productId: 0,
    recalculateEffectiveWeight: true,
    setTargetWeight: true,
    targetWeight: 100,
    setTargetPrice: true,
    targetPrice: 100,
  };

  const stakingPoolProduct2 = {
    productId: 2,
    recalculateEffectiveWeight: true,
    setTargetWeight: true,
    targetWeight: 100,
    setTargetPrice: true,
    targetPrice: 100,
  };

  for (let i = 0; i < 5; i++) {
    const poolId = i + 1;
    await stakingProducts
      .connect(stakingPoolManagers[i])
      .setProducts(poolId, [stakingPoolProduct0, stakingPoolProduct2]);
  }

  const staker = defaultSender;
  const stakeAmount = parseEther('900000');
  const latestBlock = await ethers.provider.getBlock('latest');
  const firstActiveTrancheId = calculateFirstTrancheId(latestBlock, 30 * 24 * 3600, 0); // 30 days period, 0 gracePeriod
  const trancheId = firstActiveTrancheId + 5;

  // Add stake capacity to pools 1, 2, and 3 for product 0
  await token.connect(staker).approve(tokenController, MaxUint256);
  await fixture.contracts.stakingPool1.connect(staker).depositTo(stakeAmount, trancheId, 0, staker.address);
  await fixture.contracts.stakingPool2.connect(staker).depositTo(stakeAmount, trancheId, 0, staker.address);
  await fixture.contracts.stakingPool3.connect(staker).depositTo(stakeAmount, trancheId, 0, staker.address);

  const config = {
    MAX_RENEWABLE_PERIOD_BEFORE_EXPIRATION:
      await fixture.contracts.limitOrders.MAX_RENEWABLE_PERIOD_BEFORE_EXPIRATION(),
    TARGET_PRICE_DENOMINATOR: await stakingProducts.TARGET_PRICE_DENOMINATOR(),
    TARGET_PRICE: stakingPoolProduct0.targetPrice,
    ONE_NXM: parseEther('1'),
    NXM_PER_ALLOCATION_UNIT: await fixture.contracts.stakingPool1.NXM_PER_ALLOCATION_UNIT(),
    USDC_DECIMALS: usdcDecimals,
    STAKE_AMOUNT: stakeAmount,
    // Cover constants
    BUCKET_SIZE: BigInt(7 * 24 * 3600), // 7 days
    GLOBAL_REWARDS_RATIO: 5000n, // 50%
    COMMISSION_DENOMINATOR: 10000n,
    // StakingPool constants
    BUCKET_DURATION: await fixture.contracts.stakingPool1.BUCKET_DURATION(),
    TRANCHE_DURATION: await fixture.contracts.stakingPool1.TRANCHE_DURATION(),
    GLOBAL_CAPACITY_DENOMINATOR: await fixture.contracts.stakingPool1.GLOBAL_CAPACITY_DENOMINATOR(),
    CAPACITY_REDUCTION_DENOMINATOR: await fixture.contracts.stakingPool1.CAPACITY_REDUCTION_DENOMINATOR(),
    WEIGHT_DENOMINATOR: await fixture.contracts.stakingPool1.WEIGHT_DENOMINATOR(),
  };

  fixture.config = config;
  fixture.accounts = accounts;
  fixture.products = products;

  return fixture;
}

module.exports = setup;
