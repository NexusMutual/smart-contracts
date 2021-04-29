const { accounts, web3 } = require('hardhat');
const { constants, ether, expectRevert, time } = require('@openzeppelin/test-helpers');
const { toBN } = web3.utils;

const { enrollMember } = require('../utils/enroll');
const { buyCover, buyCoverWithDai } = require('../utils/buyCover');
const {
  constants: { CoverStatus },
  evm: { setNextBlockTime },
  helpers: { bnEqual, hex },
} = require('../utils');

const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');
const EtherRejecter = artifacts.require('EtherRejecter');

const [owner, coverHolder, stranger] = accounts;
const productId = '0x0000000000000000000000000000000000000003';
let ybDAI;

const coverTemplate = {
  amount: 10, // 1 dai or eth
  price: '3000000000000000', // 0.003 dai or eth
  priceNXM: '1000000000000000000', // 1 nxm
  expireTime: '2000000000', // year 2033
  generationTime: '1600000000000',
  currency: hex('DAI'),
  period: 60,
  contractAddress: productId,
};

describe('incidents', function () {

  beforeEach(async function () {
    const { dai, incidents } = this.contracts;
    ybDAI = await ERC20MintableDetailed.new('yield bearing DAI', 'ybDAI', 18);
    await enrollMember(this.contracts, [coverHolder]);
    await dai.mint(coverHolder, ether('10000000'));
    await incidents.addProducts([productId], [ybDAI.address], [dai.address], { from: owner });
  });

  it('reverts when adding the same covered/underlying token twice', async function () {

    const { incidents } = this.contracts;

    // product id, covered token, underlying token
    const prOne = '0x0000000000000000000000000000000000000001';
    const ctOne = '0x00000000000000000000000000000000000000c1';
    const utOne = '0x0000000000000000000000000000000000000071';

    const ctTwo = '0x00000000000000000000000000000000000000c2';
    const utTwo = '0x0000000000000000000000000000000000000072';

    await incidents.addProducts([prOne], [ctOne], [utOne], { from: owner });

    await expectRevert(
      incidents.addProducts([prOne], [ctTwo], [utTwo], { from: owner }),
      'Incidents: covered token is already set',
    );
  });

  it('reverts when buying ETH cover for token with DAI underlying', async function () {
    const cover = { ...coverTemplate, currency: hex('ETH') };
    await expectRevert(
      buyCover({ ...this.contracts, cover, coverHolder }),
      'Quotation: Unsupported cover asset for this product',
    );
  });

  it('reverts when raising claims for covered token covers', async function () {

    const { cl, qd } = this.contracts;
    const cover = { ...coverTemplate };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    await expectRevert(
      cl.submitClaim(coverId),
      'Claims: Product type does not allow claims',
    );
  });

  it('reverts when raising claim with indexistent incident id', async function () {

    const { incidents, qd } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const incidentId = '0';
    const tokenAmount = '0';

    // accessing inexistent array index reverts with invalid opcode
    await expectRevert.assertion(
      incidents.redeemPayout(coverId, incidentId, tokenAmount, { from: stranger }),
    );
  });

  it('reverts when raising claim if msg.sender != cover owner', async function () {

    const { incidents, qd } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });
    const coverStartDate = await time.latest();

    await incidents.addIncident(
      cover.contractAddress,
      coverStartDate.addn(1),
      ether('1'),
      { from: owner },
    );

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const incidentId = '0';
    const tokenAmount = '0';

    await expectRevert(
      incidents.redeemPayout(coverId, incidentId, tokenAmount, { from: stranger }),
      'Incidents: Not cover owner',
    );
  });

  it('reverts when incident date is outside the cover period', async function () {

    const { incidents, qd } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const coverStartDate = await time.latest();
    const coverPeriod = toBN(cover.period * 24 * 3600);
    const coverExpiration = coverStartDate.add(coverPeriod).addn(1);

    // 0
    await incidents.addIncident(
      cover.contractAddress,
      coverStartDate.subn(1),
      ether('1'),
      { from: owner },
    );

    // 1
    await incidents.addIncident(
      cover.contractAddress,
      coverExpiration.addn(1),
      ether('1'),
      { from: owner },
    );

    const incidentBeforeCover = '0';
    const incidentAfterCover = '1';

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const tokenAmount = '0';

    await expectRevert(
      incidents.redeemPayout(coverId, incidentAfterCover, tokenAmount, { from: coverHolder }),
      'Incidents: Cover end date is after the incident',
    );

    await expectRevert(
      incidents.redeemPayout(coverId, incidentBeforeCover, tokenAmount, { from: coverHolder }),
      'Incidents: Cover start date is before the incident',
    );
  });

  it('reverts when grace period has expired', async function () {

    const { incidents, qd, tc } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const coverStartDate = await time.latest();
    const coverPeriod = toBN(cover.period * 24 * 3600);
    const coverExpiration = coverStartDate.add(coverPeriod);

    const gracePeriod = await tc.claimSubmissionGracePeriod();
    const gracePeriodExpiration = coverExpiration.add(gracePeriod);
    await setNextBlockTime(Number(gracePeriodExpiration.addn(1).toString()));

    await incidents.addIncident(
      cover.contractAddress,
      coverStartDate.addn(1),
      ether('1'),
      { from: owner },
    );

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const incidentId = '0';
    const tokenAmount = '0';

    await expectRevert(
      incidents.redeemPayout(coverId, incidentId, tokenAmount, { from: coverHolder }),
      'Incidents: Grace period has expired',
    );
  });

  it('reverts when requested payout amount is greater than sum assured', async function () {

    const { incidents, qd } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const coverStartDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI
    const sumAssured = ether('1').muln(cover.amount);

    // sumAssured DAI = tokenAmount ybDAI @ priceBefore
    // 500 DAI  /  2 DAI/ybDAI  =  1000 ybDAI
    const tokenAmount = ether('1').mul(sumAssured).div(priceBefore);
    const tokenAmountExcess = tokenAmount.addn(1);

    await incidents.addIncident(
      cover.contractAddress,
      coverStartDate.addn(1),
      priceBefore,
      { from: owner },
    );

    await ybDAI.mint(coverHolder, ether('100'));

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const incidentId = '0';

    await expectRevert(
      incidents.redeemPayout(coverId, incidentId, tokenAmountExcess, { from: coverHolder }),
      'Incidents: Amount exceeds sum assured',
    );
  });

  it('reverts when tokens cannot be transfered from cover owner', async function () {

    const { incidents, qd } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const coverStartDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI
    const sumAssured = ether('1').muln(cover.amount);

    // sumAssured DAI = tokenAmount ybDAI @ priceBefore
    // 500 DAI  /  2 DAI/ybDAI  =  1000 ybDAI
    const tokenAmount = ether('1').mul(sumAssured).div(priceBefore);

    await incidents.addIncident(
      cover.contractAddress,
      coverStartDate.addn(1),
      priceBefore,
      { from: owner },
    );

    await ybDAI.mint(coverHolder, ether('100'));

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const incidentId = '0';

    await expectRevert(
      incidents.redeemPayout(coverId, incidentId, tokenAmount, { from: coverHolder }),
      'SafeERC20: low-level call failed',
    );
  });

  it('pays the correct amount and reverts on duplicate claim', async function () {

    const { dai, incidents, qd } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const coverStartDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI
    const sumAssured = ether('1').muln(cover.amount);

    // sumAssured DAI = tokenAmount ybDAI @ priceBefore
    // 500 DAI  /  2 DAI/ybDAI  =  1000 ybDAI
    const tokenAmount = ether('1').mul(sumAssured).div(priceBefore);

    await incidents.addIncident(
      cover.contractAddress,
      coverStartDate.addn(1),
      priceBefore,
      { from: owner },
    );

    await ybDAI.mint(coverHolder, tokenAmount);
    await ybDAI.approve(incidents.address, tokenAmount, { from: coverHolder });

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const incidentId = '0';

    const daiBalanceBefore = await dai.balanceOf(coverHolder);
    await incidents.redeemPayout(coverId, incidentId, tokenAmount, { from: coverHolder });
    const daiBalanceAfter = await dai.balanceOf(coverHolder);

    const daiDiff = daiBalanceAfter.sub(daiBalanceBefore);
    bnEqual(daiDiff, sumAssured);

    await expectRevert(
      incidents.redeemPayout(coverId, incidentId, tokenAmount, { from: coverHolder }),
      'TokenController: Cover already has accepted claims',
    );
  });

  it('reverts when payout fails due to insufficient pool funds', async function () {

    const { dai, incidents, qd, p1 } = this.contracts;

    const poolBalance = await dai.balanceOf(p1.address);
    const sumAssured = poolBalance.muln(2);
    const coverAmount = Math.floor(sumAssured.toString() / 1e18);

    const cover = { ...coverTemplate, amount: coverAmount };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const coverStartDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI

    // sumAssured DAI = tokenAmount ybDAI @ priceBefore
    // 500 DAI  /  2 DAI/ybDAI  =  1000 ybDAI
    const tokenAmount = ether('1').mul(sumAssured).div(priceBefore);

    await incidents.addIncident(
      cover.contractAddress,
      coverStartDate.addn(1),
      priceBefore,
      { from: owner },
    );

    await ybDAI.mint(coverHolder, tokenAmount);
    await ybDAI.approve(incidents.address, tokenAmount, { from: coverHolder });

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const incidentId = '0';

    await expectRevert(
      incidents.redeemPayout(coverId, incidentId, tokenAmount, { from: coverHolder }),
      'Incidents: Payout failed',
    );
  });

  it('sends the payout to the payout address', async function () {

    const { dai, incidents, qd, mr } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const coverStartDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI
    const sumAssured = ether('1').muln(cover.amount);

    // sumAssured DAI = tokenAmount ybDAI @ priceBefore
    // 500 DAI  /  2 DAI/ybDAI  =  1000 ybDAI
    const tokenAmount = ether('1').mul(sumAssured).div(priceBefore);

    await incidents.addIncident(
      cover.contractAddress,
      coverStartDate.addn(1),
      priceBefore,
      { from: owner },
    );

    await ybDAI.mint(coverHolder, tokenAmount);
    await ybDAI.approve(incidents.address, tokenAmount, { from: coverHolder });

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const incidentId = '0';

    const payoutAddress = '0xccc0000000000000000000000000000000000003';
    await mr.setClaimPayoutAddress(payoutAddress, { from: coverHolder });

    const daiBalanceBefore = await dai.balanceOf(payoutAddress);
    await incidents.redeemPayout(coverId, incidentId, tokenAmount, { from: coverHolder });
    const daiBalanceAfter = await dai.balanceOf(payoutAddress);

    const daiDiff = daiBalanceAfter.sub(daiBalanceBefore);
    bnEqual(daiDiff, sumAssured);
  });

});
