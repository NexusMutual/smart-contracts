const fs = require('fs');
const { ethers, network, run, tenderly } = require('hardhat');
const path = require('path');

const { hex } = require('../../lib/helpers');
const proposalCategories = require('../../lib/proposal-categories');
const products = require('../v2-migration/output/migratableProducts.json');
const verifier = require('./verifier')();
const { setEtherBalance } = require('../../test/utils').evm;

const { AddressZero, MaxUint256, WeiPerEther } = ethers.constants;
const { parseEther, parseUnits } = ethers.utils;
const { ABI_DIR, ADDRESSES_FILE, INITIAL_MEMBERS = '' } = process.env;

if (!ABI_DIR || !ADDRESSES_FILE) {
  console.log('ABI_DIR and ADDRESSES_FILE env vars are required');
  process.exit(1);
}

if (network.name === 'tenderly' && typeof tenderly === 'undefined') {
  console.error('Please enable tenderly plugin using ENABLE_TENDERLY=1 env var');
  process.exit(1);
}

const CAPITAL_POOL_VALUE = parseEther('146000');
const DAI_ETH_RATE = parseEther('0.00050');
const POOL_BALANCE_DAI = parseEther('5040000');
const POOL_BALANCE_ETH = CAPITAL_POOL_VALUE.sub(DAI_ETH_RATE.mul(POOL_BALANCE_DAI).div(WeiPerEther));

const BONDING_CURVE_PRICE = parseEther('0.0286');
const SPOT_PRICE_B = parseEther('0.01');
const TOKEN_SUPPLY = parseEther('6760000');

const PROXY_CONTRACT = 'contracts/modules/governance/external/OwnedUpgradeabilityProxy.sol:OwnedUpgradeabilityProxy';

const claimMethod = { claim: 0, incident: 1 };
const productTypes = [
  {
    productTypeName: 'Protocol',
    productTypeId: MaxUint256,
    ipfsMetadata: 'protocolCoverIPFSHash',
    productType: {
      descriptionIpfsHash: 'protocolCoverIPFSHash',
      claimMethod: claimMethod.claim,
      gracePeriod: 30,
    },
  },
  {
    productTypeName: 'Custody',
    productTypeId: MaxUint256,
    ipfsMetadata: 'custodyCoverIPFSHash',
    productType: {
      descriptionIpfsHash: 'custodyCoverIPFSHash',
      claimMethod: claimMethod.claim,
      gracePeriod: 90,
    },
  },
  {
    productTypeName: 'Yield Token',
    productTypeId: MaxUint256,
    ipfsMetadata: 'yieldTokenCoverIPFSHash',
    productType: {
      descriptionIpfsHash: 'yieldTokenCoverIPFSHash',
      claimMethod: claimMethod.incident,
      gracePeriod: 14,
    },
  },
  {
    productTypeName: 'Stakewise ETH2 Staking',
    productTypeId: MaxUint256,
    ipfsMetadata: 'eth2slashingCoverIPFSHash',
    productType: {
      descriptionIpfsHash: 'eth2slashingCoverIPFSHash',
      claimMethod: claimMethod.claim,
      gracePeriod: 30,
    },
  },
  {
    productTypeName: 'Sherlock',
    productTypeId: MaxUint256,
    ipfsMetadata: 'sherlockCoverIPFSHash',
    productType: {
      descriptionIpfsHash: 'sherlockCoverIPFSHash',
      claimMethod: claimMethod.claim,
      gracePeriod: 30,
    },
  },
];

// TODO: use the name from the productTypes array above
const productTypeNames = ['protocol', 'custodian', 'token', 'eth2slashing', 'sherlock'];

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

const CHAINLINK_ENZYME_VAULT = {
  mainnet: '0xCc72039A141c6e34a779eF93AEF5eB4C82A893c7',
  rinkeby: '0x0000000000000000000000000000000000000000', // missing
};

