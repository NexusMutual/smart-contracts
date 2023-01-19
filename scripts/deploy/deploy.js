const { expect } = require('chai');
const fs = require('fs');
const { ethers, network, run, tenderly } = require('hardhat');
const path = require('path');

const { hex } = require('../../lib/helpers');
const proposalCategories = require('../../lib/proposal-categories');
const products = require('../v2-migration/output/migratableProducts.json');
const verifier = require('./verifier')();

const { AddressZero, MaxUint256 } = ethers.constants;
const { getContractAddress, parseEther } = ethers.utils;

const { ABI_DIR, CONFIG_FILE } = process.env;

if (!ABI_DIR || !CONFIG_FILE) {
  console.log('ABI_DIR and CONFIG_FILE env vars are required');
  process.exit(1);
}

if (network.name === 'tenderly' && typeof tenderly === 'undefined') {
  console.error('Please enable tenderly plugin using ENABLE_TENDERLY=1 env var');
  process.exit(1);
}

const PROXY_CONTRACT = 'contracts/modules/governance/external/OwnedUpgradeabilityProxy.sol:OwnedUpgradeabilityProxy';

const claimMethod = { claim: 0, incident: 1 };
const productTypes = [
  {
    productTypeId: MaxUint256,
    ipfsMetadata: 'protocolCoverIPFSHash',
    productType: {
      descriptionIpfsHash: 'protocolCoverIPFSHash',
      claimMethod: claimMethod.claim,
      gracePeriod: 30,
    },
  },
  {
    productTypeId: MaxUint256,
    ipfsMetadata: 'custodyCoverIPFSHash',
    productType: {
      descriptionIpfsHash: 'custodyCoverIPFSHash',
      claimMethod: claimMethod.claim,
      gracePeriod: 90,
    },
  },
  {
    productTypeId: MaxUint256,
    ipfsMetadata: 'yieldTokenCoverIPFSHash',
    productType: {
      descriptionIpfsHash: 'yieldTokenCoverIPFSHash',
      claimMethod: claimMethod.incident,
      gracePeriod: 14,
    },
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

async function main() {
  // Remove verbose logs
  // await network.provider.send('hardhat_setLoggingEnabled', [false]);

  const [ownerSigner] = await ethers.getSigners();
  const { address: owner } = ownerSigner;

  console.log(`Using network: ${network.name}`);
  console.log(`Using deployer address: ${owner}`);

  // make sure the contracts are compiled and we're not deploying an outdated artifact
  await run('compile');

  const OwnedUpgradeabilityProxy = await ethers.getContractFactory('OwnedUpgradeabilityProxy');

  const deployImmutable = async (contract, constructorArgs = [], options = {}) => {
    const { alias, abiFilename, overrides = {}, libraries } = options;
    const Contract = await ethers.getContractFactory(contract, { libraries });
    const instance = await Contract.deploy(...constructorArgs, overrides);
    await instance.deployed();
    verifier.add(instance.address, contract, { constructorArgs, libraries, alias, abiFilename });
    return instance;
  };

  const deployProxy = async (contract, constructorArgs = [], options = {}) => {
    const { alias, abiFilename, overrides = {}, libraries } = options;
    const impl = await deployImmutable(contract, constructorArgs, { overrides, libraries });
    const proxy = await OwnedUpgradeabilityProxy.deploy(impl.address);
    await proxy.deployed();
    const implFqName = contract;
    const opts = { constructorArgs: [impl.address], abiFilename, alias, isProxy: true, libraries, implFqName };
    verifier.add(proxy.address, PROXY_CONTRACT, opts);
    return await ethers.getContractAt(contract, proxy.address);
  };

  const upgradeProxy = async (proxyAddress, contract, constructorArgs = [], options = {}) => {
    const { alias, abiFilename, overrides = {}, libraries } = options;
    const impl = await deployImmutable(contract, constructorArgs, { overrides, libraries });
    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', proxyAddress);
    await proxy.upgradeTo(impl.address);
    const implFqName = contract;
    const opts = { constructorArgs: [impl.address], alias, abiFilename, isProxy: true, libraries, implFqName };
    verifier.add(proxy.address, PROXY_CONTRACT, opts);
    const instance = await ethers.getContractAt(contract, proxyAddress);
    instance.changeDependentContractAddress && (await instance.changeDependentContractAddress());
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
    { alias: 'DAI', abiFilename: 'ERC20' },
  );

  console.log('Deploying stETH');
  const stETH = await deployImmutable(
    'contracts/mocks/Tokens/ERC20MintableDetailed.sol:ERC20MintableDetailed',
    ['stETH Mock', 'stETH', 18],
    { alias: 'stETH', abiFilename: 'ERC20' },
  );

  console.log('Deploying disposable NXMaster');
  const master = await deployProxy('DisposableNXMaster');

  console.log('Deploying disposable MemberRoles');
  const mr = await deployProxy('DisposableMemberRoles');

  console.log('Deploying disposable PooledStaking');
  const ps = await deployProxy('DisposablePooledStaking');

  console.log('Deploying disposable PproposalCategory');
  const pc = await deployProxy('DisposableProposalCategory');

  console.log('Deploying disposable Governance');
  const gv = await deployProxy('DisposableGovernance', [], { overrides: { gasLimit: 12e6 } });

  console.log('Deploying disposable LegacyGateway');
  const gw = await deployProxy('DisposableGateway');

  console.log('Deploying LegacyClaimsReward');
  const cr = await deployImmutable('LegacyClaimsReward', [master.address, dai.address]);

  console.log('Deploying NXMToken');
  const tk = await deployImmutable('NXMToken', [owner, parseEther('1500000')]);

  console.log('Deploying testnet LegacyQuotationData');
  // Replaced LegacyQuotationData with TestnetQuotationData for ability to create old v1 covers locally
  const qd = await deployImmutable('TestnetQuotationData', [owner, owner]);

  console.log('Deploying ProductsV1');
  const productsV1 = await deployImmutable('ProductsV1');

  console.log('Deploying StakingPoolFactory');
  const expectedCoverAddress = getContractAddress({
    from: ownerSigner.address,
    nonce: (await ownerSigner.getTransactionCount()) + 7,
  });
  const spf = await deployImmutable('StakingPoolFactory', [expectedCoverAddress]);

  console.log('Deploying StakingNFT');
  const stakingNFT = await deployImmutable('StakingNFT', [
    'Nexus Mutual Deposit',
    'NMD',
    spf.address,
    expectedCoverAddress,
  ]);

  console.log('Deploying CoverNFT');
  const coverNFT = await deployImmutable('CoverNFT', ['Nexus Mutual Cover', 'NMC', expectedCoverAddress]);

  console.log('Deploying disposable TokenController');
  const tc = await deployProxy('DisposableTokenController', [qd.address, cr.address, spf.address]);

  console.log('Deploying StakingPool');
  const stakingPool = await deployImmutable('StakingPool', [
    stakingNFT.address,
    tk.address,
    expectedCoverAddress,
    tc.address,
    master.address,
  ]);

  console.log('Deploying disposable Cover');
  const cover = await deployProxy('DisposableCover', [
    coverNFT.address,
    stakingNFT.address,
    spf.address,
    stakingPool.address,
  ]);
  expect(cover.address).to.equal(expectedCoverAddress);

  console.log('Deploying CoverViewer');
  await deployImmutable('CoverViewer', [master.address]);

  console.log('Deploying StakingViewer');
  await deployImmutable('StakingViewer', [master.address, stakingNFT.address, spf.address]);

  console.log('Deploying assessment contracts');
  const yt = await deployProxy('YieldTokenIncidents', [tk.address, coverNFT.address]);
  const ic = await deployProxy('IndividualClaims', [tk.address, coverNFT.address]);
  const assessment = await deployProxy('DisposableAssessment', []);
  const coverMigrator = await deployProxy('CoverMigrator', [qd.address, productsV1.address]);

  console.log('Deploying legacy claims data and claim proofs contract');
  await deployImmutable('TestnetClaimProofs');
  await deployImmutable('TestnetClaimsData');

  console.log('Deploying SwapOperator');
  const cowVaultRelayer = await deployImmutable('SOMockVaultRelayer');
  const cowSettlement = await deployImmutable('SOMockSettlement', [cowVaultRelayer.address]);
  const swapOperator = await deployImmutable('SwapOperator', [
    cowSettlement.address,
    owner,
    master.address,
    AddressZero,
    AddressZero,
    AddressZero,
    '0',
  ]);

  if (typeof CHAINLINK_DAI_ETH[network.name] === 'undefined') {
    console.log('Deploying chainlink dai-eth aggregator');
    const chainlinkDaiMock = await deployImmutable('ChainlinkAggregatorMock', [], {
      alias: 'Chainlink-DAI-ETH',
      abiFilename: 'EACAggregatorProxy',
    });
    await chainlinkDaiMock.setLatestAnswer(parseEther('0.000357884806717390'));
    CHAINLINK_DAI_ETH[network.name] = chainlinkDaiMock.address;
  }

  if (typeof CHAINLINK_STETH_ETH[network.name] === 'undefined') {
    console.log('Deploying chainlink steth-eth aggregator');
    const chainlinkStEthMock = await deployImmutable('ChainlinkAggregatorMock', [], {
      alias: 'Chainlink-STETH-ETH',
      abiFilename: 'EACAggregatorProxy',
    });
    await chainlinkStEthMock.setLatestAnswer(parseEther('1.003')); // almost 1:1
    CHAINLINK_STETH_ETH[network.name] = chainlinkStEthMock.address;
  }

  // only used by frontend
  if (typeof CHAINLINK_ETH_USD[network.name] === 'undefined') {
    console.log('Deploying chainlink eth-usd aggregator');
    const chainlinkEthUsdMock = await deployImmutable('ChainlinkAggregatorMock', [], {
      alias: 'Chainlink-ETH-USD',
      abiFilename: 'EACAggregatorProxy',
    });
    await chainlinkEthUsdMock.setLatestAnswer(parseEther('1234.56'));
    CHAINLINK_ETH_USD[network.name] = chainlinkEthUsdMock.address;
  }

  console.log('Deploying PriceFeedOracle');
  const priceFeedOracle = await deployImmutable('PriceFeedOracle', [
    [dai.address, stETH.address],
    [CHAINLINK_DAI_ETH[network.name], CHAINLINK_STETH_ETH[network.name]],
    [18, 18],
  ]);

  console.log('Deploying disposable MCR');
  const disposableMCR = await deployImmutable('DisposableMCR', [
    parseEther('50000'), // mcrEth
    parseEther('40000'), // mcrFloor
    parseEther('50000'), // desiredMCR
    (await ethers.provider.getBlock('latest')).timestamp - 60, // lastUpdateTime
    13000, // mcrFloorIncrementThreshold
    100, // maxMCRFloorIncrement
    500, // maxMCRIncrement
    48000, // gearingFactor
    3600, // minUpdateTime
  ]);
  // deploy MCR with DisposableMCR as a fake master
  const mcr = await deployImmutable('MCR', [disposableMCR.address]);
  // trigger initialize and update master address
  await disposableMCR.initializeNextMcr(mcr.address, master.address);

  console.log('Deploying Pool');
  const poolParameters = [master, priceFeedOracle, swapOperator, dai, stETH].map(x => x.address);
  const pool = await deployImmutable('Pool', poolParameters);

  console.log('Minting DAI to Pool');
  await dai.mint(pool.address, parseEther('6500000'));

  console.log('Initializing contracts');
  const replaceableContractCodes = ['MC', 'P1', 'CL'];
  const replaceableContractAddresses = [mcr, pool, coverMigrator].map(x => x.address);

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

  console.log('Initializing NXMaster');
  await master.initialize(
    ownerSigner.address,
    tk.address,
    ownerSigner.address,
    codes, // codes
    types, // types
    addresses, // addresses
  );

  console.log('Initializing TokenController');
  await tc.initialize(master.address, tk.address, ps.address, assessment.address);

  console.log('Initializing Assessment');
  await assessment.initialize(master.address, tc.address);

  console.log('Initializing MemberRoles');
  await mr.initialize(
    owner,
    master.address,
    tc.address,
    [owner], // initial members
    [parseEther('10000')], // initial tokens
    [owner], // advisory board members
  );

  console.log('Initializing Governance');
  await gv.initialize(
    600, // 10 minutes
    600, // 10 minutes
    5,
    40,
    75,
    300, // 5 minutes
  );

  console.log('Initializing PooledStaking');
  await ps.initialize(
    tc.address,
    parseEther('2'), // min stake
    parseEther('2'), // min unstake
    10, // max exposure
    600, // unstake lock time
  );

  console.log('Initializing YieldTokenIncidents');
  await yt.initialize();

  console.log('Initializing LegacyGateway');
  await gw.initialize(master.address, dai.address);

  console.log('Add covered products');
  await cover.changeMasterAddress(master.address);
  await cover.changeDependentContractAddress();
  await cover.setProductTypes(productTypes);

  const addProductsParams = products.map(product => {
    const underlyingToken = ['ETH', 'DAI'].indexOf(product.underlyingToken);
    const productType = { protocol: 0, custodian: 1, token: 2 }[product.type];
    const yieldTokenAddress = product.coveredToken || '0x0000000000000000000000000000000000000000';

    let coverAssets =
      underlyingToken === -1
        ? 0 // when no underlyingToken is present use the global fallback
        : 1 << underlyingToken; // 0b01 for ETH and 0b10 for DAI

    if (product.legacyProductId === '0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B') {
      coverAssets = 1; // only ETH for MakerDAO
    }

    return {
      productId: MaxUint256,
      ipfsMetadata: '',
      product: {
        productType,
        yieldTokenAddress,
        coverAssets,
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
        useFixedPrice: false,
      },
      allowedPools: [],
    };
  });
  // 0b01 for eth and 0b10 for dai
  const coverAssetsFallback = 0b11;
  await cover.setCoverAssetsFallback(coverAssetsFallback);

  console.log('Setting Cover products.');
  await cover.setProducts(addProductsParams);
  const productsStored = await cover.getProducts();
  console.log(`${productsStored.length} products added.`);
  // fs.writeFileSync('products.json', JSON.stringify(productsStored, null, 2));

  console.log('Adding proposal categories');
  await pc.initialize(mr.address);
  for (const category of proposalCategories) {
    await pc.addInitialCategory(...category);
  }

  console.log('Switching governance address');
  await gv.changeMasterAddress(master.address);
  await master.switchGovernanceAddress(gv.address);

  console.log('Upgrading to non-disposable contracts');
  await upgradeProxy(mr.address, 'MemberRoles');
  await upgradeProxy(tc.address, 'TokenController', [qd.address, cr.address, spf.address]);
  await upgradeProxy(ps.address, 'LegacyPooledStaking', [cover.address, productsV1.address]);
  await upgradeProxy(pc.address, 'ProposalCategory');
  await upgradeProxy(master.address, 'NXMaster');
  await upgradeProxy(gv.address, 'Governance');
  await upgradeProxy(gw.address, 'LegacyGateway');
  await upgradeProxy(ic.address, 'IndividualClaims', [tk.address, coverNFT.address]);
  await upgradeProxy(yt.address, 'YieldTokenIncidents', [tk.address, coverNFT.address]);
  await upgradeProxy(assessment.address, 'Assessment', [tk.address]);
  await upgradeProxy(cover.address, 'Cover', [coverNFT.address, stakingNFT.address, spf.address, stakingPool.address]);

  console.log('Transferring ownership of proxy contracts');
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
    const contractList = await verifier.getContractList();
    fs.writeFileSync('/tmp/contractList.json', JSON.stringify(contractList, null, 2));
    console.log({ contractList });

    for (const contract of contractList) {
      console.log('---------------------');
      console.log('Verifying: ', contract);
      await tenderly.verify(contract);
    }
  }

  if (!verifyOnTenderly && !verifyOnEtherscan) {
    console.log('Contract verifications skipped');
  }

  const configFile = path.resolve(CONFIG_FILE);
  const abiDir = path.resolve(ABI_DIR);

  const config = fs.existsSync(configFile) ? require(configFile) : {};
  config.CONTRACTS_ADDRESSES = {};

  fs.existsSync(abiDir) && fs.rmSync(abiDir, { recursive: true });
  fs.mkdirSync(abiDir, { recursive: true });

  console.log(`Dumping abis to ${abiDir}`);
  const unsortedContracts = await verifier.dump();
  const contracts = unsortedContracts.sort((a, b) => a.abiFilename.localeCompare(b.abiFilename));

  for (const contract of contracts) {
    const { abi, address, abiFilename, isProxy } = contract;

    if (/^(CSMock|Disposable)/.test(abiFilename)) {
      continue;
    }

    const contractName = /^(Testnet)/.test(abiFilename)
      ? abiFilename.replace('Testnet', 'Legacy') // TestnetQuotationData -> LegacyQuotationData
      : abiFilename;

    const contractAlias = /^(Testnet)/.test(contract.alias)
      ? contract.alias.replace('Testnet', 'Legacy') // TestnetQuotationData -> LegacyQuotationData
      : contract.alias;

    const alias = contractAlias || contractName;

    const abiPath = path.join(abiDir, `${contractName}.json`);
    fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2));

    if (contractName === 'StakingPool') {
      // for the StakingPool we only want the abi
      continue;
    }

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