const fetch = require('node-fetch');
const { artifacts, web3, network: { provider } } = require('hardhat');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');

const { submitGovernanceProposal } = require('./utils');
const { filterArgsKeys } = require('../../lib/helpers');
const { hex, bnEqual } = require('../utils').helpers;
const { ProposalCategory } = require('../utils').constants;

const toBN = s => new web3.utils.BN(s);

const VERSION_DATA = 'https://api.nexusmutual.io/version-data/data.json';

const ClaimsReward = artifacts.require('ClaimsReward');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const TokenController = artifacts.require('TokenController');
const Quotation = artifacts.require('Quotation');
const QuotationData = artifacts.require('QuotationData');
const Pool = artifacts.require('Pool');
const PooledStaking = artifacts.require('PooledStaking');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const TokenFunctions = artifacts.require('TokenFunctions');
const Gateway = artifacts.require('Gateway');

const ERC20 = artifacts.require('ERC20Mock');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');

const Address = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  NXMHOLDER: '0xd7cba5b9a0240770cfd9671961dae064136fa240',
};

const getAddressByCodeFactory = abis => code => abis.find(abi => abi.code === code).address;
const unlock = async account => provider.request({ method: 'hardhat_impersonateAccount', params: [account] });

const moneymoney = '0x' + ether('1000000').toString(16);
const fund = async to => provider.request({ method: 'hardhat_setBalance', params: [to, moneymoney] });

