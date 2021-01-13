require('dotenv').config();

const { artifacts, web3 } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');
const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers').constants;
const Web3 = require('web3');
const Verifier = require('../lib/verifier');
const { getenv } = require('../lib/env');
const { hex } = require('../lib/helpers');
const fs = require('fs');
const { toBN } = Web3.utils;

// external
const OwnedERC20 = artifacts.require('OwnedERC20');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');

// nexusmutual
const NXMToken = artifacts.require('NXMToken');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const MCR = artifacts.require('MCR');
const TokenData = artifacts.require('TokenData');
const TokenFunctions = artifacts.require('TokenFunctions');
const Pool = artifacts.require('Pool');
const PoolData = artifacts.require('PoolData');
const Quotation = artifacts.require('Quotation');
const QuotationData = artifacts.require('QuotationData');
const ClaimProofs = artifacts.require('ClaimProofs');
const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const SwapAgent = artifacts.require('SwapAgent');
const TwapOracle = artifacts.require('TwapOracle');

// temporary contracts used for initialization
const DisposableNXMaster = artifacts.require('DisposableNXMaster');
const DisposableMemberRoles = artifacts.require('DisposableMemberRoles');
const DisposableTokenController = artifacts.require('DisposableTokenController');
const DisposableProposalCategory = artifacts.require('DisposableProposalCategory');
const DisposableGovernance = artifacts.require('DisposableGovernance');
const DisposablePooledStaking = artifacts.require('DisposablePooledStaking');

// target contracts
const NXMaster = artifacts.require('NXMaster');
const MemberRoles = artifacts.require('MemberRoles');
const TokenController = artifacts.require('TokenController');
const ProposalCategory = artifacts.require('ProposalCategory');
const Governance = artifacts.require('Governance');
const PooledStaking = artifacts.require('PooledStaking');

const INITIAL_SUPPLY = ether('1500000');
const etherscanApiKey = getenv('ETHERSCAN_API_KEY');

