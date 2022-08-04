const { ethers, network, run, tenderly } = require('hardhat');
const path = require('path');
const fs = require('fs');

const { ABI_DIR, CONFIG_FILE } = process.env;

if (!ABI_DIR || !CONFIG_FILE) {
  console.log('ABI_DIR and CONFIG_FILE env vars are required');
  process.exit(1);
}

if (network.name === 'tenderly' && typeof tenderly === 'undefined') {
  console.error('Please enable tenderly plugin using ENABLE_TENDERLY=1 env var');
  process.exit(1);
}

const verifier = require('./verifier')();
const proposalCategories = require('../../lib/proposal-categories');
const { hex } = require('../../lib/helpers');
const { parseEther } = ethers.utils;

const products = require('../v2-migration/output/migratableProducts.json');
const claimMethod = { claim: 0, incident: 1 };

const productTypes = [
  {
    descriptionIpfsHash: 'protocolCoverIPFSHash',
    claimMethod: claimMethod.claim,
    gracePeriodInDays: 30,
  },
  {
    descriptionIpfsHash: 'custodyCoverIPFSHash',
    claimMethod: claimMethod.claim,
    gracePeriodInDays: 90,
  },
  {
    descriptionIpfsHash: 'yieldTokenCoverIPFSHash',
    claimMethod: claimMethod.incident,
    gracePeriodInDays: 14,
  },
];

// source: https://docs.chain.link/docs/price-feeds-migration-august-2020
const CHAINLINK_DAI_ETH = {
  mainnet: '0x773616E4d11A78F511299002da57A0a94577F1f4',
  rinkeby: '0x2bA49Aaa16E6afD2a993473cfB70Fa8559B523cF',
};

const CHAINLINK_STETH_ETH = {
  mainnet: '0x716BB759A5f6faCdfF91F0AfB613133d510e1573',
  rinkeby: '0x525cD3ca0601Ab455af06A4c179C26Ad7da34bA9', // mock, returns price = 1 eth
};

const CHAINLINK_ETH_USD = {
  mainnet: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  rinkeby: '0x0000000000000000000000000000000000000000', // missing
};

