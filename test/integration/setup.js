const { accounts, artifacts, web3 } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');

const { setupUniswap } = require('../utils');
const { ContractTypes } = require('../utils').constants;
const { hex } = require('../utils').helpers;
const { proposalCategories } = require('../utils');
const { enrollMember } = require('./utils/enroll');

const { BN } = web3.utils;
const { getAccounts } = require('../utils').accounts;
const { members } = getAccounts(accounts);

async function setup () {
  // external
  const ERC20BlacklistableMock = artifacts.require('ERC20BlacklistableMock');
  const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
  const ChainlinkAggregatorMock = artifacts.require('ChainlinkAggregatorMock');
  const Lido = artifacts.require('P1MockLido');
  const ProductsV1 = artifacts.require('ProductsV1');

  // nexusmutual
  const NXMToken = artifacts.require('NXMToken');
  const LegacyClaims = artifacts.require('LegacyClaims');
  const LegacyIncidents = artifacts.require('LegacyIncidents');
  const LegacyClaimsData = artifacts.require('LegacyClaimsData');
  const LegacyClaimsReward = artifacts.require('LegacyClaimsReward');
  const MCR = artifacts.require('DisposableMCR');
  const TokenData = artifacts.require('TokenData');
  const Pool = artifacts.require('Pool');
  const Quotation = artifacts.require('Quotation');
  const QuotationData = artifacts.require('QuotationData');
  const ClaimProofs = artifacts.require('ClaimProofs');
  const PriceFeedOracle = artifacts.require('PriceFeedOracle');
  const TwapOracle = artifacts.require('TwapOracle');
  const SwapOperator = artifacts.require('SwapOperator');
  const CoverNFT = artifacts.require('CoverNFT');
  const Cover = artifacts.require('Cover');

  // temporary contracts used for initialization
  const DisposableNXMaster = artifacts.require('DisposableNXMaster');
  const DisposableMemberRoles = artifacts.require('DisposableMemberRoles');
  const DisposableTokenController = artifacts.require('DisposableTokenController');
  const DisposableProposalCategory = artifacts.require('DisposableProposalCategory');
  const DisposableGovernance = artifacts.require('DisposableGovernance');
  const DisposablePooledStaking = artifacts.require('DisposablePooledStaking');
  const DisposableGateway = artifacts.require('DisposableGateway');
  const DisposableAssessment = artifacts.require('DisposableAssessment');
  const DisposableClaims = artifacts.require('DisposableClaims');
  const DisposableIncidents = artifacts.require('DisposableIncidents');
  const DisposableCover = artifacts.require('DisposableCover');

  // target contracts
  const NXMaster = artifacts.require('NXMaster');
  const MemberRoles = artifacts.require('MemberRoles');
  const TokenController = artifacts.require('TokenController');
  const ProposalCategory = artifacts.require('ProposalCategory');
  const Governance = artifacts.require('Governance');
  const PooledStaking = artifacts.require('PooledStaking');
  const Gateway = artifacts.require('Gateway');
  const Incidents = artifacts.require('Incidents');
  const Claims = artifacts.require('Claims');
  const Assessment = artifacts.require('Assessment');

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const QE = '0x51042c4d8936a7764d18370a6a0762b860bb8e07';
  const INITIAL_SUPPLY = ether('15000000000');

  const deployProxy = async (contract, deployParams = []) => {
    const implementation = await contract.new(...deployParams);
    const proxy = await OwnedUpgradeabilityProxy.new(implementation.address);
    return contract.at(proxy.address);
  };

  const upgradeProxy = async (proxyAddress, contract, params = []) => {
    const implementation = await contract.new(...params);
    const proxy = await OwnedUpgradeabilityProxy.at(proxyAddress);
    await proxy.upgradeTo(implementation.address);
  };

  const transferProxyOwnership = async (proxyAddress, newOwner) => {
    const proxy = await OwnedUpgradeabilityProxy.at(proxyAddress);
    await proxy.transferProxyOwnership(newOwner);
  };

  const [owner, emergencyAdmin] = accounts;

  // deploy external contracts
  const { router, factory, weth } = await setupUniswap();

  const dai = await ERC20BlacklistableMock.new();
  await dai.mint(owner, ether('10000000'));

  const stETH = await ERC20BlacklistableMock.new();
  await stETH.mint(owner, ether('10000000'));

  const chainlinkDAI = await ChainlinkAggregatorMock.new();
  const priceFeedOracle = await PriceFeedOracle.new(chainlinkDAI.address, dai.address, stETH.address);

  const lido = await Lido.new();

  // proxy contracts
  const master = await deployProxy(DisposableNXMaster);
  const mr = await deployProxy(DisposableMemberRoles);
  const ps = await deployProxy(DisposablePooledStaking);
  const pc = await deployProxy(DisposableProposalCategory);
  const gv = await deployProxy(DisposableGovernance);
  const gateway = await deployProxy(DisposableGateway);

  // non-proxy contracts and libraries
  const cp = await ClaimProofs.new(master.address);
  const twapOracle = await TwapOracle.new(factory.address);

  // regular contracts
  // const lcl = await LegacyClaims.new();
  // const lic = await LegacyIncidents.new();
  const lcd = await LegacyClaimsData.new();
  const lcr = await LegacyClaimsReward.new(master.address, dai.address, lcd.address);

  const mc = await MCR.new(ZERO_ADDRESS);

  const p1 = await Pool.new(
    [dai.address], // assets
    [18], // decimals
    [0], // min amounts
    [ether('100')], // max amounts
    [100], // max slippage 1%
    master.address,
    priceFeedOracle.address,
    ZERO_ADDRESS,
  );
  const swapOperator = await SwapOperator.new(master.address, twapOracle.address, owner, lido.address);

  const productsV1 = await ProductsV1.new();

  const tk = await NXMToken.new(owner, INITIAL_SUPPLY);
  const td = await TokenData.new(owner);
  const qd = await QuotationData.new(QE, owner);
  const qt = await Quotation.new(productsV1.address, qd.address);

  const tc = await deployProxy(DisposableTokenController, [qd.address]);
  const ic = await deployProxy(DisposableIncidents, []);
  const as = await deployProxy(DisposableAssessment, []);
  const cl = await deployProxy(DisposableClaims, []);
  const cover = await deployProxy(DisposableCover, []);

  const coverNFT = await CoverNFT.new('Nexus Mutual Cover', 'NXC', cover.address);

  const contractType = code => {
    const upgradable = ['MC', 'P1', 'QT', 'TF', 'CR'];
    const proxies = ['GV', 'MR', 'PC', 'PS', 'TC', 'GW', 'IC', 'CL', 'AS', 'CO'];

    if (upgradable.includes(code)) {
      return ContractTypes.Replaceable;
    }

    if (proxies.includes(code)) {
      return ContractTypes.Proxy;
    }

    return 0;
  };

  const codes = ['QD', 'TD', 'QT', 'TC', 'P1', 'MC', 'GV', 'PC', 'MR', 'PS', 'GW', 'IC', 'CL', 'AS', 'CO', 'CR'];
  const addresses = [qd, td, qt, tc, p1, mc, { address: owner }, pc, mr, ps, gateway, ic, cl, as, cover, lcr].map(
    c => c.address,
  );

  await master.initialize(
    owner,
    tk.address,
    emergencyAdmin,
    codes.map(hex), // codes
    codes.map(contractType), // types
    addresses, // addresses
  );

  await tc.initialize(master.address, tk.address, ps.address, as.address);

  await tc.addToWhitelist(lcr.address);

  await mr.initialize(
    owner,
    master.address,
    tc.address,
    [owner], // initial members
    [ether('10000')], // initial tokens
    [owner], // advisory board members
  );

  await pc.initialize(mr.address);

  for (const category of proposalCategories) {
    await pc.addInitialCategory(...category, { gas: 10e6 });
  }

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

  await as.initialize(master.address);
  await ic.initialize(master.address);
  await cl.initialize(master.address);
  await cover.initialize(coverNFT.address);

  const REDEEM_METHOS = {
    CLAIM: 0,
    INCIDENT: 1,
  };

  await cover.addProductType({
    descriptionIpfsHash: 'protocolCoverIPFSHash',
    redeemMethod: REDEEM_METHOS.CLAIM,
    gracePeriodInDays: 30,
  });
  await cover.addProductType({
    descriptionIpfsHash: 'custodyCoverIPFSHash',
    redeemMethod: REDEEM_METHOS.CLAIM,
    gracePeriodInDays: 90,
  });
  await cover.addProductType({
    descriptionIpfsHash: 'yieldTokenCoverIPFSHash',
    redeemMethod: REDEEM_METHOS.INCIDENT,
    gracePeriodInDays: 14,
  });

  await cover.addProduct({
    productType: 0,
    productAddress: '0x0000000000000000000000000000000000000000',
    coverAssets: 0,
  });
  await cover.addProduct({
    productType: 1,
    productAddress: '0x0000000000000000000000000000000000000000',
    coverAssets: 0,
  });
  await cover.addProduct({
    productType: 2,
    productAddress: '0x0000000000000000000000000000000000000001',
    coverAssets: 2,
  });

  await lcd.changeMasterAddress(master.address);
  await lcd.updateUintParameters(hex('CAMINVT'), 36); // min voting time 36h
  await lcd.updateUintParameters(hex('CAMAXVT'), 72); // max voting time 72h
  await lcd.updateUintParameters(hex('CADEPT'), 7); // claim deposit time 7 days
  await lcd.updateUintParameters(hex('CAPAUSET'), 3); // claim assessment pause time 3 days

  await td.changeMasterAddress(master.address);
  await td.updateUintParameters(hex('RACOMM'), 50); // staker commission percentage 50%
  await td.updateUintParameters(hex('CABOOKT'), 6); // "book time" 6h
  await td.updateUintParameters(hex('CALOCKT'), 7); // ca lock 7 days
  await td.updateUintParameters(hex('MVLOCKT'), 2); // ca lock mv 2 days

  await p1.updateAddressParameters(hex('SWP_OP'), swapOperator.address);

  await gv.changeMasterAddress(master.address);
  await master.switchGovernanceAddress(gv.address);

  await gateway.initialize(master.address, dai.address);

  await upgradeProxy(mr.address, MemberRoles);
  await upgradeProxy(tc.address, TokenController, [qd.address]);
  await upgradeProxy(ps.address, PooledStaking);
  await upgradeProxy(pc.address, ProposalCategory);
  await upgradeProxy(master.address, NXMaster);
  await upgradeProxy(gv.address, Governance);
  await upgradeProxy(gateway.address, Gateway);
  await upgradeProxy(ic.address, Incidents, [master.address, coverNFT.address]);
  await upgradeProxy(cl.address, Claims, [master.address, coverNFT.address]);
  await upgradeProxy(as.address, Assessment, [master.address]);
  await upgradeProxy(cover.address, Cover, [qd.address, productsV1.address]);
  await gateway.changeDependentContractAddress();

  await transferProxyOwnership(mr.address, master.address);
  await transferProxyOwnership(tc.address, master.address);
  await transferProxyOwnership(ps.address, master.address);
  await transferProxyOwnership(pc.address, master.address);
  await transferProxyOwnership(gv.address, master.address);
  await transferProxyOwnership(gateway.address, master.address);
  await transferProxyOwnership(ic.address, master.address);
  await transferProxyOwnership(cl.address, master.address);
  await transferProxyOwnership(as.address, master.address);
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

  const mcrEth = ether('50000');
  const mcrFloor = mcrEth.sub(ether('10000'));

  const latestBlock = await web3.eth.getBlock('latest');
  const lastUpdateTime = latestBlock.timestamp;
  const mcrFloorIncrementThreshold = 13000;
  const maxMCRFloorIncrement = 100;
  const maxMCRIncrement = 500;
  const gearingFactor = 48000;
  const minUpdateTime = 3600;
  const desiredMCR = mcrEth;

  await mc.initialize(
    mcrEth,
    mcrFloor,
    desiredMCR,
    lastUpdateTime,
    mcrFloorIncrementThreshold,
    maxMCRFloorIncrement,
    maxMCRIncrement,
    gearingFactor,
    minUpdateTime,
  );

  const external = { chainlinkDAI, dai, factory, router, weth, productsV1 };
  const nonUpgradable = { cp, qd, td };
  const instances = { tk, qt, cl, p1, mcr: mc };

  // we upgraded them, get non-disposable instances because
  const proxies = {
    master: await NXMaster.at(master.address),
    tc: await TokenController.at(tc.address),
    gv: await Governance.at(gv.address),
    pc: await ProposalCategory.at(pc.address),
    mr: await MemberRoles.at(mr.address),
    ps: await PooledStaking.at(ps.address),
    gateway: await Gateway.at(gateway.address),
    ic: await Incidents.at(ic.address),
    cl: await Claims.at(cl.address),
    as: await Assessment.at(as.address),
  };

  const nonInternal = { priceFeedOracle, swapOperator };

  this.contracts = {
    ...external,
    ...nonUpgradable,
    ...instances,
    ...proxies,
    ...nonInternal,
  };

  this.rates = {
    daiToEthRate,
    ethEthRate,
    ethToDaiRate,
  };

  this.contractType = contractType;

  await enrollMember(this.contracts, members);
}

module.exports = setup;
