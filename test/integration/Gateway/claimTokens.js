const { accounts, web3 } = require('hardhat');
const {
  expectRevert,
  expectEvent,
  ether,
  time,
} = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { enrollMember } = require('../utils/enroll');
const { addIncident } = require('../utils/incidents');
const { hex } = require('../utils').helpers;
const { buyCoverWithDai } = require('../utils/buyCover');
const { daiCoverTemplate } = require('./utils');
const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');

const EMPTY_DATA = web3.eth.abi.encodeParameters([], []);

const [owner, coverHolder, stranger] = accounts;

let cover;
const productId = daiCoverTemplate.contractAddress;
let ybDAI;

describe('claimTokens', function () {
  beforeEach(async function () {
    const { dai, incidents } = this.contracts;
    ybDAI = await ERC20MintableDetailed.new('yield bearing DAI', 'ybDAI', 18);
    await enrollMember(this.contracts, [coverHolder, stranger]);
    await dai.mint(coverHolder, ether('10000000'));
    await ybDAI.mint(coverHolder, ether('10000000'));
    await ybDAI.approve(incidents.address, ether('10000000'), {
      from: coverHolder,
    });
    await incidents.addProducts([productId], [ybDAI.address], [dai.address], {
      from: owner,
    });
    cover = { ...daiCoverTemplate, asset: dai.address };
  });

  it('reverts for non-existant cover id', async function () {
    const { gateway } = this.contracts;

    await buyCoverWithDai({ ...this.contracts, cover, coverHolder }); // coverId 1
    const incidentDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI
    await addIncident(
      this.contracts,
      [owner],
      productId,
      incidentDate,
      priceBefore,
    );

    const nonExistentCoverId = 2;
    const incidentId = 0;

    await expectRevert.assertion(
      gateway.claimTokens(nonExistentCoverId, incidentId, cover.amount, {
        from: coverHolder,
      }),
    );
  });

  it('reverts for member that does not own the cover', async function () {
    const { gateway } = this.contracts;

    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });
    const incidentDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI
    await addIncident(
      this.contracts,
      [owner],
      productId,
      incidentDate,
      priceBefore,
    );

    await expectRevert(
      gateway.claimTokens(1, 0, cover.amount, {
        from: stranger,
      }),
      'VM Exception while processing transaction: revert Incidents: Not cover owner',
    );
  });

  it('reverts for cover outside the grace period', async function () {
    const { qt, gateway, tc } = this.contracts;

    await buyCoverWithDai({
      ...this.contracts,
      cover,
      coverHolder: coverHolder,
    });
    const expectedCoverId = 1;
    const claimSubmissionGracePeriod = await tc.claimSubmissionGracePeriod();
    const incidentDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI
    await addIncident(
      this.contracts,
      [owner],
      productId,
      incidentDate,
      priceBefore,
    );

    await time.increase(
      (cover.period + claimSubmissionGracePeriod.toNumber() + 1) * 24 * 3600,
    );
    await qt.expireCover(expectedCoverId);

    await expectRevert(
      gateway.claimTokens(1, 0, cover.amount, {
        from: coverHolder,
      }),
      'Incidents: Grace period has expired',
    );
  });

  it('reverts for inexistent incident id', async function () {
    const { gateway } = this.contracts;

    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    // accessing inexistent array index reverts with invalid opcode
    await expectRevert.assertion(
      gateway.claimTokens(1, 0, cover.amount, {
        from: coverHolder,
      }),
    );
  });

  it('creates a valid claim for a cover', async function () {
    const { gateway, cd: claimsData } = this.contracts;

    await buyCoverWithDai({
      ...this.contracts,
      cover,
      coverHolder: coverHolder,
    });

    const incidentDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI
    await addIncident(
      this.contracts,
      [owner],
      productId,
      incidentDate,
      priceBefore,
    );

    const expectedCoverId = 1;
    const submitTx = await gateway.claimTokens(
      expectedCoverId,
      0,
      cover.amount,
      {
        from: coverHolder,
      },
    );

    const expectedClaimId = 1;
    const block = await web3.eth.getBlock(submitTx.receipt.blockNumber);
    const claim = await claimsData.getClaim(expectedClaimId);

    assert.equal(claim.claimId.toString(), expectedClaimId.toString());
    assert.equal(claim.coverId.toString(), expectedCoverId.toString());
    assert.equal(claim.vote.toString(), '0');
    assert.equal(claim.status.toString(), '14');
    assert.equal(claim.dateUpd.toString(), block.timestamp.toString());
    assert.equal(claim.state12Count.toString(), '0');
  });

  it('reverts if more tokens are requested than the covered amount', async function () {
    const { dai, gateway } = this.contracts;

    await buyCoverWithDai({
      ...this.contracts,
      cover,
      coverHolder: coverHolder,
    });

    const incidentDate = await time.latest();
    const priceBefore = ether('2'); // 2 DAI per ybDAI
    // Given a 2 DAI per ybDAI rate and a 1000 DAI cover
    // we can send a maximum of 500 ybDAI an receive a maxium of 1000 DAI.
    const invalidAmount = ether('501'); // ybDAI
    await addIncident(
      this.contracts,
      [owner],
      productId,
      incidentDate,
      priceBefore,
    );

    const expectedCoverId = 1;
    const daiBalanceBefore = await dai.balanceOf(coverHolder);

    await expectRevert.assertion(
      gateway.claimTokens(expectedCoverId, 0, invalidAmount, {
        from: coverHolder,
      }),
      'Incidents: Amount exceeds sum assured',
    );

    await gateway.claimTokens(expectedCoverId, 0, invalidAmount, {
      from: coverHolder,
    });
    const daiBalanceAfter = await dai.balanceOf(coverHolder);
    console.log({
      coveredAmount: cover.amount.toString() / 1e18,
      daiBalanceBefore: daiBalanceBefore.toString() / 1e18,
      daiBalanceAfter: daiBalanceAfter.toString() / 1e18,
      diff:
        daiBalanceAfter.toString() / 1e18 - daiBalanceBefore.toString() / 1e18,
    });
  });
});
