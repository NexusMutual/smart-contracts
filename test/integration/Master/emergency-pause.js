const { accounts, web3 } = require('hardhat');
const { expectEvent, expectRevert, ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { ProposalCategory } = require('../utils').constants;
const { hex } = require('../utils').helpers;
const { submitProposal } = require('../utils').governance;
const { buyCover, coverToCoverDetailsArray } = require('../utils').buyCover;
const { getQuoteSignature } = require('../utils').getQuote;
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { toBN } = web3.utils;

const MCR = artifacts.require('MCR');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const PooledStaking = artifacts.require('LegacyPooledStaking');
const NXMaster = artifacts.require('NXMaster');

const [owner, emergencyAdmin, unknown, member1, member2, member3, coverHolder] = accounts;

const coverTemplate = {
  amount: 1, // 1 eth
  price: '30000000000000000', // 0.03 eth
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 60,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
  asset: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  type: 0,
};

describe('emergency pause', function () {
  beforeEach(async function () {
    await enrollMember(this.contracts, [member1, member2, member3, coverHolder]);
    await enrollClaimAssessor(this.contracts, [member1, member2, member3]);
  });

  it('should revert when not called by emergency admin', async function () {
    const { master } = this.contracts;

    await expectRevert(master.setEmergencyPause(true, { from: unknown }), 'NXMaster: Not emergencyAdmin');
  });

  it('should be able to start and end emergency pause', async function () {
    const { master } = this.contracts;

    assert.equal(await master.isPause(), false);

    await master.setEmergencyPause(true, {
      from: emergencyAdmin,
    });

    assert.equal(await master.isPause(), true);

    await master.setEmergencyPause(false, {
      from: emergencyAdmin,
    });

    assert.equal(await master.isPause(), false);
  });

  it('should be able to perform proxy and replaceable upgrades during emergency pause', async function () {
    const { master, gv, productsV1 } = this.contracts;

    assert.equal(await master.isPause(), false);

    await master.setEmergencyPause(true, {
      from: emergencyAdmin,
    });

    const psCode = hex('PS');
    const mcCode = hex('MC');
    const pooledStaking = await PooledStaking.new();
    const mcr = await MCR.new(master.address);

    const contractCodes = [psCode, mcCode];
    const newAddresses = [pooledStaking.address, mcr.address];

    const upgradeContractsData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [contractCodes, newAddresses],
    );

    await submitProposal(gv, ProposalCategory.upgradeNonProxy, upgradeContractsData, [owner]);

    const psAddress = await master.getLatestAddress(psCode);

    const implementation = await (await OwnedUpgradeabilityProxy.at(psAddress)).implementation();
    assert.equal(implementation, pooledStaking.address);

    const address = await master.getLatestAddress(mcCode);
    assert.equal(address, mcr.address);
  });

  it('should be able to perform master upgrade during emergency pause', async function () {
    const { master, gv } = this.contracts;

    await master.setEmergencyPause(true, {
      from: emergencyAdmin,
    });

    const code = hex('MS');
    const newMaster = await NXMaster.new();

    const upgradeContractsData = web3.eth.abi.encodeParameters(['address'], [newMaster.address]);

    await submitProposal(gv, ProposalCategory.upgradeMaster, upgradeContractsData, [owner]);

    const implementation = await (await OwnedUpgradeabilityProxy.at(master.address)).implementation();
    assert.equal(implementation, newMaster.address);
  });

  it('stops token buys and sells', async function () {
    const { master, p1: pool } = this.contracts;

    await master.setEmergencyPause(true, {
      from: emergencyAdmin,
    });

    await expectRevert(pool.buyNXM('0', { value: ether('1') }), 'System is paused');
    await expectRevert(pool.sellNXM(ether('1'), '0'), 'System is paused');
  });

  it('stops cover purchases', async function () {
    const { p1, qt, master, gateway } = this.contracts;

    await master.setEmergencyPause(true, {
      from: emergencyAdmin,
    });

    const cover = { ...coverTemplate };
    const member = member1;

    // sign a different amount than the one requested.
    const signature = await getQuoteSignature(
      coverToCoverDetailsArray({ ...cover, amount: cover.amount + 1 }),
      cover.currency,
      cover.period,
      cover.contractAddress,
      qt.address,
    );

    await expectRevert(
      p1.makeCoverBegin(
        cover.contractAddress,
        cover.currency,
        coverToCoverDetailsArray(cover),
        cover.period,
        signature[0],
        signature[1],
        signature[2],
        { from: member, value: cover.price },
      ),
      'System is paused',
    );

    const data = web3.eth.abi.encodeParameters([], []);

    await expectRevert(
      gateway.buyCover(cover.contractAddress, cover.asset, cover.amount, cover.period, cover.type, data, {
        from: member,
        value: cover.price,
      }),
      'System is paused',
    );

    await expectRevert(
      qt.makeCoverUsingNXMTokens(
        coverToCoverDetailsArray(cover),
        cover.period,
        cover.currency,
        cover.contractAddress,
        signature[0],
        signature[1],
        signature[2],
        { from: member },
      ),
      'System is paused',
    );
  });

  it('stops claim payouts on closeClaim', async function () {
    const { cd, cl, qd, master, cr } = this.contracts;
    const cover = { ...coverTemplate };

    const coverHolder = member1;

    await buyCover({ ...this.contracts, cover, coverHolder });
    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverId, { from: coverHolder });
    const claimId = (await cd.actualClaimLength()).subn(1);
    await cl.submitCAVote(claimId, '1', { from: member1 });

    const minVotingTime = await cd.minVotingTime();
    await time.increase(minVotingTime.addn(1));

    const voteStatusBefore = await cl.checkVoteClosing(claimId);
    assert.equal(voteStatusBefore.toString(), '1', 'should allow vote closing');

    await master.setEmergencyPause(true, {
      from: emergencyAdmin,
    });
    await expectRevert(cr.closeClaim(claimId), 'System is paused');

    await master.setEmergencyPause(false, {
      from: emergencyAdmin,
    });

    // succeeds when unpaused
    await cr.closeClaim(claimId);
  });

  it('stops claim voting', async function () {
    const { cd, cl, qd, master, cr } = this.contracts;
    const cover = { ...coverTemplate };

    await buyCover({ ...this.contracts, cover, coverHolder });
    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverId, { from: coverHolder });
    const claimId = (await cd.actualClaimLength()).subn(1);

    const minVotingTime = await cd.minVotingTime();
    await time.increase(minVotingTime.addn(1));

    await master.setEmergencyPause(true, {
      from: emergencyAdmin,
    });

    await expectRevert.unspecified(cl.submitCAVote(claimId, '1', { from: member1 }));

    await master.setEmergencyPause(false, {
      from: emergencyAdmin,
    });

    await cl.submitCAVote(claimId, '1', { from: member1 });
  });
});
