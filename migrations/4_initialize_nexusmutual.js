const { toHex, ether } = require('../test/utils/ethTools');
const assert = require('assert');

const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsDataMock');
const ClaimsReward = artifacts.require('ClaimsReward');
const DAI = artifacts.require('MockDAI');
const NXMaster = artifacts.require('NXMasterMock');
const MCR = artifacts.require('MCR');
const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenDataMock');
const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolDataMock');
const Quotation = artifacts.require('Quotation');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const MemberRoles = artifacts.require('MemberRoles');
const GovernanceMock = artifacts.require('GovernanceMock');
const ProposalCategory = artifacts.require('ProposalCategoryMock');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const PooledStaking = artifacts.require('PooledStakingMock');

const POOL_ETHER = ether('3500');
const POOL_ASSET = ether('50');
const JOINING_FEE = ether('2').div(1000); // 0.002

module.exports = function (deployer, network, accounts) {
  deployer.then(async () => {

    const owner = accounts[0];
    const masterImpl = await NXMaster.deployed();
    const proxyMaster = await OwnedUpgradeabilityProxy.new(masterImpl.address);
    const master = await NXMaster.at(proxyMaster.address);

    const tk = await NXMToken.deployed();
    const td = await TokenData.deployed();
    const tf = await TokenFunctions.deployed();
    const p1 = await Pool1.deployed();
    const p2 = await Pool2.deployed();
    const pd = await PoolData.deployed();
    const qt = await Quotation.deployed();
    const qd = await QuotationDataMock.deployed();
    const cl = await Claims.deployed();
    const cr = await ClaimsReward.deployed();
    const cd = await ClaimsData.deployed();
    const mc = await MCR.deployed();
    const dai = await DAI.deployed();

    // deploy proxy implementations
    const gvImpl = await GovernanceMock.deployed();
    const mrImpl = await MemberRoles.deployed();
    const pcImpl = await ProposalCategory.deployed();
    const psImpl = await PooledStaking.deployed();
    const tcImpl = await TokenController.deployed();

    const addresses = [
      qd, td, cd, pd, qt, tf, tcImpl, cl, cr, p1, p2, mc, gvImpl, pcImpl, mrImpl, psImpl,
    ].map(c => c.address);

    // initiate master
    await master.initiateMaster(tk.address);
    await master.addPooledStaking();
    await master.addNewVersion(addresses);

    // fetch proxy contract addresses
    const gvProxyAddress = await master.getLatestAddress(toHex('GV'));
    const gv = await GovernanceMock.at(gvProxyAddress);

    const pcProxyAddress = await master.getLatestAddress(toHex('PC'));
    const pc = await ProposalCategory.at(pcProxyAddress);

    const tcProxyAddress = await master.getLatestAddress(toHex('TC'));
    const tc = await TokenController.at(tcProxyAddress);

    const mrProxyAddress = await master.getLatestAddress(toHex('MR'));
    const mr = await MemberRoles.at(mrProxyAddress);

    const psProxyAddress = await master.getLatestAddress(toHex('PS'));
    const ps = await PooledStaking.at(psProxyAddress);

    await ps.migrateStakers('1');
    assert(await ps.initialized(), 'Pooled staking contract should have been initialized');

    // transfer master ownership and init governance
    await proxyMaster.transferProxyOwnership(gvProxyAddress);
    await gv._initiateGovernance();
    await pc.proposalCategoryInitiate();
    await pc.updateCategoryActionHashes();

    // fund pools
    await p1.sendEther({ from: owner, value: POOL_ETHER });
    await p2.sendEther({ from: owner, value: POOL_ETHER });
    await dai.transfer(p2.address, POOL_ASSET);

    // setup quotation data
    // await qd.changeCurrencyAssetAddress(toHex('DAI'), dai.address);
    // await qd.changeInvestmentAssetAddress(toHex('DAI'), dai.address);

    // add mcr and ia details
    const currencies = [toHex('ETH'), toHex('DAI')];
    await p2.saveIADetails(currencies, [100, 15517], 20190103, true);
    await mc.addMCRData(13000, ether('100'), ether('7000'), currencies, [100, 15517], 20190103);

    await mr.payJoiningFee(owner, { from: owner, value: JOINING_FEE });
    await mr.kycVerdict(owner, true);
    await mr.addInitialABMembers([owner]);
  });
};
