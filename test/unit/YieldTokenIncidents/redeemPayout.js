const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { setNextBlockBaseFee } = require('../utils').evm;
const { setTime, ASSET, signPermit } = require('./helpers');
const { parseEther, arrayify, hexZeroPad, hexValue } = ethers.utils;

const daysToSeconds = days => days * 24 * 60 * 60;

const coverSegmentFixture = {
  amount: parseEther('100'),
  start: 0,
  period: daysToSeconds(30),
  gracePeriod: 7 * 24 * 3600, // 7 days
  priceRatio: 0,
  expired: false,
  globalRewardsRatio: 0,
  globalCapacityRatio: 2000,
};

describe('redeemPayout', function () {
  const priceBefore = parseEther('1.1');
  const productIdYbEth = 2;
  const productIdYbDai = 3;
  const getCoverSegment = async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const cover = { ...coverSegmentFixture };
    cover.start = timestamp + 1;
    return cover;
  };

  it("reverts if the address is not the cover owner's or approved", async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, cover, coverNFT } = fixture.contracts;
    const [coverOwner, nonCoverOwner] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const segment = await getCoverSegment();
    segment.amount = parseEther('10000');

    await cover.createMockCover(coverOwner.address, productIdYbEth, ASSET.ETH, [segment]);
    await cover.createMockCover(coverOwner.address, productIdYbEth, ASSET.ETH, [segment]);
    await cover.createMockCover(coverOwner.address, productIdYbEth, ASSET.ETH, [segment]);

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(productIdYbEth, priceBefore, currentTime + segment.period / 2, parseEther('100'), '');
    }

    await assessment.connect(coverOwner).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yieldTokenIncidents.connect(coverOwner).redeemPayout(0, 1, 0, parseEther('100'), coverOwner.address, []),
    ).not.to.be.revertedWith('Only the cover owner or approved addresses can redeem');

    await expect(
      yieldTokenIncidents.connect(nonCoverOwner).redeemPayout(0, 2, 0, parseEther('100'), coverOwner.address, []),
    ).to.be.revertedWith('Only the cover owner or approved addresses can redeem');

    await coverNFT.connect(coverOwner).approve(nonCoverOwner.address, 2);

    await expect(
      yieldTokenIncidents.connect(nonCoverOwner).redeemPayout(0, 2, 0, parseEther('100'), coverOwner.address, []),
    ).not.to.be.revertedWith('Only the cover owner or approved addresses can redeem');

    await expect(
      yieldTokenIncidents.connect(nonCoverOwner).redeemPayout(0, 3, 0, parseEther('100'), coverOwner.address, []),
    ).to.be.revertedWith('Only the cover owner or approved addresses can redeem');

    await coverNFT.connect(coverOwner).setApprovalForAll(nonCoverOwner.address, true);

    await expect(
      yieldTokenIncidents.connect(nonCoverOwner).redeemPayout(0, 4, 0, parseEther('100'), coverOwner.address, []),
    ).not.to.be.revertedWith('Only the cover owner or approved addresses can redeem');
  });

  it('reverts if the incident is not accepted', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, cover } = fixture.contracts;
    const [member1, member2] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const segment = await getCoverSegment();
    segment.amount = parseEther('10000');

    await cover.createMockCover(member1.address, productIdYbEth, ASSET.ETH, [segment]);

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(productIdYbEth, priceBefore, currentTime, parseEther('100'), '');
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('1'), member1.address, []),
    ).to.be.revertedWith('The incident needs to be accepted');

    await assessment.connect(member1).castVote(0, true, parseEther('100'));
    await assessment.connect(member2).castVote(0, false, parseEther('100'));

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(1));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('1'), member1.address, []),
    ).to.be.revertedWith('The incident needs to be accepted');

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(10));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('1'), member1.address, []),
    ).to.be.revertedWith('The incident needs to be accepted');
  });

  it("reverts if the voting and cooldown period haven't ended", async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, cover } = fixture.contracts;
    const [member1] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const segment = await getCoverSegment();
    segment.amount = parseEther('10000');

    await cover.createMockCover(member1.address, productIdYbEth, ASSET.ETH, [segment]);

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(productIdYbEth, priceBefore, currentTime, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(1));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('1'), member1.address, []),
    ).to.be.revertedWith('The voting and cooldown periods must end');

    const { end } = await assessment.getPoll(0);
    await setTime(end);

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('1'), member1.address, []),
    ).to.be.revertedWith('The voting and cooldown periods must end');

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }
  });

  it('reverts if the redemption period expired', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, cover } = fixture.contracts;
    const [member1] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const { payoutRedemptionPeriodInDays } = await yieldTokenIncidents.config();
    const { payoutCooldownInDays } = await assessment.config();
    const segment = await getCoverSegment();
    segment.amount = parseEther('10000');

    await cover.createMockCover(member1.address, productIdYbEth, ASSET.ETH, [segment]);

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(productIdYbEth, priceBefore, currentTime, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('1'), member1.address, []),
    ).to.be.revertedWith('The redemption period has expired');
  });

  it('reverts if the payout exceeds the covered amount', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, cover } = fixture.contracts;
    const [member1] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const { payoutCooldownInDays } = await assessment.config();
    const segment = await getCoverSegment();
    await cover.createMockCover(member1.address, productIdYbEth, ASSET.ETH, [segment]);

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(1));
    }

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(productIdYbEth, priceBefore, currentTime, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('101.011'), member1.address, []),
    ).to.be.revertedWith('Payout exceeds covered amount');

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('101.01'), member1.address, []),
    ).not.to.be.revertedWith('Payout exceeds covered amount');
  });

  it('reverts if the cover segment ends before the incident occured', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, cover } = fixture.contracts;
    const [member1] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const { payoutCooldownInDays } = await assessment.config();

    const segment0 = await getCoverSegment();
    const segment1 = await getCoverSegment();
    segment1.start += daysToSeconds('30');

    await cover.createMockCover(member1.address, productIdYbEth, ASSET.ETH, [segment0, segment1]);

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(31));
    }

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(productIdYbEth, priceBefore, currentTime, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Cover ended before the incident');
    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 1, parseEther('100'), member1.address, []),
    ).not.to.be.revertedWith('Cover ended before the incident');
  });

  it('reverts if the cover segment starts after or when the incident occured', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, cover } = fixture.contracts;
    const [member1] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const { payoutCooldownInDays } = await assessment.config();

    const { timestamp } = await ethers.provider.getBlock('latest');
    const segment0 = await getCoverSegment();
    const segment1 = await getCoverSegment();
    segment0.period = 1;
    segment1.start += 1;

    await cover.createMockCover(member1.address, productIdYbEth, ASSET.ETH, [segment0, segment1]);

    await yieldTokenIncidents
      .connect(governance)
      .submitIncident(productIdYbEth, priceBefore, timestamp + 2, parseEther('100'), '');

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(member1.address, productIdYbEth, ASSET.ETH, [
        {
          amount: parseEther('100'),
          start: timestamp + 1,
          period: daysToSeconds('30'),
          gracePeriod: 7,
          priceRatio: 0,
          expired: false,
          globalRewardsRatio: 0,
          globalCapacityRatio: 20000,
        },
      ]);
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 1, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Cover started after the incident');
    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 2, 0, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Cover started after the incident');
    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('100'), member1.address, []),
    ).not.to.be.revertedWith('Cover started after the incident');
  });

  it('reverts if the cover segment is outside the grace period', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, coverProducts, cover } = fixture.contracts;
    const [member1] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const { gracePeriod } = await coverProducts.getProductType(2);
    const segment0 = await getCoverSegment();
    segment0.gracePeriod = gracePeriod;
    const segment1 = { ...segment0 };
    segment1.period += gracePeriod;

    await cover.createMockCover(member1.address, productIdYbEth, ASSET.ETH, [segment0, segment1]);

    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    await setTime(currentTime + segment0.period + gracePeriod);
    await yieldTokenIncidents
      .connect(governance)
      .submitIncident(productIdYbEth, priceBefore, currentTime + segment0.period - 1, parseEther('100'), '');

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Grace period has expired');
    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 2, 0, parseEther('100'), member1.address, []),
    ).not.to.be.revertedWith('Grace period has expired');
  });

  it('should use coverSegment grace period and not product level grace period', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, coverProducts, cover } = fixture.contracts;
    const [member1] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const { gracePeriod } = await coverProducts.getProductType(2);

    const segment0 = await getCoverSegment();
    const segment1 = await getCoverSegment();
    segment0.gracePeriod = gracePeriod;
    segment1.gracePeriod = gracePeriod * 1000;

    await cover.createMockCover(member1.address, productIdYbEth, ASSET.ETH, [segment0, segment1]);

    const { timestamp: coverStartTime } = await ethers.provider.getBlock('latest');
    await setTime(coverStartTime + segment0.period + gracePeriod);

    // Change product grace period
    const newGracePeriod = gracePeriod * 1000;
    await coverProducts.connect(governance).editProductTypes([2], [newGracePeriod], ['ipfs hash']);
    const { gracePeriod: actualNewGracePeriod } = await coverProducts.getProductType(2);
    expect(actualNewGracePeriod).to.equal(newGracePeriod);

    await yieldTokenIncidents
      .connect(governance)
      .submitIncident(productIdYbEth, priceBefore, coverStartTime + segment0.period - 1, parseEther('100'), '');

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    const { payoutCooldownInDays } = await assessment.config();
    const { end } = await assessment.getPoll(0);
    await setTime(end + daysToSeconds(payoutCooldownInDays));

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Grace period has expired');
    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 2, 0, parseEther('100'), member1.address, []),
    ).to.not.be.revertedWith('Grace period has expired');
  });

  it("reverts if the cover's productId mismatches the incident's productId", async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, cover } = fixture.contracts;
    const [member1] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const validProductId = 2;
    const segment = await getCoverSegment();
    await cover.createMockCover(
      member1.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    await cover.createMockCover(
      member1.address,
      1, // productId
      ASSET.ETH,
      [segment],
    );
    await cover.createMockCover(
      member1.address,
      validProductId, // productId
      ASSET.ETH,
      [segment],
    );
    await cover.createMockCover(
      member1.address,
      3, // productId
      ASSET.ETH,
      [segment],
    );

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(validProductId, priceBefore, currentTime + segment.period / 2, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Product id mismatch');

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 2, 0, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Product id mismatch');

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 3, 0, parseEther('100'), member1.address, []),
    ).not.to.be.revertedWith('Product id mismatch');

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 4, 0, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Product id mismatch');
  });

  it('transfers ETH amount to payoutAddress, as per requested amount and priceBefore', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, cover, ybEth } = fixture.contracts;
    const [member1] = fixture.accounts.members;
    const [nonMember1, nonMember2] = fixture.accounts.nonMembers;
    const [governance] = fixture.accounts.governanceContracts;
    const segment = await getCoverSegment();
    segment.amount = parseEther('10000');

    await cover.createMockCover(member1.address, productIdYbEth, ASSET.ETH, [segment]);

    const { payoutDeductibleRatio } = await yieldTokenIncidents.config();
    const INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR = '10000';
    const coverAssetDecimals = parseEther('1');

    const ratio = priceBefore.mul(payoutDeductibleRatio);
    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(productIdYbEth, priceBefore, currentTime + segment.period / 2, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await ybEth.connect(member1).approve(yieldTokenIncidents.address, parseEther('10000'));

    // [warning] Cover mock does not subtract the covered amount
    {
      const claimedAmount = parseEther('100');
      const ethBalanceBefore = await ethers.provider.getBalance(member1.address);
      await setNextBlockBaseFee('0');
      await yieldTokenIncidents
        .connect(member1)
        .redeemPayout(0, 1, 0, claimedAmount, member1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(member1.address);
      expect(ethBalanceAfter).to.be.equal(
        ethBalanceBefore.add(
          claimedAmount.mul(ratio).div(INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR).div(coverAssetDecimals),
        ),
      );
    }

    {
      const claimedAmount = parseEther('111');
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yieldTokenIncidents
        .connect(member1)
        .redeemPayout(0, 1, 0, claimedAmount, nonMember1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember1.address);
      expect(ethBalanceAfter).to.be.equal(
        ethBalanceBefore.add(
          claimedAmount.mul(ratio).div(INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR).div(coverAssetDecimals),
        ),
      );
    }

    {
      const claimedAmount = parseEther('3000');
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember2.address);
      await setNextBlockBaseFee('0');
      await yieldTokenIncidents
        .connect(member1)
        .redeemPayout(0, 1, 0, claimedAmount, nonMember2.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember2.address);
      expect(ethBalanceAfter).to.be.equal(
        ethBalanceBefore.add(
          claimedAmount.mul(ratio).div(INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR).div(coverAssetDecimals),
        ),
      );
    }
  });

  it('transfers DAI amount to payoutAddress, as per requested amount and priceBefore', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, cover, ybEth, dai } = fixture.contracts;
    const [member1] = fixture.accounts.members;
    const [nonMember1, nonMember2] = fixture.accounts.nonMembers;
    const [governance] = fixture.accounts.governanceContracts;
    const segment = await getCoverSegment();
    segment.amount = parseEther('10000');

    await cover.createMockCover(member1.address, productIdYbEth, ASSET.DAI, [segment]);

    const { payoutDeductibleRatio } = await yieldTokenIncidents.config();
    const INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR = '10000';
    const coverAssetDecimals = ethers.BigNumber.from('10').pow(await dai.decimals());

    const ratio = priceBefore.mul(payoutDeductibleRatio);
    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(productIdYbEth, priceBefore, currentTime + segment.period / 2, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await ybEth.connect(member1).approve(yieldTokenIncidents.address, parseEther('10000'));

    // [warning] Cover mock does not subtract the covered amount
    {
      const claimedAmount = parseEther('100');
      const daiBalanceBefore = await dai.balanceOf(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yieldTokenIncidents
        .connect(member1)
        .redeemPayout(0, 1, 0, claimedAmount, nonMember1.address, [], { gasPrice: 0 });
      const daiBalanceAfter = await dai.balanceOf(nonMember1.address);
      expect(daiBalanceAfter).to.be.equal(
        daiBalanceBefore.add(
          claimedAmount.mul(ratio).div(INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR).div(coverAssetDecimals),
        ),
      );
    }

    {
      const claimedAmount = parseEther('111');
      const daiBalanceBefore = await dai.balanceOf(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yieldTokenIncidents
        .connect(member1)
        .redeemPayout(0, 1, 0, claimedAmount, nonMember1.address, [], { gasPrice: 0 });
      const daiBalanceAfter = await dai.balanceOf(nonMember1.address);
      expect(daiBalanceAfter).to.be.equal(
        daiBalanceBefore.add(
          claimedAmount.mul(ratio).div(INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR).div(coverAssetDecimals),
        ),
      );
    }

    {
      const claimedAmount = parseEther('3000');
      const daiBalanceBefore = await dai.balanceOf(nonMember2.address);
      await setNextBlockBaseFee('0');
      await yieldTokenIncidents
        .connect(member1)
        .redeemPayout(0, 1, 0, claimedAmount, nonMember2.address, [], { gasPrice: 0 });
      const daiBalanceAfter = await dai.balanceOf(nonMember2.address);
      expect(daiBalanceAfter).to.be.equal(
        daiBalanceBefore.add(
          claimedAmount.mul(ratio).div(INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR).div(coverAssetDecimals),
        ),
      );
    }
  });

  it("uses permit when it's provided in optionalParams", async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, cover, ybPermitDai, dai } = fixture.contracts;
    const [member1] = fixture.accounts.members;
    const [nonMember] = fixture.accounts.nonMembers;
    const [governance] = fixture.accounts.governanceContracts;
    const segment = await getCoverSegment();
    segment.amount = parseEther('10000');
    const productId = 4;

    await cover.createMockCover(member1.address, productId, ASSET.DAI, [segment]);

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(productId, priceBefore, currentTime + segment.period / 2, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    let permit, permitDeadline;
    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      permitDeadline = currentTime + daysToSeconds(1);
      permit = await signPermit(
        member1,
        ybPermitDai,
        network.config.chainId,
        yieldTokenIncidents.address,
        parseEther('3000'),
        permitDeadline,
        '1',
      );
    }

    const daiBalanceBefore = await dai.balanceOf(nonMember.address);

    const parsePermitParam = ({ owner, spender, value, deadline, v, r, s }) => [
      ...arrayify(hexZeroPad(owner, 32)),
      ...arrayify(hexZeroPad(spender, 32)),
      ...arrayify(hexZeroPad(hexValue(value), 32)),
      ...arrayify(hexZeroPad(deadline, 32)),
      ...arrayify(hexZeroPad(v, 32)),
      ...arrayify(hexZeroPad(r, 32)),
      ...arrayify(hexZeroPad(s, 32)),
    ];

    await setNextBlockBaseFee('0');
    await yieldTokenIncidents.connect(member1).redeemPayout(
      0,
      1,
      0,
      parseEther('3000'),
      nonMember.address,
      parsePermitParam({
        owner: member1.address,
        spender: yieldTokenIncidents.address,
        value: parseEther('3000'),
        deadline: permitDeadline,
        v: permit.v,
        r: permit.r,
        s: permit.s,
      }),
      { gasPrice: 0 },
    );
    const daiBalanceAfter = await dai.balanceOf(nonMember.address);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(parseEther('2970')));
  });

  it('emits IncidentPayoutRedeemed event with owner, payout amount, incident and cover ids', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, cover, assessment, ybEth, ybDai } = fixture.contracts;
    const [coverOwner1, coverOwner2, member] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const { timestamp } = await ethers.provider.getBlock('latest');
    const segment = await getCoverSegment();

    await cover.createMockCover(coverOwner1.address, productIdYbEth, ASSET.ETH, [segment]);
    await cover.createMockCover(coverOwner1.address, productIdYbEth, ASSET.ETH, [segment]);
    await cover.createMockCover(coverOwner2.address, productIdYbDai, ASSET.DAI, [segment]);

    await yieldTokenIncidents
      .connect(governance)
      .submitIncident(productIdYbEth, parseEther('1'), timestamp + 2, parseEther('100'), '');

    await yieldTokenIncidents
      .connect(governance)
      .submitIncident(productIdYbDai, parseEther('1'), timestamp + 2, parseEther('100'), '');

    await assessment.connect(member).castVote(0, true, parseEther('100'));
    await assessment.connect(member).castVote(1, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(1);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await ybEth.connect(coverOwner1).approve(yieldTokenIncidents.address, parseEther('10000'));
    await expect(
      yieldTokenIncidents.connect(coverOwner1).redeemPayout(0, 1, 0, parseEther('100'), coverOwner1.address, []),
    )
      .to.emit(yieldTokenIncidents, 'IncidentPayoutRedeemed')
      .withArgs(coverOwner1.address, parseEther('90'), 0, 1);

    await ybDai.connect(coverOwner2).approve(yieldTokenIncidents.address, parseEther('10000'));
    await expect(
      yieldTokenIncidents.connect(coverOwner2).redeemPayout(1, 3, 0, parseEther('100'), coverOwner2.address, []),
    )
      .to.emit(yieldTokenIncidents, 'IncidentPayoutRedeemed')
      .withArgs(coverOwner2.address, parseEther('90'), 1, 3);
  });

  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, cover, assessment, ybEth, master } = fixture.contracts;
    const [coverOwner1, member] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const { timestamp } = await ethers.provider.getBlock('latest');
    const segment = await getCoverSegment();
    await cover.createMockCover(coverOwner1.address, productIdYbEth, ASSET.ETH, [segment]);

    await yieldTokenIncidents
      .connect(governance)
      .submitIncident(productIdYbEth, parseEther('1'), timestamp + 2, parseEther('100'), '');

    await assessment.connect(member).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await master.pause();

    await ybEth.connect(coverOwner1).approve(yieldTokenIncidents.address, parseEther('10000'));
    await expect(
      yieldTokenIncidents.connect(coverOwner1).redeemPayout(0, 1, 0, parseEther('100'), coverOwner1.address, []),
    ).to.be.revertedWith('System is paused');
  });

  it('reverts if caller is not a member', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, cover, assessment, ybEth } = fixture.contracts;
    const [coverOwner1, member] = fixture.accounts.members;
    const [nonMember] = fixture.accounts.nonMembers;
    const [governance] = fixture.accounts.governanceContracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const segment = await getCoverSegment();
    await cover.createMockCover(coverOwner1.address, productIdYbEth, ASSET.ETH, [segment]);

    await yieldTokenIncidents
      .connect(governance)
      .submitIncident(productIdYbEth, parseEther('1'), timestamp + 2, parseEther('100'), '');

    await assessment.connect(member).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await ybEth.connect(coverOwner1).approve(yieldTokenIncidents.address, parseEther('10000'));
    await expect(
      yieldTokenIncidents.connect(nonMember).redeemPayout(0, 1, 0, parseEther('100'), coverOwner1.address, []),
    ).to.be.revertedWith('Caller is not a member');
  });

  it('triggers twap update when fetching the token price', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, cover, assessment, ybEth, ramm } = fixture.contracts;
    const [coverOwner1, member] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const segment = await getCoverSegment();
    await cover.createMockCover(coverOwner1.address, productIdYbEth, ASSET.ETH, [segment]);

    await yieldTokenIncidents
      .connect(governance)
      .submitIncident(productIdYbEth, parseEther('1'), timestamp + 2, parseEther('100'), '');

    await assessment.connect(member).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await ybEth.connect(coverOwner1).approve(yieldTokenIncidents.address, parseEther('10000'));
    await expect(
      yieldTokenIncidents.connect(coverOwner1).redeemPayout(0, 1, 0, parseEther('100'), coverOwner1.address, []),
    ).to.emit(ramm, 'TwapUpdateTriggered');
  });

  it('should transfer product underlying asset amount to the contract', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, cover, ybEth } = fixture.contracts;
    const [member1] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const segment = await getCoverSegment();
    segment.amount = parseEther('10000');

    await cover.createMockCover(member1.address, productIdYbEth, ASSET.ETH, [segment]);

    const depeggedTokensAmount = parseEther('100');
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    await yieldTokenIncidents
      .connect(governance)
      .submitIncident(productIdYbEth, priceBefore, currentTime + segment.period / 2, depeggedTokensAmount, '');

    await assessment.connect(member1).castVote(0, true, depeggedTokensAmount);

    const { payoutCooldownInDays } = await assessment.config();
    const { end } = await assessment.getPoll(0);
    await setTime(end + daysToSeconds(payoutCooldownInDays));

    await ybEth.connect(member1).approve(yieldTokenIncidents.address, parseEther('10000'));

    const ybEthContractBalanceBefore = await ybEth.balanceOf(yieldTokenIncidents.address);
    const ybEthMemberBalanceBefore = await ybEth.balanceOf(member1.address);

    await setNextBlockBaseFee('0');
    await yieldTokenIncidents
      .connect(member1)
      .redeemPayout(0, 1, 0, depeggedTokensAmount, member1.address, [], { gasPrice: 0 });
    const ybEthContractBalanceAfter = await ybEth.balanceOf(yieldTokenIncidents.address);
    const ybEthMemberBalanceAfter = await ybEth.balanceOf(member1.address);

    expect(ybEthContractBalanceAfter).to.be.equal(ybEthContractBalanceBefore.add(depeggedTokensAmount));
    expect(ybEthMemberBalanceAfter).to.be.equal(ybEthMemberBalanceBefore.sub(depeggedTokensAmount));
  });

  it('should burn the stake of associated staking pools', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, assessment, cover, ybEth } = fixture.contracts;
    const [member1] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const segment = await getCoverSegment();
    segment.amount = parseEther('10000');

    await cover.createMockCover(member1.address, productIdYbEth, ASSET.ETH, [segment]);

    const depeggedTokensAmount = parseEther('100');
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

    const { payoutDeductibleRatio } = await yieldTokenIncidents.config();
    const INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR = '10000';
    const coverAssetDecimals = parseEther('1');

    await yieldTokenIncidents
      .connect(governance)
      .submitIncident(productIdYbEth, priceBefore, currentTime + segment.period / 2, depeggedTokensAmount, '');

    await assessment.connect(member1).castVote(0, true, depeggedTokensAmount);

    const { payoutCooldownInDays } = await assessment.config();
    const { end } = await assessment.getPoll(0);
    await setTime(end + daysToSeconds(payoutCooldownInDays));

    await ybEth.connect(member1).approve(yieldTokenIncidents.address, parseEther('10000'));

    await setNextBlockBaseFee('0');
    await yieldTokenIncidents
      .connect(member1)
      .redeemPayout(0, 1, 0, depeggedTokensAmount, member1.address, [], { gasPrice: 0 });

    const { amount } = await cover.burnStakeCalledWith();

    const ratio = priceBefore.mul(payoutDeductibleRatio);
    const expectedAmount = depeggedTokensAmount
      .mul(ratio)
      .div(INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR)
      .div(coverAssetDecimals);

    expect(amount).to.be.equal(expectedAmount);
  });
});
