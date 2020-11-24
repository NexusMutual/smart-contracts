const { accounts, artifacts, web3 } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;
const { BN } = web3.utils;
const { calculateMCRRatio } = require('../utils').tokenPrice;

// external
const ERC20Mock = artifacts.require('ERC20Mock');
const DSValue = artifacts.require('NXMDSValueMock');
const ExchangeFactoryMock = artifacts.require('ExchangeFactoryMock');
const ExchangeMock = artifacts.require('ExchangeMock');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const P1MockChainlinkAggregator = artifacts.require('P1MockChainlinkAggregator');

// nexusmutual
const NXMToken = artifacts.require('NXMToken');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const MCR = artifacts.require('MCR');
const TokenData = artifacts.require('TokenData');
const TokenFunctions = artifacts.require('TokenFunctions');
const Pool1 = artifacts.require('Pool1');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolData');
const Quotation = artifacts.require('Quotation');
const QuotationData = artifacts.require('QuotationData');
const ClaimProofs = artifacts.require('ClaimProofs');
const PriceFeedOracle = artifacts.require('PriceFeedOracle');

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

const QE = '0x51042c4d8936a7764d18370a6a0762b860bb8e07';
const INITIAL_SUPPLY = ether('1500000');
const EXCHANGE_TOKEN = ether('10000');
const EXCHANGE_ETHER = ether('10');

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

async function setup () {

  const [owner] = accounts;

  // deploy external contracts
  const dai = await ERC20Mock.new();
  const dsv = await DSValue.new(owner);
  const factory = await ExchangeFactoryMock.new();
  const exchange = await ExchangeMock.new(dai.address, factory.address);

  // initialize external contracts
  await dai.mint(ether('10000000'));
  await factory.setFactory(dai.address, exchange.address);
  await dai.transfer(exchange.address, EXCHANGE_TOKEN);
  await exchange.recieveEther({ value: EXCHANGE_ETHER });

  const chainlinkDAI = await P1MockChainlinkAggregator.new();
  const priceFeedOracle = await PriceFeedOracle.new([dai.address], [chainlinkDAI.address], dai.address);

  // regular contracts
  const cl = await Claims.new();
  const cd = await ClaimsData.new();
  const cr = await ClaimsReward.new();

  const mc = await MCR.new();
  const p1 = await Pool1.new(priceFeedOracle.address);
  const p2 = await Pool2.new(factory.address);
  const pd = await PoolData.new(owner, dsv.address, dai.address);

  const tk = await NXMToken.new(owner, INITIAL_SUPPLY);
  const td = await TokenData.new(owner);
  const tf = await TokenFunctions.new();

  const qt = await Quotation.new();
  const qd = await QuotationData.new(QE, owner);

  // proxy contracts
  const master = await deployProxy(DisposableNXMaster);
  const mr = await deployProxy(DisposableMemberRoles);
  const tc = await deployProxy(DisposableTokenController);
  const ps = await deployProxy(DisposablePooledStaking);
  const pc = await deployProxy(DisposableProposalCategory);
  const gv = await deployProxy(DisposableGovernance);

  // non-upgradable contracts
  const cp = await ClaimProofs.new(master.address);

  const contractType = code => {

    const upgradable = ['CL', 'CR', 'MC', 'P1', 'P2', 'QT', 'TF'];
    const proxies = ['GV', 'MR', 'PC', 'PS', 'TC'];

    if (upgradable.includes(code)) {
      return 2;
    }

    if (proxies.includes(code)) {
      return 1;
    }

    return 0;
  };

  const codes = ['QD', 'TD', 'CD', 'PD', 'QT', 'TF', 'TC', 'CL', 'CR', 'P1', 'P2', 'MC', 'GV', 'PC', 'MR', 'PS'];
  const addresses = [qd, td, cd, pd, qt, tf, tc, cl, cr, p1, p2, mc, { address: owner }, pc, mr, ps].map(c => c.address);

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
  await p1.sendEther({ from: owner, value: POOL_ETHER.divn(2) });
  await p2.sendEther({ from: owner, value: POOL_ETHER.divn(2) });
  await dai.transfer(p2.address, POOL_DAI);

  const ethEthRate = 100;
  const ethToDaiRate = 20000;

  const daiToEthRate = new BN(10).pow(new BN(36)).div(ether((ethToDaiRate / 100).toString()));
  await chainlinkDAI.setLatestAnswer(daiToEthRate);

  const poolValueInEth = await p1.getPoolValueInEth();
  const mcrEth = ether('50000');
  const mcrRatio = calculateMCRRatio(poolValueInEth, mcrEth);
  // add mcr
  await mc.addMCRData(
    mcrRatio,
    mcrEth,
    poolValueInEth, // vFull = 90000 ETH + 2M DAI = 90000 ETH + 10000 ETH = 100000 ETH
    [hex('ETH'), hex('DAI')],
    [ethEthRate, ethToDaiRate], // rates: 1.00 eth/eth, 200.00 dai/eth
    20190103,
  );

  await p2.saveIADetails(
    [hex('ETH'), hex('DAI')],
    [100, 20000],
    20190103,
    true,
  );

  const external = { dai, dsv, factory, exchange, chainlinkDAI };
  const nonUpgradable = { cp, qd, td, cd, pd };
  const instances = { tk, qt, tf, cl, cr, p1, p2, mcr: mc };
  const proxies = { tc, gv, pc, mr, ps };

  this.contracts = {
    master,
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
