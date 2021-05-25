const { accounts, web3 } = require('hardhat');
const { expectRevert, ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { enrollMember } = require('../utils/enroll');
const { addIncident } = require('../utils/incidents');
const { buyCover, daiCoverTemplate } = require('./utils');
const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');

const [owner, coverHolder, stranger] = accounts;

let cover;
const productId = daiCoverTemplate.contractAddress;
let ybDAI;

describe('claimTokens', function () {
  beforeEach(async function () {
    const { dai, incidents, gateway } = this.contracts;
    ybDAI = await ERC20MintableDetailed.new('yield bearing DAI', 'ybDAI', 18);
    await enrollMember(this.contracts, [coverHolder, stranger]);
    await dai.mint(coverHolder, ether('10000000'));
    await ybDAI.mint(coverHolder, ether('10000000'));
    await ybDAI.approve(gateway.address, ether('10000000'), {
      from: coverHolder,
    });
    await incidents.addProducts([productId], [ybDAI.address], [dai.address], {
      from: owner,
    });
    cover = { ...daiCoverTemplate, asset: dai.address };
  });

  it('reverts for non-existant cover id', async function () {
    const { gateway } = this.contracts;

    await buyCover({ ...this.contracts, coverData: cover, coverHolder }); // coverId 1
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
      gateway.claimTokens(
        nonExistentCoverId,
        incidentId,
        cover.amount,
        ybDAI.address,
        {
          from: coverHolder,
        },
      ),
    );
  });

  it('reverts for member that does not own the cover', async function () {
    const { gateway } = this.contracts;

    await buyCover({ ...this.contracts, coverData: cover, coverHolder });
    const incidentDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI
    await addIncident(
      this.contracts,
      [owner],
      productId,
      incidentDate,
      priceBefore,
    );

    await ybDAI.mint(stranger, ether('10000000'));
    await ybDAI.approve(gateway.address, ether('10000000'), {
      from: stranger,
    });

    await expectRevert(
      gateway.claimTokens(1, 0, cover.amount, ybDAI.address, {
        from: stranger,
      }),
      'VM Exception while processing transaction: revert Incidents: Not cover owner',
    );
  });

  it('reverts for cover outside the grace period', async function () {
    const { qt, gateway, tc } = this.contracts;

    await buyCover({
      ...this.contracts,
      coverData: cover,
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
      gateway.claimTokens(1, 0, cover.amount, ybDAI.address, {
        from: coverHolder,
      }),
      'Incidents: Grace period has expired',
    );
  });

  it('reverts for inexistent incident id', async function () {
    const { gateway } = this.contracts;

    await buyCover({ ...this.contracts, coverData: cover, coverHolder });

    // accessing inexistent array index reverts with invalid opcode
    await expectRevert.assertion(
      gateway.claimTokens(1, 0, cover.amount, ybDAI.address, {
        from: coverHolder,
      }),
    );
  });

  it('creates a valid claim for a cover', async function () {
    const { gateway, cd: claimsData } = this.contracts;

    await buyCover({
      ...this.contracts,
      coverData: cover,
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
      ether('500'),
      ybDAI.address,
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
    const { gateway } = this.contracts;

    await buyCover({
      ...this.contracts,
      coverData: cover,
      coverHolder: coverHolder,
    });

    const incidentDate = await time.latest();
    const priceBefore = ether('2'); // 2 DAI per ybDAI
    // Given a 2 DAI per ybDAI rate and a 1000 DAI cover
    // with deductableRatio = 9000 / 10000
    // maxTokenAmount = 1000 / 2 * 10000 / 9000
    // we can send a maximum of 555.(5) ybDAI an receive a maxium of 1000 DAI.
    const invalidAmount = ether('556'); // ybDAI
    await addIncident(
      this.contracts,
      [owner],
      productId,
      incidentDate,
      priceBefore,
    );

    const expectedCoverId = 1;
    await expectRevert(
      gateway.claimTokens(expectedCoverId, 0, invalidAmount, ybDAI.address, {
        from: coverHolder,
      }),
      'Incidents: Amount exceeds sum assured',
    );
  });
});
