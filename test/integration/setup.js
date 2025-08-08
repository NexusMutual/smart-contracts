const { ethers, nexus } = require('hardhat');
const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const { parseEther, parseUnits, ZeroAddress, MaxUint256 } = ethers;
const { ContractIndexes, ClaimMethod, AggregatorType, Assets } = nexus.constants;
const { numberToBytes32 } = nexus.helpers;

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
  const accounts = assignRoles(await ethers.getSigners());
  const { defaultSender, members, advisoryBoardMembers, stakingPoolManagers, emergencyAdmins } = accounts;
  const [abMember] = advisoryBoardMembers;

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
  await chainlinkDAI.setLatestAnswer(parseEther('1'));

  const chainlinkUSDC = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkUSDC.setLatestAnswer(parseEther('1'));

  // enzyme vault
  const chainlinkEnzymeVault = await ethers.deployContract('ChainlinkAggregatorMock');
  await chainlinkEnzymeVault.setLatestAnswer(parseEther('1'));

  // deploy registry

  const master = await ethers.deployContract('DisposableNXMaster');
  const registryProxy = await ethers.deployContract('UpgradeableProxy');
  const registryImplementation = await ethers.deployContract('DisposableRegistry', [registryProxy, master]);
  await registryProxy.upgradeTo(registryImplementation);
  const registry = await ethers.getContractAt('DisposableRegistry', registryProxy);

  const memberRoles = await ethers.deployContract('LegacyMemberRoles', [registry]);
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
    ContractIndexes.C_ASSESSMENT,
    ContractIndexes.C_CLAIMS,
  ];

  for (let i = 0; i < proxyStubIndexes.length; i++) {
    await registry.deployContract(proxyStubIndexes[i], numberToBytes32(i), ZeroAddress);
  }

  const token = await ethers.deployContract('NXMToken', [defaultSender, INITIAL_SUPPLY]);

  const coverAddress = await registry.getContractAddressByIndex(ContractIndexes.C_COVER);
  const stakingProductsAddress = await registry.getContractAddressByIndex(ContractIndexes.C_STAKING_PRODUCTS);

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [stakingProductsAddress]);

  const coverNFTDescriptor = await ethers.deployContract('CoverNFTDescriptor', [coverAddress]);
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

  const coverProductsImplementation = await ethers.deployContract('CoverProducts', []);

  const stakingProductsImplementation = await ethers.deployContract(
    'StakingProducts', // linterpls
    [coverAddress, stakingPoolFactory],
  );

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

  const assessmentImplementation = await ethers.deployContract('Assessment', [registry]);

  const claimsImplementation = await ethers.deployContract('Claims', [registry]);

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

  // get contract instances

  const fetch = async index => await registry.getContractAddressByIndex(index);
  const getContract = async (index, name) => ethers.getContractAt(name, await fetch(index));

  const governor = await getContract(ContractIndexes.C_GOVERNOR, 'Governor');
  const tokenController = await getContract(ContractIndexes.C_TOKEN_CONTROLLER, 'TokenController');
  const pool = await getContract(ContractIndexes.C_POOL, 'Pool');
  const cover = await getContract(ContractIndexes.C_COVER, 'Cover');
  const coverProducts = await getContract(ContractIndexes.C_COVER_PRODUCTS, 'CoverProducts');
  const stakingProducts = await getContract(ContractIndexes.C_STAKING_PRODUCTS, 'StakingProducts');
  const ramm = await getContract(ContractIndexes.C_RAMM, 'Ramm');
  const safeTracker = await getContract(ContractIndexes.C_SAFE_TRACKER, 'SafeTracker');
  const limitOrders = await getContract(ContractIndexes.C_LIMIT_ORDERS, 'LimitOrders');
  const swapOperator = await getContract(ContractIndexes.C_SWAP_OPERATOR, 'SwapOperator');
  const assessment = await getContract(ContractIndexes.C_ASSESSMENT, 'Assessment');
  const claims = await getContract(ContractIndexes.C_CLAIMS, 'Claims');

  const assets = [
    { asset: Assets.ETH, isCoverAsset: true, oracle: chainlinkEthUsd, type: AggregatorType.USD },
    { asset: dai, isCoverAsset: true, oracle: chainlinkDAI, type: AggregatorType.ETH },
    { asset: stETH, isCoverAsset: true, oracle: chainlinkSteth, type: AggregatorType.ETH },
    { asset: rETH, isCoverAsset: true, oracle: chainlinkReth, type: AggregatorType.ETH },
    { asset: enzymeVault, isCoverAsset: true, oracle: chainlinkEnzymeVault, type: AggregatorType.ETH },
    { asset: usdc, isCoverAsset: true, oracle: chainlinkUSDC, type: AggregatorType.ETH },
    { asset: safeTracker, isCoverAsset: true, oracle: safeTracker, type: AggregatorType.ETH },
    { asset: cbBTC, isCoverAsset: true, oracle: chainlinkCbBTC, type: AggregatorType.USD },
    { asset: aWETH, isCoverAsset: true, oracle: chainlinkAweth, type: AggregatorType.ETH },
    { asset: debtUsdc, isCoverAsset: true, oracle: chainlinkUSDC, type: AggregatorType.ETH },
  ];

  for (const assetDetails of assets) {
    await pool.addAsset(
      assetDetails.asset,
      assetDetails.isCoverAsset,
      await assetDetails.oracle.getAddress(),
      assetDetails.type,
    );
  }

  await master.initialize(registry, memberRoles);

  const masterAwareContracts = [
    ContractIndexes.C_TOKEN_CONTROLLER,
    ContractIndexes.C_COVER,
    ContractIndexes.C_COVER_PRODUCTS,
    ContractIndexes.C_STAKING_PRODUCTS,
    ContractIndexes.C_LIMIT_ORDERS,
  ];

  for (const contract of masterAwareContracts) {
    const contractAddress = await registry.getContractAddressByIndex(contract);
    const masterAwareContract = await ethers.getContractAt('IMasterAwareV2', contractAddress);
    await masterAwareContract.changeMasterAddress(master);
    await masterAwareContract.changeDependentContractAddress();
  }

  // work done, switch to the real Governor contract
  await registry.replaceGovernor(numberToBytes32(1337), governorImplementation);

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
      },
    },
  ]);

  // FIXME: deploy CoverBroker
  // const coverBroker = await ethers.deployContract('CoverBroker', [
  //   cover.address,
  //   mr.address,
  //   token.address,
  //   master.address,
  //   owner.address,
  // ]);

  // deploy viewer contracts

  // const stakingViewer =
  //                    await ethers.deployContract('StakingViewer', [master.address, stakingNFT.address, spf.address]);
  // const assessmentViewer = await ethers.deployContract('AssessmentViewer', [master.address]);
  // const nexusViewer = await ethers.deployContract('NexusViewer', [
  // master.address,
  // stakingViewer.address,
  // assessmentViewer.address,
  // ]);

  // mint pool funds

  await setBalance(await pool.getAddress(), parseEther('9500'));
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
  await usdc.mint(safeTracker, parseUnits('10000', usdcDecimals)); // 10k usdc

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
    assessment,
    cover,
    coverProducts,
    stakingProducts,
    limitOrders,
    swapOperator,
  };

  const nonInternal = {
    // coverBroker,
    // stakingViewer,
    // assessmentViewer,
    // nexusViewer,
  };

  const fixture = {};

  fixture.contracts = {
    ...external,
    ...nonUpgradable,
    ...proxies,
    ...nonInternal,
  };

  // enroll coverBroker as member
  // await impersonateAccount(coverBroker.address);
  // await setEtherBalance(coverBroker.address, parseEther('1000'));
  // const coverBrokerSigner = await ethers.getSigner(coverBroker.address);
  // accounts.coverBrokerSigner = coverBrokerSigner;
  // await enrollMember(fixture.contracts, [coverBrokerSigner], owner, { initialTokens: parseEther('0') });

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
        coverAssets: 0, // Use fallback
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
        coverAssets: 0, // Use fallback
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
        coverAssets: 0b10000, // use usdc
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
        coverAssets: 0, // Use fallback
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
        coverAssets: 0, // Use fallback
        initialPriceRatio: 200,
        capacityReductionRatio: 0,
        isDeprecated: false,
        useFixedPrice: false,
      },
      allowedPools: [],
    },
  ];

  await coverProducts.connect(abMember).setProducts(products);
  console.log('products set');

  const stakingPoolProduct = {
    productId: 0,
    recalculateEffectiveWeight: true,
    setTargetWeight: true,
    targetWeight: 100,
    setTargetPrice: true,
    targetPrice: 100,
  };

  for (let i = 0; i < 5; i++) {
    const poolId = i + 1;
    await stakingProducts.connect(stakingPoolManagers[i]).setProducts(poolId, [stakingPoolProduct]);
  }

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
    NXM_PER_ALLOCATION_UNIT: await fixture.contracts.stakingPool1.NXM_PER_ALLOCATION_UNIT(),
    USDC_DECIMALS: usdcDecimals,
  };

  fixture.config = config;
  fixture.accounts = accounts;
  fixture.products = products;

  return fixture;
}

module.exports = setup;
