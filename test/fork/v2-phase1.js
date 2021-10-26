const fetch = require('node-fetch');
const { artifacts, web3, accounts, network } = require('hardhat');
const {
  expectRevert,
  constants: { ZERO_ADDRESS },
  ether,
  time,
} = require('@openzeppelin/test-helpers');

const { submitGovernanceProposal, getAddressByCodeFactory, Address, fund, unlock, UserAddress } = require('./utils');
const { hex } = require('../utils').helpers;
const { ProposalCategory, Role, ContractTypes } = require('../utils').constants;

const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const TokenFunctions = artifacts.require('TokenFunctions');
const Quotation = artifacts.require('Quotation');
const TokenController = artifacts.require('TokenController');
const Gateway = artifacts.require('Gateway');
const Incidents = artifacts.require('Incidents');
const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');
const Pool = artifacts.require('Pool');
const MCR = artifacts.require('MCR');
const QuotationData = artifacts.require('QuotationData');
const ClaimsReward = artifacts.require('LegacyClaimsReward');
const ProposalCategoryContract = artifacts.require('ProposalCategory');
const LegacyNXMaster = artifacts.require('ILegacyNXMaster');
const MMockNewContract = artifacts.require('MMockNewContract');
const Claims = artifacts.require('LegacyClaims');

