const { contract, defaultSender } = require('@openzeppelin/test-environment');
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
const NXMaster = contract.fromArtifact('NXMaster');
const Claims = contract.fromArtifact('Claims');
const ClaimsData = contract.fromArtifact('ClaimsData');
const ClaimsReward = contract.fromArtifact('ClaimsReward');
const MCR = contract.fromArtifact('MCR');
const TokenData = contract.fromArtifact('TokenData');
const TokenFunctions = contract.fromArtifact('TokenFunctions');
const TokenController = contract.fromArtifact('TokenController');
const Pool1 = contract.fromArtifact('Pool1');
const Pool2 = contract.fromArtifact('Pool2');
const PoolData = contract.fromArtifact('PoolDataMock');
const Quotation = contract.fromArtifact('Quotation');
const QuotationData = contract.fromArtifact('QuotationData');
const Governance = contract.fromArtifact('GovernanceMock');
const ProposalCategory = contract.fromArtifact('ProposalCategoryMock');
const MemberRoles = contract.fromArtifact('MemberRoles');
const PooledStaking = contract.fromArtifact('PooledStaking');

// temporary contracts used for initialization
const DisposableNXMaster = contract.fromArtifact('DisposableNXMaster');
const DisposableMemberRoles = contract.fromArtifact('DisposableMemberRoles');
const DisposableTokenController = contract.fromArtifact('DisposableTokenController');
const DisposableProposalCategory = contract.fromArtifact('DisposableProposalCategory');
const DisposablePooledStaking = contract.fromArtifact('DisposablePooledStaking');

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

async function setup () {

  try {

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
    const contracts = [qd, td, cd, pd, qt, tf, tc, cl, cr, p1, p2, mc, gv, pc, mr, ps];

    await master.initialize(
      owner,
      tk.address,
      300, // emergency pause time
      codes.map(hex), // codes
      codes.map(contractType), // types
      contracts.map(c => c.address), // addresses
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

    assert(await ps.initialized(), 'Pooled staking contract should have been initialized');
    process.exit();

    // transfer master ownership and init governance
    await masterProxy.transferProxyOwnership(gv.address);

    await gv._initiateGovernance();
    await pc.proposalCategoryInitiate();
    await pc.updateCategoryActionHashes();

    // fund pools
    await p1.sendEther({ from: owner, value: POOL_ETHER });
    await p2.sendEther({ from: owner, value: POOL_ETHER });
    await dai.transfer(p2.address, POOL_DAI);

    // add mcr
    await mcr.addMCRData(
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
    const instances = { tk, qd, td, cd, pd, qt, tf, cl, cr, p1, p2, mcr };
    const proxies = { tc, gv, pc, mr, ps };

    await mr.payJoiningFee(owner, { from: owner, value: ether('0.002') });
    await mr.kycVerdict(owner, true);
    await tk.transfer(owner, new BN(37500));

    Object.assign(this, {
      master,
      ...external,
      ...instances,
      ...proxies,
    });

  } catch (e) {
    e.tx && await tenderly(e.tx);
    throw e;
  }

}

module.exports = setup;