async function main() {
  // Remove verbose logs
  // await network.provider.send('hardhat_setLoggingEnabled', [false]);

  // make sure the contracts are compiled and we're not deploying an outdated artifact
  await run('compile');

  const [ownerSigner] = await ethers.getSigners();
  const { address: owner } = ownerSigner;

  console.log(`Using network: ${network.name}`);
  console.log(`Using deployer address: ${owner}`);

  await setEtherBalance(owner, parseEther('100'));

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
    // reverts when calling cover.changeDependentContractAddress because it doesn't have a master contract set yet
    // instance.changeDependentContractAddress && (await instance.changeDependentContractAddress());
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

  console.log('Deploying Enzyme Vault');
  const enzymeVault = await deployImmutable(
    'contracts/mocks/Tokens/ERC20MintableDetailed.sol:ERC20MintableDetailed',
    ['enzymeVault Mock', 'enzymeVault', 18],
    { alias: 'enzymeVault', abiFilename: 'ERC20' },
  );

  console.log('Deploying NXMToken');
  const tk = await deployImmutable('NXMToken', [owner, TOKEN_SUPPLY]);

  console.log('Deploying wNXM');
  await deployImmutable('wNXM', [tk.address]);

  console.log('Deploying disposable NXMaster');
  const master = await deployProxy('DisposableNXMaster');

  console.log('Deploying disposable MemberRoles');
  const mr = await deployProxy('DisposableMemberRoles', [tk.address]);

  console.log('Deploying disposable PooledStaking');
  const ps = await deployProxy('DisposablePooledStaking', [tk.address]);

  console.log('Deploying disposable PproposalCategory');
  const pc = await deployProxy('DisposableProposalCategory');

  console.log('Deploying disposable Governance');
  const gv = await deployProxy('DisposableGovernance', [], { overrides: { gasLimit: 12e6 } });

  console.log('Deploying LegacyClaimsReward');
  const cr = await deployImmutable('LegacyClaimsReward', [master.address, dai.address]);

  console.log('Deploying testnet LegacyQuotationData');
  // Replaced LegacyQuotationData with TestnetQuotationData for ability to create old v1 covers locally
  const qd = await deployImmutable('TestnetQuotationData', [owner, owner]);
  await qd.changeMasterAddress(master.address);

  console.log('Deploying disposable LegacyGateway');
  const gw = await deployProxy('DisposableGateway', [qd.address, tk.address]);

  console.log('Deploying ProductsV1');
  const productsV1 = await deployImmutable('ProductsV1');

  console.log('Deploying Cover and StakingProducts stubs');
  const coverStub = await deployProxy('ERC20Mock'); // temporarily using erc20 mock instead of stub
  const stakingProductsStub = await deployProxy('Stub');

  console.log('Deploying StakingPoolFactory');
  const spf = await deployImmutable('StakingPoolFactory', [coverStub.address]);

  console.log('Deploying CoverNFT and CoverNFTDescriptor');
  const coverNFTDescriptor = await deployImmutable('CoverNFTDescriptor', [master.address]);
  const coverNFT = await deployImmutable('CoverNFT', [
    'Nexus Mutual Cover',
    'NMC',
    coverStub.address,
    coverNFTDescriptor.address,
  ]);

  console.log('Deploying StakingNFT and StakingNFTDescriptor');
  const stakingNFTDescriptor = await deployImmutable('StakingNFTDescriptor');
  const stakingNFT = await deployImmutable('StakingNFT', [
    'Nexus Mutual Stake',
    'NMS',
    spf.address,
    coverStub.address,
    stakingNFTDescriptor.address,
  ]);

  console.log('Deploying StakingProducts');
  const stakingProducts = await upgradeProxy(stakingProductsStub.address, 'StakingProducts', [
    coverStub.address,
    spf.address,
  ]);

  console.log('Deploying disposable TokenController');
  const tc = await deployProxy(
    'DisposableTokenController',
    [qd, cr, spf, tk].map(c => c.address),
  );

  console.log('Deploying StakingPool');
  const stakingPool = await deployImmutable('StakingPool', [
    stakingNFT.address,
    tk.address,
    coverStub.address,
    tc.address,
    master.address,
    stakingProducts.address,
  ]);

  console.log('Deploying Cover');
  const cover = await upgradeProxy(coverStub.address, 'Cover', [
    coverNFT.address,
    stakingNFT.address,
    spf.address,
    stakingPool.address,
  ]);

  console.log('Deploying Ramm');
  const ramm = await deployProxy('DisposableRamm', [SPOT_PRICE_B]);
  await ramm.initialize(
    POOL_BALANCE_ETH, // FIXME: need to pass pool value, not just eth balance
    TOKEN_SUPPLY, // here we don't check it actually matches, make sure it's correct
    BONDING_CURVE_PRICE,
  );

  console.log('Deploying CoverViewer');
  await deployImmutable('CoverViewer', [master.address]);

  console.log('Deploying StakingViewer');
  await deployImmutable('StakingViewer', [master.address, stakingNFT.address, spf.address]);

  console.log('Deploying assessment contracts');
  const cg = await deployProxy('YieldTokenIncidents', [tk.address, coverNFT.address]);
  const ci = await deployProxy('IndividualClaims', [tk.address, coverNFT.address]);
  const assessment = await deployProxy('Assessment', [tk.address]);
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
    await chainlinkDaiMock.setLatestAnswer(DAI_ETH_RATE);
    await chainlinkDaiMock.setDecimals(18);
    CHAINLINK_DAI_ETH[network.name] = chainlinkDaiMock.address;
  }

  if (typeof CHAINLINK_STETH_ETH[network.name] === 'undefined') {
    console.log('Deploying chainlink steth-eth aggregator');
    const chainlinkStEthMock = await deployImmutable('ChainlinkAggregatorMock', [], {
      alias: 'Chainlink-STETH-ETH',
      abiFilename: 'EACAggregatorProxy',
    });
    await chainlinkStEthMock.setLatestAnswer(parseEther('1.003')); // almost 1:1
    await chainlinkStEthMock.setDecimals(18);
    CHAINLINK_STETH_ETH[network.name] = chainlinkStEthMock.address;
  }

  if (typeof CHAINLINK_ENZYME_VAULT[network.name] === 'undefined') {
    console.log('Deploying chainlink enzyme vault aggregator');
    const chainlinkEnzymeVaultMock = await deployImmutable('ChainlinkAggregatorMock', [], {
      alias: 'Chainlink-ENZYME-VAULT',
      abiFilename: 'EACAggregatorProxy',
    });
    await chainlinkEnzymeVaultMock.setLatestAnswer(parseEther('1.003')); // almost 1:1
    await chainlinkEnzymeVaultMock.setDecimals(18);
    CHAINLINK_ENZYME_VAULT[network.name] = chainlinkEnzymeVaultMock.address;
  }

  // only used by frontend
  if (typeof CHAINLINK_ETH_USD[network.name] === 'undefined') {
    console.log('Deploying chainlink eth-usd aggregator');
    const chainlinkEthUsdMock = await deployImmutable('ChainlinkAggregatorMock', [], {
      alias: 'Chainlink-ETH-USD',
      abiFilename: 'EACAggregatorProxy',
    });
    await chainlinkEthUsdMock.setLatestAnswer(parseUnits('1234.56', 8));
    await chainlinkEthUsdMock.setDecimals(8);
    CHAINLINK_ETH_USD[network.name] = chainlinkEthUsdMock.address;
  }

  console.log('Deploying PriceFeedOracle');
  const priceFeedOracle = await deployImmutable('PriceFeedOracle', [
    [dai.address, stETH.address, enzymeVault.address],
    [CHAINLINK_DAI_ETH[network.name], CHAINLINK_STETH_ETH[network.name], CHAINLINK_ENZYME_VAULT[network.name]],
    [18, 18, 18],
  ]);

  console.log('Deploying disposable MCR');
  const disposableMCR = await deployImmutable('DisposableMCR', [
    parseEther('10000'), // mcrEth
    parseEther('10000'), // desiredMCR
    (await ethers.provider.getBlock('latest')).timestamp - 60, // lastUpdateTime
    500, // maxMCRIncrement
    48000, // gearingFactor
    3600, // minUpdateTime
  ]);
  // deploy MCR with DisposableMCR as a fake master
  const mcr = await deployImmutable('MCR', [disposableMCR.address, 0]);
  // trigger initialize and update master address
  await disposableMCR.initializeNextMcr(mcr.address, master.address);

  console.log('Deploying Pool');
  const legacyPoolParameters = [master, priceFeedOracle, swapOperator, dai, stETH, enzymeVault, tk].map(x => x.address);
  const legacyPool = await deployImmutable('LegacyPool', legacyPoolParameters);
  const poolParameters = [master, priceFeedOracle, swapOperator, tk, legacyPool].map(c => c.address);
  const pool = await deployImmutable('Pool', poolParameters);

  console.log('Funding the Pool and minting tokens');
  await setEtherBalance(pool.address, POOL_BALANCE_ETH);
  await dai.mint(pool.address, POOL_BALANCE_DAI);

  console.log('Initializing contracts');
  const replaceableContractCodes = ['MC', 'P1', 'CL'];
  const replaceableContractAddresses = [mcr, pool, coverMigrator].map(x => x.address);

  const proxyContractCodes = ['GV', 'MR', 'PC', 'PS', 'TC', 'GW', 'CO', 'CG', 'CI', 'AS', 'SP', 'RA'];
  const proxyContractAddresses = [
    { address: owner }, // as governance
    mr,
    pc,
    ps,
    tc,
    gw,
    cover,
    cg,
    ci,
    assessment,
    stakingProducts,
    ramm,
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
  await tc.initialize(master.address, ps.address, assessment.address);

  console.log('Initializing MemberRoles');
  const initialMembers = [
    owner,
    ...INITIAL_MEMBERS.split(',')
      .map(x => x.trim())
      .filter(a => ethers.utils.isAddress(a)),
  ];

  const initialTokens = initialMembers.map(() => '0');

  await mr.initialize(
    owner,
    master.address,
    tc.address,
    initialMembers,
    initialTokens,
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

  console.log('Initializing LegacyGateway');
  await gw.initialize(master.address, dai.address);

  console.log('Add covered products');
  await cover.changeMasterAddress(master.address);
  await cover.changeDependentContractAddress();
  await cover.setProductTypes(productTypes);

  const addProductsParams = products.map(product => {
    const underlyingToken = ['ETH', 'DAI'].indexOf(product.underlyingToken);
    const productType = productTypeNames.indexOf(product.type);
    const yieldTokenAddress = product.coveredToken || '0x0000000000000000000000000000000000000000';

    let coverAssets =
      underlyingToken === -1
        ? 0 // when no underlyingToken is present use the global fallback
        : 1 << underlyingToken; // 0b01 for ETH and 0b10 for DAI

    if (product.legacyProductId === '0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B') {
      coverAssets = 1; // only ETH for MakerDAO
    }

    return {
      productName: product.name,
      productId: MaxUint256,
      ipfsMetadata: '',
      product: {
        productType,
        yieldTokenAddress,
        coverAssets,
        initialPriceRatio: 100,
        capacityReductionRatio: 0,
        isDeprecated: false,
        useFixedPrice: false,
      },
      allowedPools: [],
    };
  });

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
  await upgradeProxy(mr.address, 'MemberRoles', [tk.address]);
  await upgradeProxy(tc.address, 'TokenController', [qd.address, cr.address, spf.address, tk.address]);
  await upgradeProxy(ps.address, 'LegacyPooledStaking', [
    cover.address,
    productsV1.address,
    stakingNFT.address,
    tk.address,
  ]);
  await upgradeProxy(pc.address, 'ProposalCategory');
  await upgradeProxy(master.address, 'NXMaster');
  await upgradeProxy(gv.address, 'Governance');
  await upgradeProxy(gw.address, 'LegacyGateway', [qd.address, tk.address]);
  await upgradeProxy(cover.address, 'Cover', [coverNFT.address, stakingNFT.address, spf.address, stakingPool.address]);
  await upgradeProxy(ramm.address, 'Ramm', [SPOT_PRICE_B]);

  console.log('Transferring ownership of proxy contracts');
  // transfer ownership to master contract
  await transferProxyOwnership(mr.address, master.address);
  await transferProxyOwnership(tc.address, master.address);
  await transferProxyOwnership(ps.address, master.address);
  await transferProxyOwnership(pc.address, master.address);
  await transferProxyOwnership(gv.address, master.address);
  await transferProxyOwnership(gw.address, master.address);
  await transferProxyOwnership(cover.address, master.address);
  await transferProxyOwnership(cg.address, master.address);
  await transferProxyOwnership(ci.address, master.address);
  await transferProxyOwnership(assessment.address, master.address);
  await transferProxyOwnership(ramm.address, master.address);

  // transfer ownership to governance contract
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

  const addressesFile = path.resolve(ADDRESSES_FILE);
  const abiDir = path.resolve(ABI_DIR);

  const addressesMap = {};

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

    if (!addressesMap[alias] || isProxy) {
      addressesMap[alias] = address;
    }
  }

  console.log(`Updating addresses.json ${addressesFile}`);
  fs.writeFileSync(addressesFile, JSON.stringify(addressesMap, null, 2), 'utf8');

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