describe('deploy cover interface and locking fixes', function () {

  this.timeout(0);
  this.bail(true);

  it('initializes contracts', async function () {

    const { mainnet: { abis } } = await fetch(VERSION_DATA).then(r => r.json());
    const getAddressByCode = getAddressByCodeFactory(abis);

    this.tcProxyAddress = getAddressByCode('TC');

    this.token = await NXMToken.at(getAddressByCode('NXMTOKEN'));
    this.memberRoles = await MemberRoles.at(getAddressByCode('MR'));
    this.master = await NXMaster.at(getAddressByCode(('NXMASTER')));
    this.governance = await Governance.at(getAddressByCode('GV'));
    this.quotation = await Quotation.at(getAddressByCode('QT'));
    this.claimsData = await ClaimsData.at(getAddressByCode('CD'));
    this.quotationData = await QuotationData.at(getAddressByCode('QD'));
    this.tokenController = await TokenController.at(this.tcProxyAddress);
    this.pool = await Pool.at(getAddressByCode('P1'));
    this.pooledStaking = await PooledStaking.at(getAddressByCode('PS'));
    this.dai = await ERC20.at(Address.DAI);
  });

  it('funds accounts', async function () {

    console.log('Funding accounts');

    const AB_ROLE = '1';
    const { memberArray: boardMembers } = await this.memberRoles.members(AB_ROLE);
    const voters = boardMembers.slice(0, 5);

    for (const member of voters) {
      await unlock(member);
      await fund(member);
    }

    const [voter] = voters;
    console.log('voter: ', voter);
    await this.tokenController.extendClaimAssessmentLock(30 * 24 * 3600, { from: voter });

    this.voters = voters;
  });

  it('upgrades contracts', async function () {
    const { governance, voters } = this;
    console.log('Deploying contracts');

    const newCR = await ClaimsReward.new(this.master.address, Address.DAI);
    const newCL = await Claims.new();
    const newQT = await Quotation.new();
    const newTC = await TokenController.new();

    console.log('Upgrading contracts');

    const upgradesActionDataProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['CR', 'CL', 'QT', 'TC'].map(hex),
        [newCR, newCL, newQT, newTC].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy, // == 29 upgradeMultipleContracts
      upgradesActionDataProxy,
      voters,
      governance,
    );

    const tcProxy = await OwnedUpgradeabilityProxy.at(this.tcProxyAddress);
    const tcImplementation = await tcProxy.implementation();
    assert.equal(newTC.address, tcImplementation);

    this.claims = newCL;
    this.claimsReward = newCR;
    this.quotation = newQT;
    this.tokenController = await TokenController.at(this.tcProxyAddress);

    console.log('Proxy Upgrade successful.');
  });

  it('submits partial claim for cover 7160', async function () {
    const { claims, quotationData, tokenController } = this;

    const coverId = 7160; // FTX
    const coverAmount = await quotationData.getCoverSumAssured(coverId);
    const coverOwner = await quotationData.getCoverMemberAddress(coverId);
    const claimAmount = coverAmount.muln(3).divn(4);

    console.log('Cover ID:', coverId);
    console.log('Cover owner:', coverOwner);
    console.log('Cover amount:', coverAmount.toString());
    console.log('Claim amount:', claimAmount.toString());

    {
      const coverInfo = await tokenController.coverInfo(coverId);
      bnEqual(coverInfo.claimCount, 1);
      assert(!coverInfo.hasOpenClaim);
      assert(!coverInfo.hasAcceptedClaim);
      bnEqual(coverInfo.requestedPayoutAmount, 0);
    }

    await unlock(coverOwner);
    await fund(coverOwner);

    await claims.submitPartialClaim(coverId, claimAmount, { from: coverOwner });

    {
      const coverInfo = await tokenController.coverInfo(coverId);
      bnEqual(coverInfo.claimCount, 2);
      assert(coverInfo.hasOpenClaim);
      assert(!coverInfo.hasAcceptedClaim);
      bnEqual(coverInfo.requestedPayoutAmount, claimAmount);
    }
  });

  it('accept claim for cover 7160', async function () {
    const { claims, claimsReward, claimsData, quotationData, tokenController, pool } = this;

    const coverId = 7160; // FTX
    const claimId = (await claimsData.actualClaimLength()) - 1;

    await claims.submitCAVote(claimId, 1, { from: this.voters[0] });

    // fast forward 72h
    await time.increase(72 * 3600);

    const coverAmount = await quotationData.getCoverSumAssured(coverId);
    const coverOwner = await quotationData.getCoverMemberAddress(coverId);
    const claimAmount = coverAmount.divn(4).muln(3);
    const payoutAmount = ether(claimAmount.toString());

    const coverOwnerBalanceBefore = toBN(await web3.eth.getBalance(coverOwner));
    const poolBalanceBefore = toBN(await web3.eth.getBalance(pool.address));

    const receipt = await claimsReward.closeClaim(claimId);
    receipt.logs.forEach(log => {
      console.log(log.event, filterArgsKeys(log.args));
    });

    const coverOwnerBalanceAfter = toBN(await web3.eth.getBalance(coverOwner));
    const poolBalanceAfter = toBN(await web3.eth.getBalance(pool.address));

    console.log('Cover owner ETH balance before:', coverOwnerBalanceBefore.toString() / 1e18);
    console.log('Cover owner ETH balance after:', coverOwnerBalanceAfter.toString() / 1e18);

    console.log('Pool ETH balance before:', poolBalanceBefore.toString() / 1e18);
    console.log('Pool ETH balance after:', poolBalanceAfter.toString() / 1e18);

    bnEqual(coverOwnerBalanceAfter.sub(coverOwnerBalanceBefore), payoutAmount);
    bnEqual(poolBalanceBefore.sub(poolBalanceAfter), payoutAmount);

    {
      const coverInfo = await tokenController.coverInfo(coverId);
      bnEqual(coverInfo.claimCount, 2);
      assert(!coverInfo.hasOpenClaim);
      assert(coverInfo.hasAcceptedClaim);
      bnEqual(coverInfo.requestedPayoutAmount, claimAmount);
    }

    await expectRevert(
      claims.submitPartialClaim(coverId, claimAmount, { from: coverOwner }),
      'TokenController: Max claim count exceeded',
    );

    await expectRevert(
      claims.submitClaim(coverId, { from: coverOwner }),
      'TokenController: Max claim count exceeded',
    );
  });

  it('processes pending actions', async function () {
    const { pooledStaking } = this;
    while (await pooledStaking.hasPendingActions()) {
      await pooledStaking.processPendingActions(100);
    }
  });

  it('submits full claim for cover 7907', async function () {
    const { claims, quotationData, tokenController } = this;

    const coverId = 7907; // FTX
    const coverAmount = await quotationData.getCoverSumAssured(coverId);
    const coverOwner = await quotationData.getCoverMemberAddress(coverId);
    const claimAmount = coverAmount;

    console.log('Cover ID:', coverId);
    console.log('Cover owner:', coverOwner);
    console.log('Cover amount:', coverAmount.toString());
    console.log('Claim amount:', claimAmount.toString());

    {
      const coverInfo = await tokenController.coverInfo(coverId);
      bnEqual(coverInfo.claimCount, 0);
      assert(!coverInfo.hasOpenClaim);
      assert(!coverInfo.hasAcceptedClaim);
      bnEqual(coverInfo.requestedPayoutAmount, 0);
    }

    await unlock(coverOwner);
    await fund(coverOwner);

    await claims.submitClaim(coverId, { from: coverOwner });

    {
      const coverInfo = await tokenController.coverInfo(coverId);
      bnEqual(coverInfo.claimCount, 1);
      assert(coverInfo.hasOpenClaim);
      assert(!coverInfo.hasAcceptedClaim);
      bnEqual(coverInfo.requestedPayoutAmount, 0);
    }
  });

  it('accept claim for cover 7907', async function () {
    const { claims, claimsReward, claimsData, dai, quotationData, tokenController, pool } = this;

    const coverId = 7907; // FTX
    const claimId = (await claimsData.actualClaimLength()) - 1;

    await claims.submitCAVote(claimId, 1, { from: this.voters[0] });

    // fast forward 72h
    await time.increase(72 * 3600);

    const coverAmount = await quotationData.getCoverSumAssured(coverId);
    const coverOwner = await quotationData.getCoverMemberAddress(coverId);
    const claimAmount = coverAmount;
    const payoutAmount = ether(claimAmount.toString());

    // eth
    const coverOwnerETHBalanceBefore = toBN(await web3.eth.getBalance(coverOwner));
    const poolETHBalanceBefore = toBN(await web3.eth.getBalance(pool.address));

    // dai
    const coverOwnerDAIBalanceBefore = await dai.balanceOf(coverOwner);
    const poolDAIBalanceBefore = await dai.balanceOf(pool.address);

    const receipt = await claimsReward.closeClaim(claimId);
    receipt.logs.forEach(log => {
      console.log(log.event, filterArgsKeys(log.args));
    });

    // eth
    const coverOwnerETHBalanceAfter = toBN(await web3.eth.getBalance(coverOwner));
    const poolETHBalanceAfter = toBN(await web3.eth.getBalance(pool.address));

    // dai
    const coverOwnerDAIBalanceAfter = await dai.balanceOf(coverOwner);
    const poolDAIBalanceAfter = await dai.balanceOf(pool.address);

    console.log('Cover owner ETH balance before:', coverOwnerETHBalanceBefore.toString() / 1e18);
    console.log('Cover owner ETH balance after:', coverOwnerETHBalanceAfter.toString() / 1e18);

    console.log('Pool ETH balance before:', poolETHBalanceBefore.toString() / 1e18);
    console.log('Pool ETH balance after:', poolETHBalanceAfter.toString() / 1e18);


    console.log('Cover owner DAI balance before:', coverOwnerDAIBalanceBefore.toString() / 1e18);
    console.log('Cover owner DAI balance after:', coverOwnerDAIBalanceAfter.toString() / 1e18);

    console.log('Pool DAI balance before:', poolDAIBalanceBefore.toString() / 1e18);
    console.log('Pool DAI balance after:', poolDAIBalanceAfter.toString() / 1e18);

    bnEqual(coverOwnerDAIBalanceAfter.sub(coverOwnerDAIBalanceBefore), payoutAmount);
    bnEqual(poolDAIBalanceBefore.sub(poolDAIBalanceAfter), payoutAmount);

    {
      const coverInfo = await tokenController.coverInfo(coverId);
      bnEqual(coverInfo.claimCount, 1);
      assert(!coverInfo.hasOpenClaim);
      assert(coverInfo.hasAcceptedClaim);
      bnEqual(coverInfo.requestedPayoutAmount, 0);
    }

    await expectRevert(
      claims.submitPartialClaim(coverId, claimAmount, { from: coverOwner }),
      'TokenController: Cover already has accepted claims',
    );

    await expectRevert(
      claims.submitClaim(coverId, { from: coverOwner }),
      'TokenController: Cover already has accepted claims',
    );
  });

  it('processes pending actions', async function () {
    const { pooledStaking } = this;
    while (await pooledStaking.hasPendingActions()) {
      await pooledStaking.processPendingActions(100);
    }
  });

  it('performs hypothetical future proxy upgrade', async function () {

    const { voters, governance, master } = this;

    const gatewayImplementation = await Gateway.new();
    const upgradesActionDataProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['GW'].map(hex),
        [gatewayImplementation].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy, // == 29 upgradeMultipleContracts
      upgradesActionDataProxy,
      voters,
      governance,
    );

    const gwProxy = await OwnedUpgradeabilityProxy.at(await master.getLatestAddress(hex('GW')));
    const gwImplementation = await gwProxy.implementation();

    assert.equal(gwImplementation, gatewayImplementation.address);
  });

  it('performs hypothetical future non-proxy upgrade', async function () {

    const { voters, governance, master } = this;

    const tokenFunctionsImplementation = await TokenFunctions.new();
    const upgradesActionDataNonProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['TF'].map(hex),
        [tokenFunctionsImplementation].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy,
      upgradesActionDataNonProxy,
      voters,
      governance,
    );

    const tfStoredAddress = await master.getLatestAddress(hex('TF'));

    assert.equal(tfStoredAddress, tokenFunctionsImplementation.address);
  });

  it('performs hypothetical future master upgrade', async function () {

    const { voters, governance, master } = this;

    const masterProxy = await OwnedUpgradeabilityProxy.at(master.address);

    // upgrade to new master
    const masterImplementation = await NXMaster.new();

    // vote and upgrade
    const upgradeMaster = web3.eth.abi.encodeParameters(['address'], [masterImplementation.address]);
    await submitGovernanceProposal(ProposalCategory.upgradeMaster, upgradeMaster, voters, governance);

    // check implementation
    const actualMasterImplementation = await masterProxy.implementation();
    assert.strictEqual(actualMasterImplementation, masterImplementation.address);
  });
});
