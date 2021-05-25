const { artifacts, config, network, run, web3 } = require('hardhat');
const { ether, constants: { ZERO_ADDRESS } } = require('@openzeppelin/test-helpers');

const Verifier = require('../lib/verifier');
const { getEnv, hex } = require('../lib/helpers');
const proposalCategories = require('../lib/proposal-categories');

const { toBN } = web3.utils;

// external
const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');

// nexusmutual
const NXMToken = artifacts.require('NXMToken');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const TokenData = artifacts.require('TokenData');
const TokenFunctions = artifacts.require('TokenFunctions');
const Pool = artifacts.require('Pool');
const Quotation = artifacts.require('Quotation');
const QuotationData = artifacts.require('QuotationData');
const ClaimProofs = artifacts.require('ClaimProofs');
const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const SwapOperator = artifacts.require('SwapOperator');
const TwapOracle = artifacts.require('TwapOracle');
const DisposableMCR = artifacts.require('DisposableMCR');

// temporary contracts used for initialization
const DisposableNXMaster = artifacts.require('DisposableNXMaster');
const DisposableMemberRoles = artifacts.require('DisposableMemberRoles');
const DisposableTokenController = artifacts.require('DisposableTokenController');
const DisposableProposalCategory = artifacts.require('DisposableProposalCategory');
const DisposableGovernance = artifacts.require('DisposableGovernance');
const DisposablePooledStaking = artifacts.require('DisposablePooledStaking');
const DisposableGateway = artifacts.require('DisposableGateway');

// target contracts
const TestnetNXMaster = artifacts.require('TestnetNXMaster');
const MemberRoles = artifacts.require('MemberRoles');
const TokenController = artifacts.require('TokenController');
const ProposalCategory = artifacts.require('ProposalCategory');
const Governance = artifacts.require('Governance');
const PooledStaking = artifacts.require('PooledStaking');
const Gateway = artifacts.require('Gateway');
const Incidents = artifacts.require('Incidents');

const INITIAL_SUPPLY = ether('1500000');
const etherscanApiKey = getEnv('ETHERSCAN_API_KEY');

const contractType = code => {
  const upgradable = ['CL', 'CR', 'MC', 'P1', 'QT', 'TF'];
  const proxies = ['GV', 'MR', 'PC', 'PS', 'TC', 'GW', 'IC'];

  if (upgradable.includes(code)) {
    return 1;
  }

  if (proxies.includes(code)) {
    return 2;
  }

  return 0;
};

const UNISWAP_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const WETH_ADDRESS = '0xd0a1e359811322d97991e03f863a0c30c2cf029c';

// source: https://docs.chain.link/docs/price-feeds-migration-august-2020
const CHAINLINK_DAI_ETH_AGGREGATORS = {
  mainnet: '0x773616E4d11A78F511299002da57A0a94577F1f4',
  rinkeby: '0x2bA49Aaa16E6afD2a993473cfB70Fa8559B523cF',
  kovan: '0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541',
  // used when running hh node to fork a network, change me if needed
  localhost: '0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541',
};

