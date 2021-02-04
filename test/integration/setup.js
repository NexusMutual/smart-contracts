const { accounts, artifacts, web3 } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');

const { impersonateAccount } = require('../utils').evm;
const { hex } = require('../utils').helpers;
const { calculateMCRRatio } = require('../utils').tokenPrice;

const { BN } = web3.utils;

async function setup () {

  // external
  const ERC20BlacklistableMock = artifacts.require('ERC20BlacklistableMock');
  const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
  const P1MockChainlinkAggregator = artifacts.require('P1MockChainlinkAggregator');
  const WETH9 = artifacts.require('WETH9');
  const UniswapV2Factory = artifacts.require('UniswapV2Factory');
  const UniswapV2Router02 = artifacts.require('UniswapV2Router02');

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
  const Cover = artifacts.require('Cover');

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const QE = '0x51042c4d8936a7764d18370a6a0762b860bb8e07';
  const INITIAL_SUPPLY = ether('1500000');

  const deployProxy = async contract => {
    const implementation = await contract.new();
    const proxy = await OwnedUpgradeabilityProxy.new(implementation.address);
    return contract.at(proxy.address);
  };

  const upgradeProxy = async (proxyAddress, contract) => {
    const implementation = await contract.new();
    const proxy = await OwnedUpgradeabilityProxy.at(proxyAddress);
    await proxy.upgradeTo(implementation.address);
  };

  const transferProxyOwnership = async (proxyAddress, newOwner) => {
    const proxy = await OwnedUpgradeabilityProxy.at(proxyAddress);
    await proxy.transferProxyOwnership(newOwner);
  };

  const uniswapTruffleContract = (contractName, repo = 'core') => {
    const TruffleContract = require('@truffle/contract');
    const jsonPath = `@uniswap/v2-${repo}/build/${contractName}.json`;
    const contract = TruffleContract(require(jsonPath));
    contract.setProvider(web3.currentProvider);
    return contract;
  };

  const deployUniswap = async () => {

    const UNISWAP_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
    const UNISWAP_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
    const UNISWAP_DEPLOYER = '0x9c33eacc2f50e39940d3afaf2c7b8246b681a374';
    const UNISWAP_OWNER = '0xc0a4272bb5df52134178df25d77561cfb17ce407';

    const weth = await WETH9.new();

    await impersonateAccount(UNISWAP_DEPLOYER);
    await web3.eth.sendTransaction({ from: owner, to: UNISWAP_DEPLOYER, value: ether('1') });

    // Deploying using truffle contract to have the correct addresses:
    const TruffleUniswapV2Factory = uniswapTruffleContract('UniswapV2Factory');
    const TruffleUniswapV2Router = uniswapTruffleContract('UniswapV2Router02', 'periphery');

    // 1. deploy factory
    const _factory = await TruffleUniswapV2Factory.new(UNISWAP_OWNER, { from: UNISWAP_DEPLOYER });

    // 2. consume 2 nonces
    await web3.eth.sendTransaction({ from: UNISWAP_DEPLOYER, to: ZERO_ADDRESS });
    await web3.eth.sendTransaction({ from: UNISWAP_DEPLOYER, to: ZERO_ADDRESS });

    // 3. deploy router
    const _router = await TruffleUniswapV2Router.new(_factory.address, weth.address, { from: UNISWAP_DEPLOYER });

    // check that we landed at the correct address
    assert.strictEqual(_factory.address, UNISWAP_FACTORY);
    assert.strictEqual(_router.address, UNISWAP_ROUTER);

    const factory = await UniswapV2Factory.at(_factory.address);
    const router = await UniswapV2Router02.at(_router.address);

    return { router, factory, weth };
  };

  const [owner] = accounts;

  // deploy external contracts
  const { router, factory, weth } = await deployUniswap();

  const dai = await ERC20BlacklistableMock.new();
  await dai.mint(ether('10000000'));
  const chainlinkDAI = await P1MockChainlinkAggregator.new();
  const priceFeedOracle = await PriceFeedOracle.new([dai.address], [chainlinkDAI.address], dai.address);

  // proxy contracts
  const master = await deployProxy(DisposableNXMaster);
  const mr = await deployProxy(DisposableMemberRoles);
  const tc = await deployProxy(DisposableTokenController);
  const ps = await deployProxy(DisposablePooledStaking);
  const pc = await deployProxy(DisposableProposalCategory);
  const gv = await deployProxy(DisposableGovernance);
  const cover = await deployProxy(Cover);

  // non-proxy contracts and libraries
  const cp = await ClaimProofs.new(master.address);
  const twapOracle = await TwapOracle.new(factory.address);
  const swapAgent = await SwapAgent.new();

  // link pool to swap agent library
  Pool.link(swapAgent);

  // regular contracts
  const cl = await Claims.new();
  const cd = await ClaimsData.new();
  const cr = await ClaimsReward.new(master.address, dai.address);

  const mc = await MCR.new(ZERO_ADDRESS);
  const pd = await PoolData.new(owner, ZERO_ADDRESS, dai.address);
  const p1 = await Pool.new(
    [dai.address], // assets
    [0], // min amounts
    [ether('100')], // max amounts
    [ether('0.01')], // max slippage 1%
    master.address,
    priceFeedOracle.address,
    twapOracle.address,
    owner,
  );

  const tk = await NXMToken.new(owner, INITIAL_SUPPLY);
  const td = await TokenData.new(owner);
  const tf = await TokenFunctions.new();
  const qt = await Quotation.new();
  const qd = await QuotationData.new(QE, owner);

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

  const codes = ['QD', 'TD', 'CD', 'PD', 'QT', 'TF', 'TC', 'CL', 'CR', 'P1', 'MC', 'GV', 'PC', 'MR', 'PS', 'CO'];
  const addresses = [qd, td, cd, pd, qt, tf, tc, cl, cr, p1, mc, { address: owner }, pc, mr, ps, cover].map(c => c.address);

  await master.initialize(
    owner,
    tk.address,
    28 * 24 * 3600, // emergency pause time 28 days
    codes.map(hex), // codes
    codes.map(contractType), // types
    addresses, // addresses
  );

  await tc.initialize(
    master.address,
    tk.address,
    ps.address,
    30 * 24 * 3600, // minCALockTime
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
    ether('20'), // min stake
    ether('20'), // min unstake
    10, // max exposure
    90 * 24 * 3600, // unstake lock time
  );

  await cover.initialize(
    master.address,
    dai.address,
  );

  await pd.changeMasterAddress(master.address);
  await pd.updateUintParameters(hex('MCRMIN'), new BN('50')); // minimum capital in eth
  await pd.updateUintParameters(hex('MCRSHOCK'), 50); // mcr shock parameter
  await pd.updateUintParameters(hex('MCRCAPL'), 20); // capacityLimit 10: seemingly unused parameter

  await cd.changeMasterAddress(master.address);
  await cd.updateUintParameters(hex('CAMINVT'), 36); // min voting time 36h
  await cd.updateUintParameters(hex('CAMAXVT'), 72); // max voting time 72h
  await cd.updateUintParameters(hex('CADEPT'), 7); // claim deposit time 7 days
  await cd.updateUintParameters(hex('CAPAUSET'), 3); // claim assessment pause time 3 days

  await td.changeMasterAddress(master.address);
  await td.updateUintParameters(hex('RACOMM'), 50); // staker commission percentage 50%
  await td.updateUintParameters(hex('CABOOKT'), 6); // "book time" 6h
  await td.updateUintParameters(hex('CALOCKT'), 7); // ca lock 7 days
  await td.updateUintParameters(hex('MVLOCKT'), 2); // ca lock mv 2 days

  await gv.changeMasterAddress(master.address);
  await master.switchGovernanceAddress(gv.address);

  // trigger changeDependentContractAddress() on all contracts
  await master.changeAllAddress();

  await upgradeProxy(mr.address, MemberRoles);
  await upgradeProxy(tc.address, TokenController);
  await upgradeProxy(ps.address, PooledStaking);
  await upgradeProxy(pc.address, ProposalCategory);
  await upgradeProxy(master.address, NXMaster);
  await upgradeProxy(gv.address, Governance);

  await transferProxyOwnership(mr.address, master.address);
  await transferProxyOwnership(tc.address, master.address);
  await transferProxyOwnership(ps.address, master.address);
  await transferProxyOwnership(pc.address, master.address);
  await transferProxyOwnership(gv.address, master.address);
  await transferProxyOwnership(master.address, gv.address);

  const POOL_ETHER = ether('90000');
  const POOL_DAI = ether('2000000');

  // fund pools
  await p1.sendEther({ from: owner, value: POOL_ETHER });
  await dai.transfer(p1.address, POOL_DAI);

  const ethEthRate = 100;
  const ethToDaiRate = 20000;

  const daiToEthRate = new BN(10).pow(new BN(36)).div(ether((ethToDaiRate / 100).toString()));
  await chainlinkDAI.setLatestAnswer(daiToEthRate);

  const poolValueInEth = await p1.getPoolValueInEth();
  const mcrEth = ether('50000');
  const mcrRatio = calculateMCRRatio(poolValueInEth, mcrEth);

  await mc.addMCRData(
    mcrRatio,
    mcrEth,
    poolValueInEth, // vFull = 90000 ETH + 2M DAI = 90000 ETH + 10000 ETH = 100000 ETH
    [hex('ETH'), hex('DAI')],
    [ethEthRate, ethToDaiRate], // rates: 1.00 eth/eth, 200.00 dai/eth
    20190103,
  );

  const external = { chainlinkDAI, dai, factory, router, weth };
  const nonUpgradable = { cp, qd, td, cd, pd };
  const instances = { tk, qt, tf, cl, cr, p1, mcr: mc };

  // we upgraded them, get non-disposable instances because
  const proxies = {
    master: await NXMaster.at(master.address),
    tc: await TokenController.at(tc.address),
    gv: await Governance.at(gv.address),
    pc: await ProposalCategory.at(pc.address),
    mr: await MemberRoles.at(mr.address),
    ps: await PooledStaking.at(ps.address),
    cover,
  };

  this.contracts = {
    ...external,
    ...nonUpgradable,
    ...instances,
    ...proxies,
  };
  this.rates = {
    daiToEthRate,
    ethEthRate,
    ethToDaiRate,
  };
}

module.exports = setup;
