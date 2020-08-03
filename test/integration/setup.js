const { contract, defaultSender, accounts } = require('@openzeppelin/test-environment');
const { BN, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { hex, to, tenderly } = require('./utils').helpers;

// external
const DAI = contract.fromArtifact('MockDAI');
const DSValue = contract.fromArtifact('NXMDSValueMock');
const ExchangeFactoryMock = contract.fromArtifact('ExchangeFactoryMock');
const ExchangeMock = contract.fromArtifact('ExchangeMock');
const OwnedUpgradeabilityProxy = contract.fromArtifact('OwnedUpgradeabilityProxy');

// nexusmutual
const NXMToken = contract.fromArtifact('NXMToken');
const Claims = contract.fromArtifact('Claims');
const ClaimsData = contract.fromArtifact('ClaimsData');
const ClaimsReward = contract.fromArtifact('ClaimsReward');
const MCR = contract.fromArtifact('MCR');
const TokenData = contract.fromArtifact('TokenData');
const TokenFunctions = contract.fromArtifact('TokenFunctions');
const Pool1 = contract.fromArtifact('Pool1');
const Pool2 = contract.fromArtifact('Pool2');
const PoolData = contract.fromArtifact('PoolData');
const Quotation = contract.fromArtifact('Quotation');
const QuotationData = contract.fromArtifact('QuotationData');
const Governance = contract.fromArtifact('Governance');

// temporary contracts used for initialization
const DisposableNXMaster = contract.fromArtifact('DisposableNXMaster');
const DisposableMemberRoles = contract.fromArtifact('DisposableMemberRoles');
const DisposableTokenController = contract.fromArtifact('DisposableTokenController');
const DisposableProposalCategory = contract.fromArtifact('DisposableProposalCategory');
const DisposablePooledStaking = contract.fromArtifact('DisposablePooledStaking');

// target contracts
const NXMaster = contract.fromArtifact('NXMaster');
const MemberRoles = contract.fromArtifact('MemberRoles');
const TokenController = contract.fromArtifact('TokenController');
const ProposalCategory = contract.fromArtifact('ProposalCategory');
const PooledStaking = contract.fromArtifact('PooledStaking');

const QE = '0x51042c4d8936a7764d18370a6a0762b860bb8e07';
const INITIAL_SUPPLY = ether('1500000');
const EXCHANGE_TOKEN = ether('10000');
const EXCHANGE_ETHER = ether('10');
const POOL_ETHER = ether('3500');
const POOL_DAI = ether('900000');

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

  const owner = defaultSender;

  // deploy external contracts
  const dai = await DAI.new();
  const dsv = await DSValue.new(owner);
  const factory = await ExchangeFactoryMock.new();
  const exchange = await ExchangeMock.new(dai.address, factory.address);

  // initialize external contracts
  await factory.setFactory(dai.address, exchange.address);
  await dai.transfer(exchange.address, EXCHANGE_TOKEN);
  await exchange.recieveEther({ value: EXCHANGE_ETHER });

  // regular contracts
  const cl = await Claims.new();
  const cd = await ClaimsData.new();
  const cr = await ClaimsReward.new();

  const mc = await MCR.new();
  const p1 = await Pool1.new();
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
  const gv = await deployProxy(Governance);

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

  await pd.changeMasterAddress(master.address);
  await pd.updateUintParameters(hex('MCRMIN'), ether('12000')); // minimum capital in eth
  await pd.updateUintParameters(hex('MCRSHOCK'), 50); // mcr shock parameter
  await pd.updateUintParameters(hex('MCRCAPL'), 10); // capacityLimit 10 (% ?)

  await cd.changeMasterAddress(master.address);
  await cd.updateUintParameters(hex('CAMAXVT'), 1); // max voting time 1h
  await cd.updateUintParameters(hex('CAMINVT'), 1); // min voting time 1h
  await cd.updateUintParameters(hex('CADEPT'), 1); // claim deposit time 1 day
  await cd.updateUintParameters(hex('CAPAUSET'), 1); // claim assessment pause time 1 day

  await td.changeMasterAddress(master.address);
  await td.updateUintParameters(hex('RACOMM'), 50); // staker commission percentage 50%
  await td.updateUintParameters(hex('CABOOKT'), 1); // "book time" 1h
  await td.updateUintParameters(hex('CALOCKT'), 1); // ca lock 1 day
  await td.updateUintParameters(hex('MVLOCKT'), 1); // ca lock mv 1 day

  await gv.changeMasterAddress(master.address);
  await gv.updateUintParameters(hex('GOVHOLD'), 1); // token holding time 1 day
  await gv.updateUintParameters(hex('ACWT'), 1); // action waiting time 1h

  await master.switchGovernanceAddress(gv.address);

  // trigger changeDependentContractAddress() on all contracts
  await master.changeAllAddress();

  await upgradeProxy(mr.address, MemberRoles);
  await upgradeProxy(tc.address, TokenController);
  await upgradeProxy(ps.address, PooledStaking);
  await upgradeProxy(pc.address, ProposalCategory);
  await upgradeProxy(master.address, NXMaster);

  await transferProxyOwnership(mr.address, master.address);
  await transferProxyOwnership(tc.address, master.address);
  await transferProxyOwnership(ps.address, master.address);
  await transferProxyOwnership(pc.address, master.address);
  await transferProxyOwnership(gv.address, master.address);
  await transferProxyOwnership(master.address, gv.address);

  // fund pools
  await p1.sendEther({ from: owner, value: POOL_ETHER });
  await p2.sendEther({ from: owner, value: POOL_ETHER });
  await dai.transfer(p2.address, POOL_DAI);

  // add mcr
  await mc.addMCRData(
    13000,
    ether('1000'),
    ether('70000'),
    [hex('ETH'), hex('DAI')],
    [100, 15517],
    20190103,
  );

  await p2.saveIADetails(
    [hex('ETH'), hex('DAI')],
    [100, 15517],
    20190103,
    true,
  );

  const external = { dai, dsv, factory, exchange };
  const instances = { tk, qd, td, cd, pd, qt, tf, cl, cr, p1, p2, mcr: mc };
  const proxies = { tc, gv, pc, mr, ps };

  Object.assign(this, {
    master,
    ...external,
    ...instances,
    ...proxies,
  });
}

module.exports = setup;
