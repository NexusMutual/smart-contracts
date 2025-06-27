const { ethers, nexus } = require('hardhat');
const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');

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
  const claims = await getContract(ContractIndexes.C_CLAIMS, 'IndividualClaims');

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
    // TODO: remove Assessment and Claims from here once we've merged the new assessment
    ContractIndexes.C_ASSESSMENT,
    ContractIndexes.C_CLAIMS,
  ];

  for (const contract of masterAwareContracts) {
    const contractAddress = await registry.getContractAddressByIndex(contract);
    const masterAwareContract = await ethers.getContractAt('IMasterAwareV2', contractAddress);
    await masterAwareContract.changeMasterAddress(master);
    await masterAwareContract.changeDependentContractAddress();
  }

  // work done, switch to the real Governor contract
  await registry.replaceGovernor(numberToBytes32(1337), governorImplementation);

  // whatever was here before

  await token.changeOperator(tokenController);

  const CLAIM_METHOD = {
    INDIVIDUAL_CLAIMS: 0,
    DEPRECATED_YTC: 1,
  };

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