const contractType = code => {

  const upgradable = ['CL', 'CR', 'MC', 'P1', 'QT', 'TF'];
  const proxies = ['GV', 'MR', 'PC', 'PS', 'TC'];

  if (upgradable.includes(code)) {
    return 2;
  }

  if (proxies.includes(code)) {
    return 1;
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
};
const CHAINLINK_DAI_ETH_AGGREGATOR = CHAINLINK_DAI_ETH_AGGREGATORS[process.env.NETWORK];

async function run () {
  const network = getenv('NETWORK').toUpperCase();
  const owner = getenv(`${network}_ACCOUNT`);

  console.log(`Using ${network} network`);
  const verifier = new Verifier(web3, etherscanApiKey, network.toLowerCase());

  const deployProxy = async (contract, txParams) => {
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
  const dai = await OwnedERC20.new();

  verifier.add('OwnedERC20', dai.address);

  console.log('Deploying uniswap pair..');
  const uniswapV2Factory = await UniswapV2Factory.at(UNISWAP_FACTORY);
  await uniswapV2Factory.createPair(WETH_ADDRESS, dai.address);

  // non-proxy contracts and libraries
  console.log('Deploying TwapOracle, SwapAgent, PriceFeedOracle');
  const twapOracle = await TwapOracle.new(uniswapV2Factory.address);
  const swapAgent = await SwapAgent.new();
  const priceFeedOracle = await PriceFeedOracle.new(
    [dai.address],
    [CHAINLINK_DAI_ETH_AGGREGATOR],
    dai.address,
  );

  // link pool to swap agent library
  Pool.link(swapAgent);

  console.log('Deploying token contracts');
  const tk = await NXMToken.new(owner, INITIAL_SUPPLY);
  const td = await TokenData.new(owner);
  const tf = await TokenFunctions.new();

  verifier.add('NXMToken', tk.address, ['address', 'uint256'], [owner, INITIAL_SUPPLY]);
  verifier.add('TokenData', td.address, ['address'], [owner]);
  verifier.add('TokenFunctions', tf.address);

  console.log('Deploying quotation contracts');
  const qt = await Quotation.new();
  const qd = await QuotationData.new(owner, owner);

  verifier.add('Quotation', qt.address);
  verifier.add('QuotationData', qd.address, ['address', 'address'], [owner, owner]);

  // Non-upgradable contracts
  console.log('Deploying non-upgradable contracts');
  const cp = await ClaimProofs.new();
  verifier.add('ClaimProofs', cp.address);

  // proxy contracts
  console.log('Deploying proxy contracts');
  const { instance: master, implementation: masterImpl } = await deployProxy(DisposableNXMaster);
  const { instance: mr, implementation: mrImpl } = await deployProxy(DisposableMemberRoles);
  const { instance: tc, implementation: tcImpl } = await deployProxy(DisposableTokenController);
  const { instance: ps, implementation: psImpl } = await deployProxy(DisposablePooledStaking);
  const { instance: pc, implementation: pcImpl } = await deployProxy(DisposableProposalCategory);
  const { instance: gv, implementation: gvImpl } = await deployProxy(DisposableGovernance, { gas: 12e6 });

  const proxiesAndImplementations = [
    { proxy: master, implementation: masterImpl, contract: 'DisposableNXMaster' },
    { proxy: mr, implementation: mrImpl, contract: 'DisposableMemberRoles' },
    { proxy: tc, implementation: tcImpl, contract: 'DisposableTokenController' },
    { proxy: ps, implementation: psImpl, contract: 'DisposablePooledStaking' },
    { proxy: pc, implementation: pcImpl, contract: 'DisposableProposalCategory' },
    { proxy: gv, implementation: gvImpl, contract: 'DisposableGovernance' },
  ];

  console.log('Deploying claims contracts');
  const cl = await Claims.new();
  const cd = await ClaimsData.new();
  const cr = await ClaimsReward.new(master.address, dai.address);

  verifier.add('Claims', cl.address);
  verifier.add('ClaimsData', cd.address);
  verifier.add('ClaimsReward', cr.address);

  for (const addresses of proxiesAndImplementations) {
    const { contract, proxy, implementation } = addresses;
    verifier.add('OwnedUpgradeabilityProxy', proxy.address, ['address'], [implementation.address]);
    verifier.add(contract, implementation.address);
  }

  console.log('Deploying capital contracts');
  const mc = await MCR.new(ZERO_ADDRESS);

  const poolParameters = [
    [dai.address], // assets
    [0], // min amounts
    [ether('100000000')], // max amounts
    [ether('0.01')], // max slippage 1%
    master.address,
    priceFeedOracle.address,
    twapOracle.address,
    owner,
  ];
  const poolArgTypes = ['address[]', 'uint256[]', 'uint256[]', 'uint256[]', 'address', 'address', 'address', 'address'];

  const p1 = await Pool.new(...poolParameters);
  const pd = await PoolData.new(owner, ZERO_ADDRESS, dai.address);

  verifier.add('MCR', mc.address, ['address'], [ZERO_ADDRESS]);
  verifier.add('Pool', p1.address, poolArgTypes, poolParameters);
  verifier.add('PoolData', pd.address, ['address', 'address', 'address'], [owner, ZERO_ADDRESS, dai.address]);

  const codes = ['QD', 'TD', 'CD', 'PD', 'QT', 'TF', 'TC', 'CL', 'CR', 'P1', 'MC', 'GV', 'PC', 'MR', 'PS'];
  const addresses = [qd, td, cd, pd, qt, tf, tc, cl, cr, p1, mc, { address: owner }, pc, mr, ps].map(c => c.address);

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
    600, // minCALockTime
  );

  await mr.initialize(
    owner,
    master.address,
    tc.address,
    [owner], // initial members
    [ether('10000')], // initial tokens
    [owner], // advisory board members
  );

  await pc.initialize(mr.address, { gas: 10e6 });

  await ps.initialize(
    tc.address,
    ether('2'), // min stake
    ether('2'), // min unstake
    10, // max exposure
    600, // unstake lock time
  );

  await gv.initialize(
    toBN(600), // 10 minutes
    toBN(600), // 10 minutes
    toBN(5),
    toBN(40),
    toBN(75),
    toBN(300), // 5 minutes
  );

  console.log('Setting parameters');

  console.log('Setting PoolData parameters');
  await pd.changeMasterAddress(master.address);
  await pd.changeCurrencyAssetBaseMin(hex('DAI'), '0');
  await pd.changeCurrencyAssetBaseMin(hex('ETH'), '0');

  await pd.updateUintParameters(hex('MCRMIN'), ether('12000')); // minimum capital in eth
  await pd.updateUintParameters(hex('MCRSHOCK'), 50); // mcr shock parameter
  await pd.updateUintParameters(hex('MCRCAPL'), 20); // capacity limit per contract 20%

  console.log('Setting ClaimsData parameters');
  await cd.changeMasterAddress(master.address);
  await cd.updateUintParameters(hex('CAMAXVT'), 1); // max voting time 1h
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

  // trigger changeDependentContractAddress() on all contracts
  await master.changeAllAddress();

  console.log('Upgrading to non-disposable contracts');
  const { implementation: newMasterImpl } = await upgradeProxy(master.address, NXMaster);
  const { implementation: newMrImpl } = await upgradeProxy(mr.address, MemberRoles);
  const { implementation: newTcImpl } = await upgradeProxy(tc.address, TokenController);
  const { implementation: newPsImpl } = await upgradeProxy(ps.address, PooledStaking);
  const { implementation: newPcImpl } = await upgradeProxy(pc.address, ProposalCategory);
  const { implementation: newGvImpl } = await upgradeProxy(gv.address, Governance, { gas: 12e6 });

  verifier.add('NXMaster', newMasterImpl.address);
  verifier.add('MemberRoles', newMrImpl.address);
  verifier.add('TokenController', newTcImpl.address);
  verifier.add('PooledStaking', newPsImpl.address);
  verifier.add('ProposalCategory', newPcImpl.address);
  verifier.add('Governance', newGvImpl.address);

  console.log("Transfering contracts' ownership");
  await transferProxyOwnership(mr.address, master.address);
  await transferProxyOwnership(tc.address, master.address);
  await transferProxyOwnership(ps.address, master.address);
  await transferProxyOwnership(pc.address, master.address);
  await transferProxyOwnership(gv.address, master.address);
  await transferProxyOwnership(master.address, gv.address);

  console.log('Contract addresses to be verified:', verifier.dump());

  const deployData = JSON.stringify(verifier.dump());
  fs.writeFileSync('deploy-data.json', deployData, 'utf8');

  console.log('Minting DAI to pool');
  await dai.mint(p1.address, ether('6500000'));

  console.log('Posting MCR');
  await mc.addMCRData(
    13000,
    ether('20000'),
    ether('26000'),
    [hex('ETH'), hex('DAI')],
    [100, 25000],
    20200801,
  );

  console.log('Performing verifications');

  /*
   TODO: currently does not work with truffle flattener even if info is extracted from build-info
        because of format incompatibility. need to port deploy to use https://www.npmjs.com/package/hardhat-deploy
        to get verify functionality included
   */
  await verifier.submit();

  console.log('Done!');
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