describe('V2 Phase 1', function () {
  this.timeout(0);

  it('initializes contracts', async function () {
    const versionDataURL = 'https://api.nexusmutual.io/version-data/data.json';
    const {
      mainnet: { abis },
    } = await fetch(versionDataURL).then(r => r.json());
    const getAddressByCode = getAddressByCodeFactory(abis);

    const masterAddress = getAddressByCode('NXMASTER');
    const token = await NXMToken.at(getAddressByCode('NXMTOKEN'));
    const memberRoles = await MemberRoles.at(getAddressByCode('MR'));
    const governance = await Governance.at(getAddressByCode('GV'));
    const pool1 = await Pool.at(getAddressByCode('P1'));
    const mcr = await MCR.at(getAddressByCode('MC'));
    const incidents = await Incidents.at(getAddressByCode('IC'));
    const quotationData = await QuotationData.at(getAddressByCode('QD'));
    const proposalCategory = await ProposalCategoryContract.at(getAddressByCode('PC'));
    const claims = await ProposalCategoryContract.at(getAddressByCode('CL'));

    this.masterAddress = masterAddress;
    this.token = token;
    this.memberRoles = memberRoles;
    this.governance = governance;
    this.pool = pool1;
    this.mcr = mcr;
    this.master = await NXMaster.at(masterAddress);
    this.quotationData = quotationData;
    this.incidents = incidents;
    this.getAddressByCode = getAddressByCode;
    this.proposalCategory = proposalCategory;
    this.claims = claims;
  });

  it('fetches board members and funds accounts', async function () {
    const { memberArray: boardMembers } = await this.memberRoles.members('1');
    const voters = boardMembers.slice(0, 3);

    const whales = [UserAddress.NXM_WHALE_1, UserAddress.NXM_WHALE_2];

    for (const member of [...voters, Address.NXMHOLDER, ...whales]) {
      await fund(member);
      await unlock(member);
    }

    this.voters = voters;
    this.whales = whales;
  });

  it('upgrade contracts', async function () {
    assert(false, '[todo]');
  });

  it('getWithdrawableCoverNoteCoverIds only returns v1 covers bought until lastCoverIdWithLockedCN', async function () {
    assert(false, '[todo]');
  });

  it("doesn't allow to withdrawCoverNote more than once", async function () {
    assert(false, '[todo]');
  });

  // [todo] Move function call to QT, buy covers with impersonate account before upgrading QT
  it('allows to withdrawCoverNote for v1 covers bought until lastCoverIdWithLockedCN', async function () {
    const { qd, qt, tc, tk } = this.contracts;

    const cover = { ...coverTemplate };
    const balanceBefore = await tk.balanceOf(member1);

    const now = await time.latest();
    const coverPurchaseTime = now.addn(1);

    const coverPeriod = toBN(cover.period * 24 * 3600);
    const expectedCoverExpirationDate = coverPurchaseTime.add(coverPeriod);

    // [todo] Remove grace period
    const gracePeriod = await tc.claimSubmissionGracePeriod();
    const expectedGracePeriodExpirationDate = expectedCoverExpirationDate.add(gracePeriod);

    await setNextBlockTime(coverPurchaseTime.toNumber());
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });

    const coverId = '1';
    const lockReason = soliditySha3(hex('CN'), member1, coverId);

    const expectedCoverNoteAmount = toBN(cover.priceNXM).divn(10);
    const actualCoverNoteAmount = await tc.tokensLocked(member1, lockReason);
    assert(actualCoverNoteAmount.eq(expectedCoverNoteAmount), 'unexpected cover note amount');

    const gracePeriodExpirationDate = await tc.getLockedTokensValidity(member1, lockReason);
    assert(gracePeriodExpirationDate.eq(expectedGracePeriodExpirationDate), 'unexpected grace period expiration date');

    // should not be able to withdraw while cover is active
    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'Quotation: cannot withdraw before grace period expiration',
    );

    const coverExpirationDate = await qd.getValidityOfCover(coverId);
    assert(expectedCoverExpirationDate.eq(coverExpirationDate), 'unexpected cover expiration date');

    await setNextBlockTime(coverExpirationDate.addn(1).toNumber());
    await mineNextBlock();

    // should not be able to withdraw during grace period
    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'Quotation: cannot withdraw before grace period expiration',
    );

    await qt.expireCover(coverId);

    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'Quotation: cannot withdraw before grace period expiration',
    );

    await setNextBlockTime(gracePeriodExpirationDate.toNumber() + 1);
    await mineNextBlock();

    assert(balanceBefore.eq(await tk.balanceOf(member1)), 'member balance has unexpectedly changed');

    await qt.withdrawCoverNote(member1, [coverId], ['0']);
    const balanceAfter = await tk.balanceOf(member1);

    assert(balanceBefore.add(expectedCoverNoteAmount).eq(balanceAfter), 'balanceBefore + coverNote != balanceAfter');
  });

  it.skip('does not allow to withdrawCoverNote with an open claim', async function () {
    const { cr, cd, cl, qt, tc, tk } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    const coverId = '1';
    const balanceBefore = await tk.balanceOf(member1);

    const lockReason = await tc.lockReason(member1, '0');
    const gracePeriodExpirationDate = await tc.getLockedTokensValidity(member1, lockReason);

    await setNextBlockTime(gracePeriodExpirationDate.subn(10).toNumber());
    await cl.submitClaim(coverId, { from: member1 });

    // we skip grace period to test for the open claim scenario.
    // when withdrawing the cover validity and grace period are checked first
    await setNextBlockTime(gracePeriodExpirationDate.addn(10).toNumber());
    await mineNextBlock();

    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'TokenController: Cannot withdraw for cover with an open claim',
    );

    const claimId = '1';
    const submittedAt = await cd.getClaimDateUpd(claimId);
    await cl.submitCAVote(claimId, toBN('-1'), { from: claimAssessor });

    const maxVotingTime = await cd.maxVotingTime();
    await setNextBlockTime(submittedAt.add(maxVotingTime).toNumber());
    await cr.closeClaim(claimId);

    const { statno: status } = await cd.getClaimStatusNumber(claimId);
    assert.equal(status.toString(), '6'); // CA vote denied

    // make sure balance hasn't changed
    assert(balanceBefore.eq(await tk.balanceOf(member1)), 'member balance has unexpectedly changed');

    // should work after the claim was closed
    await qt.withdrawCoverNote(member1, [coverId], ['0']);
    const balanceAfter = await tk.balanceOf(member1);
    const expectedCoverNoteAmount = toBN(cover.priceNXM)
      .muln(5)
      .divn(100);

    // check that half of the initial CN deposit was returned
    assert(balanceBefore.add(expectedCoverNoteAmount).eq(balanceAfter), 'balanceBefore + coverNote != balanceAfter');
  });

  it.skip('does not allow to withdrawCoverNote after two rejected claims', async function () {
    const { qt, tk } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    const coverId = '1';
    const balanceBefore = await tk.balanceOf(member1);

    await claimAndVote(this.contracts, coverId, member1, claimAssessor, false);
    await claimAndVote(this.contracts, coverId, member1, claimAssessor, false);

    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'Quotation: cannot withdraw before grace period expiration',
    );

    // should work after the claim was closed
    const balanceAfter = await tk.balanceOf(member1);

    // check that half of the initial CN deposit was returned
    assert(balanceBefore.eq(balanceAfter), 'balanceBefore != balanceAfter');
  });

  it('does not allow to withdrawCoverNote after an accepted claim', async function () {
    const { qt, tk } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    const coverId = '1';
    const balanceBefore = await tk.balanceOf(member1);

    await claimAndVote(this.contracts, coverId, member1, claimAssessor, true);

    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'Quotation: cannot withdraw before grace period expiration',
    );

    // should work after the claim was closed
    const balanceAfter = await tk.balanceOf(member1);
    const expectedCoverNoteAmount = toBN(cover.priceNXM)
      .muln(10)
      .divn(100);

    // check that half of the initial CN deposit was returned
    assert(balanceBefore.add(expectedCoverNoteAmount).eq(balanceAfter), 'balanceBefore + coverNote != balanceAfter');
  });

  it('does not allow to withdrawCoverNote after one rejected and one an accepted claim', async function () {
    const { qt, tk } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    const coverId = '1';
    const balanceBefore = await tk.balanceOf(member1);

    await claimAndVote(this.contracts, coverId, member1, claimAssessor, false);
    await claimAndVote(this.contracts, coverId, member1, claimAssessor, true);

    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'Quotation: cannot withdraw before grace period expiration',
    );

    // should work after the claim was closed
    const balanceAfter = await tk.balanceOf(member1);
    const expectedCoverNoteAmount = toBN(cover.priceNXM)
      .muln(5)
      .divn(100);

    // check that half of the initial CN deposit was returned
    assert(balanceBefore.add(expectedCoverNoteAmount).eq(balanceAfter), 'balanceBefore + coverNote != balanceAfter');
  });

  it('correctly removes the reasons when withdrawing multiple CNs', async function () {
    const { qd, qt, tk } = this.contracts;

    const cover = { ...coverTemplate };
    const generationTime = `${Number(cover.generationTime) + 1}`;
    const secondCover = { ...coverTemplate, generationTime };

    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    await buyCover({ ...this.contracts, cover: secondCover, coverHolder: member1 });

    const balanceBefore = await tk.balanceOf(member1);
    const expectedCoverNoteTotal = toBN(cover.priceNXM)
      .muln(20)
      .divn(100);

    const coverExpirationDate = await qd.getValidityOfCover('2');
    await setNextBlockTime(coverExpirationDate.addn(1).toNumber());
    await qt.expireCover('1');
    await qt.expireCover('2');

    const gracePeriod = await qd.getValidityOfCover('2');
    const gracePeriodExpirationDate = coverExpirationDate.add(gracePeriod);

    await setNextBlockTime(gracePeriodExpirationDate.addn(1).toNumber());
    await qt.withdrawCoverNote(member1, ['1', '2'], ['0', '1']);
    const balanceAfter = await tk.balanceOf(member1);

    // check that half of the initial CN deposit was returned
    assert(balanceBefore.add(expectedCoverNoteTotal).eq(balanceAfter), 'balanceBefore + coverNote != balanceAfter');
  });

  it("should not allow withdrawal of other members' CNs", async function () {
    const { qd, qt } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });

    const coverExpirationDate = await qd.getValidityOfCover('1');
    await setNextBlockTime(coverExpirationDate.addn(1).toNumber());
    await qt.expireCover('1');

    const gracePeriod = await qd.getValidityOfCover('1');
    const gracePeriodExpirationDate = coverExpirationDate.add(gracePeriod);

    await setNextBlockTime(gracePeriodExpirationDate.addn(1).toNumber());
    await expectRevert.unspecified(qt.withdrawCoverNote(member2, ['1'], ['0']));
  });

  require('./basic-functionality-tests');
});