async function main () {

  const [{ address: owner }] = await ethers.getSigners();

  console.log(`Using network: ${network.name}`);
  console.log(`Using deployer address: ${owner}`);

  // make sure the contracts are compiled and we're not deploying an outdated artifact
  await run('compile');

  const OwnedUpgradeabilityProxy = await ethers.getContractFactory('OwnedUpgradeabilityProxy');

  const deployImmutable = async (contract, constructorArgs = [], options = {}) => {
    const { alias, abiName, overrides = {}, libraries } = options;
    const Contract = await ethers.getContractFactory(contract, { libraries });
    const instance = await Contract.deploy(...constructorArgs, overrides);
    await instance.deployed();
    verifier.add(instance.address, contract, { constructorArgs, libraries, alias, abiName });
    return instance;
  };

  const deployProxy = async (contract, constructorArgs = [], options = {}) => {
    const { alias, abiName, overrides = {}, libraries } = options;
    const impl = await deployImmutable(contract, constructorArgs, { overrides, libraries });
    const proxy = await OwnedUpgradeabilityProxy.deploy(impl.address);
    await proxy.deployed();
    const opts = { constructorArgs: [impl.address], alias, abiName, isProxy: true, libraries };
    verifier.add(proxy.address, contract, opts);
    return await ethers.getContractAt(contract, proxy.address);
  };

  const upgradeProxy = async (proxyAddress, contract, constructorArgs = [], options = {}) => {
    const { alias, abiName, overrides = {}, libraries } = options;
    const impl = await deployImmutable(contract, constructorArgs, { overrides, libraries });
    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', proxyAddress);
    await proxy.upgradeTo(impl.address);
    const opts = { constructorArgs: [impl.address], alias, abiName, isProxy: true, libraries };
    verifier.add(proxy.address, contract, opts);
    const instance = await ethers.getContractAt(contract, proxyAddress);
    try {
      await instance.changeDependentContractAddress();
    } catch (e) {
      console.log(`[WARNING]: changeDependentContractAddress failed on ${contract}`);
      console.error(e);
    }
    return instance;
  };

  const transferProxyOwnership = async (proxyAddress, newOwner) => {
    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', proxyAddress);
    await proxy.transferProxyOwnership(newOwner);
  };

  console.log('Deploying DAI');
  const dai = await deployImmutable(
    'contracts/mocks/Tokens/ERC20MintableDetailed.sol:ERC20MintableDetailed',
    ['DAI Mock', 'DAI', 18],
    { alias: 'DAI', abiName: 'ERC20' },
  );

  console.log('Deploying stETH');
  const stETH = await deployImmutable(
    'contracts/mocks/Tokens/ERC20MintableDetailed.sol:ERC20MintableDetailed',
    ['stETH Mock', 'stETH', 18],
    { alias: 'stETH', abiName: 'ERC20' },
  );

  console.log('Deploying token contract');
  const tk = await deployImmutable('NXMToken', [owner, parseEther('1500000')]);

  console.log('Deploying legacy quotation data contract');
  const qd = await deployImmutable('LegacyQuotationData', [owner, owner]);

  console.log('Deploying disposable master and member roles');
  const master = await deployProxy('DisposableNXMaster');
  const mr = await deployProxy('DisposableMemberRoles');

  console.log('Deploying legacy claims data and claim proofs contract');
  await deployImmutable('LegacyClaimProofs');
  const cd = await deployImmutable('LegacyClaimsData');
  await cd.changeMasterAddress(master.address);

  console.log('Deploying legacy claims reward');
  const cr = await deployImmutable('LegacyClaimsReward', [master.address, dai.address]);

  console.log('Deploying disposable contracts');
  const ps = await deployProxy('DisposablePooledStaking');
  const pc = await deployProxy('DisposableProposalCategory');
  const gv = await deployProxy('DisposableGovernance', [], { overrides: { gasLimit: 12e6 } });
  const gw = await deployProxy('DisposableGateway');
  const tc = await deployProxy('DisposableTokenController', [qd, cr].map(c => c.address));

  console.log('Deploying ProductsV1 contract');
  const productsV1 = await deployImmutable('ProductsV1');

  console.log('Deploying cover and staking pool contracts');
  const cover = await deployProxy('DisposableCover');
  const stakingPoolParameters = [tk.address, cover.address, tc.address, mr.address];
  const stakingPool = await deployImmutable('CoverMockStakingPool', stakingPoolParameters);
  const coverMigrator = await deployImmutable('CoverMigrator');
  const coverNFT = await deployImmutable('CoverNFT', ['Nexus Mutual Cover', 'NMC', cover.address]);

  console.log('Add covered products');

  await cover.addProductTypes(
    productTypes,
    productTypes.map(() => ''), // ipfs metadata for each product type
  );

  const addProductsParams = products.map(product => {
    const underlyingToken = ['ETH', 'DAI'].indexOf(product.underlyingToken);
    const productType = { protocol: 0, custodian: 1, token: 2 }[product.type];
    const productAddress = product.coveredToken || '0x0000000000000000000000000000000000000000';

    let coverAssets = underlyingToken === -1
      ? 0 // when no underlyingToken is present use the global fallback
      : 1 << underlyingToken; // 0b01 for ETH and 0b10 for DAI

    if (product.legacyProductId === '0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B') {
      coverAssets = 1; // only ETH for MakerDAO
    }

    return {
      productType,
      productAddress,
      coverAssets,
      initialPriceRatio: 100,
      capacityReductionRatio: 0,
    };
  });

  // [todo] Add ipfs hashes
  const ipfsProductHashes = Array(products.length).fill('');
  await cover.addProducts(addProductsParams, ipfsProductHashes);

  console.log('Deploying assessment contracts');
  const yt = await deployProxy('YieldTokenIncidents', [tk.address, coverNFT.address]);
  const ic = await deployProxy('IndividualClaims', [tk.address, coverNFT.address]);
  const assessment = await deployProxy('Assessment', [tk.address]);

  console.log('Deploying CowSwapOperator');
  const cowVaultRelayer = await deployImmutable('CSMockVaultRelayer');
  const cowSettlement = await deployImmutable('CSMockSettlement', [cowVaultRelayer.address]);
  const cowSwapOperator = await deployImmutable(
    'CowSwapOperator',
    [cowSettlement.address, owner, master.address, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'],
  );

  if (typeof CHAINLINK_DAI_ETH[network.name] === 'undefined') {
    console.log('Deploying chainlink dai-eth aggregator');
    const chainlinkDaiMock = await deployImmutable(
      'ChainlinkAggregatorMock',
      [],
      { alias: 'Chainlink-DAI-ETH', abiName: 'EACAggregatorProxy' },
    );
    await chainlinkDaiMock.setLatestAnswer(parseEther('0.000357884806717390'));
    CHAINLINK_DAI_ETH[network.name] = chainlinkDaiMock.address;
  }

  if (typeof CHAINLINK_STETH_ETH[network.name] === 'undefined') {
    console.log('Deploying chainlink steth-eth aggregator');
    const chainlinkStEthMock = await deployImmutable(
      'ChainlinkAggregatorMock',
      [],
      { alias: 'Chainlink-STETH-ETH', abiName: 'EACAggregatorProxy' },
    );
    await chainlinkStEthMock.setLatestAnswer(parseEther('1.003')); // almost 1:1
    CHAINLINK_STETH_ETH[network.name] = chainlinkStEthMock.address;
  }

  // only used by frontend
  if (typeof CHAINLINK_ETH_USD[network.name] === 'undefined') {
    console.log('Deploying chainlink eth-usd aggregator');
    const chainlinkEthUsdMock = await deployImmutable(
      'ChainlinkAggregatorMock',
      [],
      { alias: 'Chainlink-ETH-USD', abiName: 'EACAggregatorProxy' },
    );
    await chainlinkEthUsdMock.setLatestAnswer(parseEther('1234.56'));
    CHAINLINK_ETH_USD[network.name] = chainlinkEthUsdMock.address;
  }

  console.log('Deploying PriceFeedOracle');
  const priceFeedOracle = await deployImmutable(
    'PriceFeedOracle',
    [
      [dai.address, stETH.address],
      [CHAINLINK_DAI_ETH[network.name], CHAINLINK_STETH_ETH[network.name]],
      [18, 18],
    ],
  );

  console.log('Deploying capital contracts');
  const disposableMCR = await deployImmutable(
    'DisposableMCR',
    [
      parseEther('50000'), // mcrEth
      parseEther('40000'), // mcrFloor
      parseEther('50000'), // desiredMCR
      (await ethers.provider.getBlock('latest')).timestamp - 60, // lastUpdateTime
      13000, // mcrFloorIncrementThreshold
      100, // maxMCRFloorIncrement
      500, // maxMCRIncrement
      48000, // gearingFactor
      3600, // minUpdateTime
    ],
  );

  // deploy MCR with DisposableMCR as a fake master
  const mcr = await deployImmutable('MCR', [disposableMCR.address]);

  // trigger initialize and update master address
  await disposableMCR.initializeNextMcr(mcr.address, master.address);

  const poolParameters = [master, priceFeedOracle, cowSwapOperator, dai, stETH].map(x => x.address);
  const pool = await deployImmutable('Pool', poolParameters);

  console.log('Minting DAI to pool');
  await dai.mint(pool.address, parseEther('6500000'));

  const replaceableContractCodes = ['MC', 'P1', 'SP', 'CL'];
  const replaceableContractAddresses = [mcr, pool, stakingPool, coverMigrator].map(x => x.address);

  const proxyContractCodes = ['GV', 'MR', 'PC', 'PS', 'TC', 'GW', 'CO', 'YT', 'IC', 'AS'];
  const proxyContractAddresses = [
    { address: owner }, // as governance
    mr,
    pc,
    ps,
    tc,
    gw,
    cover,
    yt,
    ic,
    assessment,
  ].map(x => x.address);

  const addresses = [...replaceableContractAddresses, ...proxyContractAddresses];
  const codes = [...replaceableContractCodes, ...proxyContractCodes].map(hex);
  const types = [
    ...replaceableContractCodes.map(() => '1'), // replaceable aka "upgradable"
    ...proxyContractCodes.map(() => '2'), // proxy
  ];

  console.log('Initialazing contracts');
  await master.initialize(owner, tk.address, owner, codes, types, addresses);
  await tc.initialize(master.address, tk.address, ps.address, assessment.address);

  await mr.initialize(
    owner,
    master.address,
    tc.address,
    [owner], // initial members
    [parseEther('10000')], // initial tokens
    [owner], // advisory board members
  );

  await gv.initialize(
    600, // 10 minutes
    600, // 10 minutes
    5,
    40,
    75,
    300, // 5 minutes
  );

  await ps.initialize(
    tc.address,
    parseEther('2'), // min stake
    parseEther('2'), // min unstake
    10, // max exposure
    600, // unstake lock time
  );

  await yt.initialize();
  await gw.initialize(master.address, dai.address);

  console.log('Adding proposal categories');

  await pc.initialize(mr.address);

  for (const category of proposalCategories) {
    await pc.addInitialCategory(...category);
  }

  console.log('Setting parameters');

  console.log('Setting QuotationData parameters');
  await qd.changeMasterAddress(master.address);
  await master.switchGovernanceAddress(gv.address);

  console.log('Upgrading to non-disposable contracts');
  await upgradeProxy(mr.address, 'MemberRoles');
  await upgradeProxy(tc.address, 'TokenController', [qd.address, cr.address]);
  await upgradeProxy(pc.address, 'ProposalCategory');
  await upgradeProxy(gv.address, 'Governance');
  await upgradeProxy(gw.address, 'LegacyGateway');
  await upgradeProxy(ps.address, 'LegacyPooledStaking', [cover.address, productsV1.address]);
  await upgradeProxy(master.address, 'NXMaster');

  console.log('Deploying and linking CoverUtilsLib');
  const coverUtilsLib = await deployImmutable('CoverUtilsLib');
  const coverLibraries = { CoverUtilsLib: coverUtilsLib.address };

  console.log('Deploying CoverViewer');
  await deployImmutable('CoverViewer', [master.address]);

  await upgradeProxy(
    cover.address,
    'Cover',
    [qd, productsV1, coverNFT, stakingPool, cover].map(c => c.address),
    { libraries: coverLibraries },
  );

  console.log('Transfering ownership of proxy contracts');
  await transferProxyOwnership(mr.address, master.address);
  await transferProxyOwnership(tc.address, master.address);
  await transferProxyOwnership(ps.address, master.address);
  await transferProxyOwnership(pc.address, master.address);
  await transferProxyOwnership(gv.address, master.address);
  await transferProxyOwnership(gw.address, master.address);
  await transferProxyOwnership(cover.address, master.address);
  await transferProxyOwnership(yt.address, master.address);
  await transferProxyOwnership(ic.address, master.address);
  await transferProxyOwnership(assessment.address, master.address);
  await transferProxyOwnership(master.address, gv.address);

  const verifyOnEtherscan = !['hardhat', 'localhost', 'tenderly'].includes(network.name);
  const verifyOnTenderly = network.name === 'tenderly';

  if (verifyOnEtherscan) {
    console.log('Performing etherscan contract verifications');
    await verifier.submit();
  }

  if (verifyOnTenderly) {
    console.log('Performing tenderly contract verifications');
    const contracts = Object.values(verifier.contracts());
    const contractList = contracts.map(
      ({ name, address, libraries }) => ({ name: name.split(':').pop(), address, libraries }),
    );
    await tenderly.verify(...contractList);
  }

  if (!verifyOnTenderly && !verifyOnEtherscan) {
    console.log('Contract verifications skipped');
  }

  const configFile = path.resolve(CONFIG_FILE);
  const abiDir = path.resolve(ABI_DIR);

  const config = require(configFile);
  config.CONTRACTS_ADDRESSES = {};

  fs.existsSync(abiDir) && fs.rmSync(abiDir, { recursive: true });
  fs.mkdirSync(abiDir, { recursive: true });

  console.log(`Dumping abis to ${abiDir}`);
  const unsortedContracts = await verifier.dump();
  const contracts = unsortedContracts.sort((a, b) => a.abiName.localeCompare(b.abiName));

  for (const contract of contracts) {

    const { abi, address, alias, abiName, isProxy } = contract;

    if (/^(CSMock|CoverMockStakingPool|Disposable)/.test(abiName)) {
      continue;
    }

    const abiPath = path.join(abiDir, `${abiName}.json`);
    fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2));

    if (!config.CONTRACTS_ADDRESSES[alias] || isProxy) {
      config.CONTRACTS_ADDRESSES[alias] = address;
    }
  }

  console.log(`Updating config file ${configFile}`);
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');

  console.log('Deploy finished!');
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('An unexpected error encountered:', error);
      process.exit(1);
    });
}

module.exports = main;
