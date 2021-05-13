const { accounts, web3 } = require('hardhat');
const { ether, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { coverToCoverDetailsArray } = require('../utils/buyCover');
const { toBN } = web3.utils;

const { enrollMember } = require('../utils/enroll');
const { buyCover, buyCoverWithDai } = require('../utils/buyCover');
const { getQuoteSignature } = require('../utils/getQuote');
const { addIncident } = require('../utils/incidents');
const {
  constants: { CoverStatus, ProposalCategory },
  evm: { setNextBlockTime },
  helpers: { bnEqual, hex },
} = require('../utils');

const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');
const EvilContract = artifacts.require('EvilContract');

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

describe.only('incidents', function () {

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

  it('reverts when adding an incident from a non-governance address', async function () {
    const { incidents } = this.contracts;
    await expectRevert(
      incidents.addIncident(productId, '0', '0', { from: owner }),
      'Caller is not authorized to govern',
    );
  });

  it('reverts when raising claim if msg.sender != cover owner', async function () {

    const { incidents, qd } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const incidentDate = (await time.latest()).addn(1);
    const priceBefore = ether('1');
    await addIncident(this.contracts, [owner], cover.contractAddress, incidentDate, priceBefore);

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

    const incident0Date = coverStartDate.subn(1);
    const incident1Date = coverExpiration.addn(1);
    const priceBefore = ether('1');

    await addIncident(this.contracts, [owner], cover.contractAddress, incident0Date, priceBefore);
    await addIncident(this.contracts, [owner], cover.contractAddress, incident1Date, priceBefore);

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

    const incidentDate = coverStartDate.addn(1);
    const priceBefore = ether('1');
    await addIncident(this.contracts, [owner], cover.contractAddress, incidentDate, priceBefore);

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

    const incidentDate = coverStartDate.addn(1);
    await addIncident(this.contracts, [owner], cover.contractAddress, incidentDate, priceBefore);

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

    const incidentDate = coverStartDate.addn(1);
    await addIncident(this.contracts, [owner], cover.contractAddress, incidentDate, priceBefore);

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

    const incidentDate = coverStartDate.addn(1);
    await addIncident(this.contracts, [owner], cover.contractAddress, incidentDate, priceBefore);

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

    const incidentDate = coverStartDate.addn(1);
    await addIncident(this.contracts, [owner], cover.contractAddress, incidentDate, priceBefore);

    await ybDAI.mint(coverHolder, tokenAmount);
    await ybDAI.approve(incidents.address, tokenAmount, { from: coverHolder });

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const incidentId = '0';

    await expectRevert(
      incidents.redeemPayout(coverId, incidentId, tokenAmount, { from: coverHolder }),
      'Incidents: Payout failed',
    );
  });

  it('sends token payout to the payout address and sets accumulated burn', async function () {

    const { dai, incidents, qd, mr, p1 } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const coverStartDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI
    const sumAssured = ether('1').muln(cover.amount);

    // sumAssured DAI = tokenAmount ybDAI @ priceBefore
    // 500 DAI  /  2 DAI/ybDAI  =  1000 ybDAI
    const tokenAmount = ether('1').mul(sumAssured).div(priceBefore);

    const incidentDate = coverStartDate.addn(1);
    await addIncident(this.contracts, [owner], cover.contractAddress, incidentDate, priceBefore);

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

    const daiPerNXM = await p1.getTokenPrice(dai.address);
    const burnRate = await incidents.BURN_RATE();
    const fullBurnAmount = ether('1').mul(sumAssured).div(daiPerNXM);

    const expectedBurnAmount = fullBurnAmount.mul(burnRate).divn(100);
    const actualAccumulatedBurn = await incidents.accumulatedBurn(cover.contractAddress);
    bnEqual(actualAccumulatedBurn, expectedBurnAmount);

    const expectedCoverStatus = toBN(CoverStatus.ClaimAccepted);
    const actualCoverStatus = await qd.getCoverStatusNo(coverId);
    bnEqual(actualCoverStatus, expectedCoverStatus);
  });

  it('properly sets the cover and claim statuses', async function () {

    const { incidents, cd, qd } = this.contracts;
    const cover = { ...coverTemplate };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const coverStartDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI
    const sumAssured = ether('1').muln(cover.amount);
    const tokenAmount = ether('1').mul(sumAssured).div(priceBefore);

    const incidentDate = coverStartDate.addn(1);
    await addIncident(this.contracts, [owner], cover.contractAddress, incidentDate, priceBefore);

    await ybDAI.mint(coverHolder, tokenAmount);
    await ybDAI.approve(incidents.address, tokenAmount, { from: coverHolder });

    const claimCountBefore = await cd.actualClaimLength();
    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const incidentId = '0';
    await incidents.redeemPayout(coverId, incidentId, tokenAmount, { from: coverHolder });

    const expectedClaimCountAfter = claimCountBefore.addn(1);
    const actualClaimCountAfter = await cd.actualClaimLength();
    bnEqual(actualClaimCountAfter, expectedClaimCountAfter);

    const expectedCoverStatus = toBN(CoverStatus.ClaimAccepted);
    const actualCoverStatus = await qd.getCoverStatusNo(coverId);
    bnEqual(actualCoverStatus, expectedCoverStatus);

    const claimId = claimCountBefore;
    const expectedClaimStatus = toBN('14');
    const { statno: actualClaimStatus } = await cd.getClaimStatusNumber(claimId);
    bnEqual(actualClaimStatus, expectedClaimStatus);
  });

  it('sends ETH payout and sets accumulated burn', async function () {

    const { incidents, qd, p1 } = this.contracts;

    const ETH = await p1.ETH();
    const productId = '0x000000000000000000000000000000000000000e';
    const ybETH = await ERC20MintableDetailed.new('yield bearing ETH', 'ybETH', 18);
    await incidents.addProducts([productId], [ybETH.address], [ETH], { from: owner });

    const cover = { ...coverTemplate, currency: hex('ETH'), contractAddress: productId };
    await buyCover({ ...this.contracts, cover, coverHolder });

    const coverStartDate = await time.latest();
    const priceBefore = ether('2.5'); // ETH per ybETH
    const sumAssured = ether('1').muln(cover.amount);

    // sumAssured DAI = tokenAmount ybETH @ priceBefore
    // 500 ETH  /  2 ETH/ybETH  =  1000 ybETH
    const tokenAmount = ether('1').mul(sumAssured).div(priceBefore);

    const incidentDate = coverStartDate.addn(1);
    await addIncident(this.contracts, [owner], cover.contractAddress, incidentDate, priceBefore);

    await ybETH.mint(coverHolder, tokenAmount);
    await ybETH.approve(incidents.address, tokenAmount, { from: coverHolder });

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const incidentId = '0';

    const ethBalanceBefore = toBN(await web3.eth.getBalance(coverHolder));
    await incidents.redeemPayout(
      coverId,
      incidentId,
      tokenAmount,
      // gas price set to 0 so we can know the payout exactly
      { from: coverHolder, gasPrice: 0 },
    );

    const ethBalanceAfter = toBN(await web3.eth.getBalance(coverHolder));
    const ethDiff = ethBalanceAfter.sub(ethBalanceBefore);
    bnEqual(ethDiff, sumAssured);

    const ethPerNXM = await p1.getTokenPrice(ETH);
    const burnRate = await incidents.BURN_RATE();
    const fullBurnAmount = ether('1').mul(sumAssured).div(ethPerNXM);

    const expectedBurnAmount = fullBurnAmount.mul(burnRate).divn(100);
    const actualAccumulatedBurn = await incidents.accumulatedBurn(cover.contractAddress);
    bnEqual(actualAccumulatedBurn, expectedBurnAmount);

    const expectedCoverStatus = toBN(CoverStatus.ClaimAccepted);
    const actualCoverStatus = await qd.getCoverStatusNo(coverId);
    bnEqual(actualCoverStatus, expectedCoverStatus);
  });

  it('increments accumulated burn on second payout', async function () {

    const { dai, incidents, qd, p1 } = this.contracts;

    const cover0 = { ...coverTemplate, period: 61 };
    const generationTime = `${Number(cover0.generationTime) + 1}`;
    const cover1 = { ...cover0, period: 61, generationTime };

    await buyCoverWithDai({ ...this.contracts, cover: cover0, coverHolder });
    await buyCoverWithDai({ ...this.contracts, cover: cover1, coverHolder });

    const coverStartDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI
    const sumAssured = ether('1').muln(cover0.amount);
    const tokenAmount = ether('1').mul(sumAssured).div(priceBefore);

    const incidentDate = coverStartDate.addn(1);
    await addIncident(this.contracts, [owner], cover0.contractAddress, incidentDate, priceBefore);

    const [coverId0, coverId1] = await qd.getAllCoversOfUser(coverHolder);

    const totalTokenAmount = tokenAmount.muln(2);
    await ybDAI.mint(coverHolder, totalTokenAmount);
    await ybDAI.approve(incidents.address, totalTokenAmount, { from: coverHolder });

    const incidentId = '0';
    await incidents.redeemPayout(coverId0, incidentId, tokenAmount, { from: coverHolder });
    await incidents.redeemPayout(coverId1, incidentId, tokenAmount, { from: coverHolder });

    const daiPerNXM = await p1.getTokenPrice(dai.address);
    const burnRate = await incidents.BURN_RATE();
    const fullBurnAmount = ether('1').mul(sumAssured).div(daiPerNXM);
    const expectedBurnAmountPerCover = fullBurnAmount.mul(burnRate).divn(100);

    const expectedBurnAmountTotal = expectedBurnAmountPerCover.muln(2);
    const actualAccumulatedBurn = await incidents.accumulatedBurn(cover0.contractAddress);
    bnEqual(actualAccumulatedBurn, expectedBurnAmountTotal);
  });

  it('pushes burns', async function () {

    const { dai, incidents, qd, p1, ps } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const coverStartDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI
    const sumAssured = ether('1').muln(cover.amount);
    const tokenAmount = ether('1').mul(sumAssured).div(priceBefore);

    const incidentDate = coverStartDate.addn(1);
    await addIncident(this.contracts, [owner], cover.contractAddress, incidentDate, priceBefore);

    await ybDAI.mint(coverHolder, tokenAmount);
    await ybDAI.approve(incidents.address, tokenAmount, { from: coverHolder });

    await expectRevert(
      incidents.pushBurns(cover.contractAddress, 30),
      'Incidents: No burns to push',
    );

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const incidentId = '0';
    await incidents.redeemPayout(coverId, incidentId, tokenAmount, { from: coverHolder });

    const daiPerNXM = await p1.getTokenPrice(dai.address);
    const burnRate = await incidents.BURN_RATE();
    const fullBurnAmount = ether('1').mul(sumAssured).div(daiPerNXM);
    const expectedBurnAmount = fullBurnAmount.mul(burnRate).divn(100);

    const actualAccumulatedBurn = await incidents.accumulatedBurn(cover.contractAddress);
    bnEqual(actualAccumulatedBurn, expectedBurnAmount);

    await expectRevert(
      incidents.pushBurns(cover.contractAddress, 29),
      'Incidents: Pass at least 30 iterations',
    );

    // not using expectEvent because the event is emitted from ps
    // and therefore only present in rawLogs
    const pushTx = await incidents.pushBurns(cover.contractAddress, 30);
    const burnRequestedTopic0 = web3.utils.keccak256('BurnRequested(address,uint256)');

    const burnRequestedEvents = pushTx.receipt.rawLogs.filter(log => {
      return log.topics && log.topics[0] === burnRequestedTopic0;
    });

    assert.strictEqual(burnRequestedEvents.length, 1);
    const event = burnRequestedEvents[0];

    // get the latest 20 bytes (40 chars)
    const eventProtocol = '0x' + event.topics[1].slice(-40);
    assert.strictEqual(eventProtocol, cover.contractAddress);

    const burnEventAmount = toBN(web3.utils.hexToNumberString(event.data));
    bnEqual(burnEventAmount, expectedBurnAmount);
  });

  it.only('reverts on reentrant calls', async function () {
    const { dai, incidents, qt, p1, ps, mr, tk } = this.contracts;

    const cover = { ...coverTemplate };
    const evilContract = await EvilContract.new(incidents.address);

    await mr.payJoiningFee(evilContract.address, { from: owner, value: ether('0.002') });
    await mr.kycVerdict(evilContract.address, true);
    //await tk.approve(tc.address, MAX_UINT256, { from: member });
    await tk.transfer(evilContract.address, toBN(ether('2500')));

    const vrsData = await getQuoteSignature(
      coverToCoverDetailsArray(cover),
      cover.currency,
      cover.period,
      cover.contractAddress,
      qt.address,
    );

    const coverPrice = toBN(cover.price);

    const approveDAITx = await dai.approve.request(p1.address, coverPrice);
    console.log({approveDAITx});
    await evilContract.execute([dai.address], [ether('0')], [approveDAITx.data]);
    const allowance = await tk.allowance(evilContract.address, p1.address);
    console.log({allowance});

    const makeCoverUsingCATx = await p1.makeCoverUsingCA.request(
      cover.contractAddress,
      cover.currency,
      coverToCoverDetailsArray(cover),
      cover.period,
      vrsData[0],
      vrsData[1],
      vrsData[2],
    );
    await evilContract.execute([p1.address], [ether('0')], [makeCoverUsingCATx.data]);

    const coverStartDate = await time.latest();
    const priceBefore = ether('2'); // DAI per ybDAI
    const sumAssured = ether('1').muln(cover.amount);
    const tokenAmount = ether('1').mul(sumAssured).div(priceBefore);

    const incidentDate = coverStartDate.addn(1);
    await addIncident(this.contracts, [owner], cover.contractAddress, incidentDate, priceBefore);

    await ybDAI.mint(evilContract.address, tokenAmount);
    const approveYbDAITx = await ybDAI.approve.request(incidents.address, tokenAmount);
    await evilContract.execute([ybDAI.address], [ether('0')], [approveYbDAITx.data]);

    const redeemPayoutTx = await incidents.redeemPayout.request(1, 0, tokenAmount);
    await evilContract.execute([incidents.address], [ether('0')], [redeemPayoutTx.data]);

  });
});