async function main () {
  // make sure the contracts are compiled and we're not deploying an outdated artifact
  await run('compile');

  console.log(`Using network: ${network.name}`);
  console.log('Network config:', config.networks[network.name]);

  const [owner] = await web3.eth.getAccounts();
  const verifier = new Verifier(web3, etherscanApiKey, network.name);

  const deployProxy = async (contract, txParams = {}) => {
    console.log(`Deploying proxy ${contract.contractName}`);
    const implementation = await contract.new(txParams);
    const proxy = await OwnedUpgradeabilityProxy.new(implementation.address);
    const instance = await contract.at(proxy.address);
    return { instance, implementation, proxy };
  };

  const upgradeProxy = async (proxyAddress, contract, txParams) => {
    console.log(`Upgrading proxy ${contract.contractName}`);
    const implementation = await contract.new(txParams);
    const proxy = await OwnedUpgradeabilityProxy.at(proxyAddress);
    await proxy.upgradeTo(implementation.address);
    return { implementation };
  };

  const transferProxyOwnership = async (proxyAddress, newOwner) => {
    const proxy = await OwnedUpgradeabilityProxy.at(proxyAddress);
    await proxy.transferProxyOwnership(newOwner);
  };

  // deploy external contracts
  console.log('Deploying DAI');
  const dai = await ERC20MintableDetailed.new('DAI Mock', 'DAI', 18);
  verifier.add(dai, { constructorArgs: ['DAI Mock', 'DAI', 18] });

  console.log('Deploying stETH');
  const stETH = await ERC20MintableDetailed.new('stETH Mock', 'stETH', 18);
  verifier.add(stETH, { constructorArgs: ['stETH Mock', 'stETH', 18] });

  console.log('Deploying uniswap pair');
  const uniswapV2Factory = await UniswapV2Factory.at(UNISWAP_FACTORY);
  await uniswapV2Factory.createPair(WETH_ADDRESS, dai.address);

  console.log('Deploying token contracts');
  const tk = await NXMToken.new(owner, INITIAL_SUPPLY);
  const td = await TokenData.new(owner);
  const tf = await TokenFunctions.new();

  verifier.add(tk, { constructorArgs: [owner, INITIAL_SUPPLY] });
  verifier.add(td, { constructorArgs: [owner] });
  verifier.add(tf);

  console.log('Deploying quotation contracts');
  const qt = await Quotation.new();
  const qd = await QuotationData.new(owner, owner);

  verifier.add(qt);
  verifier.add(qd, { constructorArgs: [owner, owner] });

  // Non-upgradable contracts
  console.log('Deploying non-upgradable contracts');
  const cp = await ClaimProofs.new();
  verifier.add(cp);

  // proxy contracts
  console.log('Deploying proxy contracts');
  const { instance: master, implementation: masterImpl } = await deployProxy(DisposableNXMaster);
  const { instance: mr, implementation: mrImpl } = await deployProxy(DisposableMemberRoles);
  const { instance: tc, implementation: tcImpl } = await deployProxy(DisposableTokenController);
  const { instance: ps, implementation: psImpl } = await deployProxy(DisposablePooledStaking);
  const { instance: pc, implementation: pcImpl } = await deployProxy(DisposableProposalCategory);
  const { instance: gv, implementation: gvImpl } = await deployProxy(DisposableGovernance, { gas: 12e6 });
  const { instance: gateway, implementation: gatewayImpl } = await deployProxy(DisposableGateway);
  const { instance: incidents, implementation: incidentsImpl } = await deployProxy(Incidents);

  const proxiesAndImplementations = [
    { proxy: master, implementation: masterImpl, contract: 'DisposableNXMaster' },
    { proxy: mr, implementation: mrImpl, contract: 'DisposableMemberRoles' },
    { proxy: tc, implementation: tcImpl, contract: 'DisposableTokenController' },
    { proxy: ps, implementation: psImpl, contract: 'DisposablePooledStaking' },
    { proxy: pc, implementation: pcImpl, contract: 'DisposableProposalCategory' },
    { proxy: gv, implementation: gvImpl, contract: 'DisposableGovernance' },
    { proxy: gateway, implementation: gatewayImpl, contract: 'DisposableGateway' },
    { proxy: incidents, implementation: incidentsImpl, contract: 'Incidents' },
  ];

  for (const addresses of proxiesAndImplementations) {
    const { contract, proxy, implementation } = addresses;
    verifier.add(await OwnedUpgradeabilityProxy.at(proxy.address), {
      alias: contract,
      constructorArgs: [implementation.address],
    });
    verifier.add(implementation);
  }

  // non-proxy contracts and libraries
  console.log('Deploying TwapOracle, SwapOperator, PriceFeedOracle');
  const twapOracle = await TwapOracle.new(uniswapV2Factory.address);
  const swapOperator = await SwapOperator.new(master.address, twapOracle.address, owner, stETH.address);

  verifier.add(twapOracle, { constructorArgs: [uniswapV2Factory.address] });
  // skipping swap operator - library verification not currently implemented

  const priceFeedOracle = await PriceFeedOracle.new(
    CHAINLINK_DAI_ETH_AGGREGATORS[network.name],
    dai.address,
    stETH.address,
  );

  verifier.add(priceFeedOracle, {
    constructorArgs: [
      CHAINLINK_DAI_ETH_AGGREGATORS[network.name],
      dai.address,
      stETH.address,
    ],
  });

  console.log('Deploying claims contracts');
  const cl = await Claims.new();
  const cd = await ClaimsData.new();
  const cr = await ClaimsReward.new(master.address, dai.address);

  verifier.add(cl);
  verifier.add(cd);
  verifier.add(cr, { constructorArgs: [master.address, dai.address] });

  console.log('Deploying capital contracts');
  const mc = await DisposableMCR.new(ZERO_ADDRESS);

  const mcrEth = ether('50000');
  const mcrFloor = mcrEth.sub(ether('10000'));

  const latestBlock = await web3.eth.getBlock('latest');
  const lastUpdateTime = latestBlock.timestamp - 60;
  const mcrFloorIncrementThreshold = 13000;
  const maxMCRFloorIncrement = 100;
  const maxMCRIncrement = 500;
  const gearingFactor = 48000;
  const minUpdateTime = 3600;

  await mc.initialize(
    mcrEth,
    mcrFloor,
    mcrEth, // desiredMCR
    lastUpdateTime,
    mcrFloorIncrementThreshold,
    maxMCRFloorIncrement,
    maxMCRIncrement,
    gearingFactor,
    minUpdateTime,
  );

  const poolParameters = [
    [dai.address, stETH.address],
    [ether('1000000'), ether('1')],
    [ether('2000000'), ether('10000000')],
    [ether('0.025'), ether('0.025')],
    master.address,
    priceFeedOracle.address,
    swapOperator.address,
  ];

  const p1 = await Pool.new(...poolParameters);

  verifier.add(mc, { constructorArgs: [ZERO_ADDRESS] });
  verifier.add(p1, { constructorArgs: poolParameters });
  verifier.add(incidents, { constructorArgs: [] });

  const codes = ['QD', 'TD', 'CD', 'QT', 'TF', 'TC', 'CL', 'CR', 'P1', 'MC', 'GV', 'PC', 'MR', 'PS', 'GW', 'IC'];
  const addresses = [qd, td, cd, qt, tf, tc, cl, cr, p1, mc, { address: owner }, pc, mr, ps, gateway, incidents].map(
    c => c.address,
  );

  console.log('Running initializations');
  await master.initialize(
    owner,
    tk.address,
    300, // emergency pause time
    codes.map(hex), // codes
    codes.map(contractType), // types
    addresses, // addresses
  );

  await tc.initialize(
    master.address,
    tk.address,
    ps.address,
    600, // _claimsAssessmentLockTime
    300, // _claimSubmissionGracePeriod
  );

  await mr.initialize(
    owner,
    master.address,
    tc.address,
    [owner], // initial members
    [ether('10000')], // initial tokens
    [owner], // advisory board members
  );

  await gv.initialize(
    toBN(600), // 10 minutes
    toBN(600), // 10 minutes
    toBN(5),
    toBN(40),
    toBN(75),
    toBN(300), // 5 minutes
  );

  await ps.initialize(
    tc.address,
    ether('2'), // min stake
    ether('2'), // min unstake
    10, // max exposure
    600, // unstake lock time
  );

  await incidents.initialize();

  await gateway.initialize(master.address, dai.address);

  console.log('Adding proposal categories');

  await pc.initialize(mr.address);

  for (const category of proposalCategories) {
    await pc.addInitialCategory(...category);
  }

  console.log('Setting parameters');

  console.log('Setting ClaimsData parameters');
  await cd.changeMasterAddress(master.address);
  await cd.updateUintParameters(hex('CAMAXVT'), 2); // max voting time 2h
  await cd.updateUintParameters(hex('CAMINVT'), 1); // min voting time 1h
  await cd.updateUintParameters(hex('CADEPT'), 1); // claim deposit time 1 day
  await cd.updateUintParameters(hex('CAPAUSET'), 1); // claim assessment pause time 1 day

  console.log('Setting TokenData parameters');
  await td.changeMasterAddress(master.address);
  await td.updateUintParameters(hex('RACOMM'), 50); // staker commission percentage 50%
  await td.updateUintParameters(hex('CABOOKT'), 1); // "book time" 1h
  await td.updateUintParameters(hex('CALOCKT'), 1); // ca lock 1 day
  await td.updateUintParameters(hex('MVLOCKT'), 1); // ca lock mv 1 day

  await master.switchGovernanceAddress(gv.address);

  console.log('Upgrading to non-disposable contracts');
  const { implementation: newMasterImpl } = await upgradeProxy(master.address, TestnetNXMaster);
  const { implementation: newMrImpl } = await upgradeProxy(mr.address, MemberRoles);
  const { implementation: newTcImpl } = await upgradeProxy(tc.address, TokenController);
  const { implementation: newPsImpl } = await upgradeProxy(ps.address, PooledStaking);
  const { implementation: newPcImpl } = await upgradeProxy(pc.address, ProposalCategory);
  const { implementation: newGvImpl } = await upgradeProxy(gv.address, Governance);
  const { implementation: newGatewayImpl } = await upgradeProxy(gateway.address, Gateway);
  await gateway.changeDependentContractAddress();

  verifier.add(newMasterImpl);
  verifier.add(newMrImpl);
  verifier.add(newTcImpl);
  verifier.add(newPsImpl);
  verifier.add(newPcImpl);
  verifier.add(newGvImpl);
  verifier.add(newGatewayImpl);

  console.log('Transfering ownership of proxy contracts');
  await transferProxyOwnership(mr.address, master.address);
  await transferProxyOwnership(tc.address, master.address);
  await transferProxyOwnership(ps.address, master.address);
  await transferProxyOwnership(pc.address, master.address);
  await transferProxyOwnership(gv.address, master.address);
  await transferProxyOwnership(gateway.address, master.address);
  await transferProxyOwnership(master.address, gv.address);

  const deployDataFile = `${__dirname}/../artifacts/${network.name}-deploy-data.json`;
  verifier.dump(deployDataFile);

  console.log('Minting DAI to pool');
  await dai.mint(p1.address, ether('6500000'));

  console.log('Performing verifications');
  await verifier.submit();

  console.log('Set governanceOwner to allow for execution of onlyGovernance actions.');
  const testnetMaster = await TestnetNXMaster.at(master.address);
  await testnetMaster.initializeGovernanceOwner();

  console.log('Done!');
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
