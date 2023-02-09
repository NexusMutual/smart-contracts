const { ethers } = require('hardhat');
const { expect } = require('chai');

const { stake } = require('../utils/staking');
const { buyCover, transferCoverAsset } = require('../utils/cover');

const { daysToSeconds } = require('../utils').helpers;
const { mineNextBlock, setNextBlockTime, setNextBlockBaseFee, setEtherBalance } = require('../../utils/evm');

const { parseEther, parseUnits } = ethers.utils;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const usdcDecimals = 6;

const submitClaimFixture = {
  period: 3600 * 24 * 30, // 30 days
  gracePeriod: 3600 * 24 * 30,
  amount: parseEther('10'),
  priceDenominator: 10000,
};

async function transferYieldToken({ tokenOwner, coverBuyer, yToken, yc }) {
  await yToken.connect(tokenOwner).transfer(coverBuyer.address, parseEther('100'));
  await yToken.connect(coverBuyer).approve(yc.address, parseEther('100'));
}

async function submitIncident({ gv, yc, productId, period, priceBefore }) {
  const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

  const gvSigner = await ethers.getImpersonatedSigner(gv.address);
  await setEtherBalance(gvSigner.address, ethers.utils.parseEther('1'));

  await yc.connect(gvSigner).submitIncident(productId, priceBefore, currentTime + period / 2, parseEther('100'), '');
}

describe('submitClaim', function () {
  beforeEach(async function () {
    const { tk } = this.contracts;
    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('30000');

    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }
  });

  it('submits ETH claim and approves claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, yc, ybETH, gv } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;

    const { period, gracePeriod, amount, priceDenominator } = submitClaimFixture;

    const productId = 2; // ybETH
    const coverAsset = 0; // ETH

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, yToken: ybETH, yc });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // submit incident
    await submitIncident({ gv, yc, productId, period, priceBefore: parseEther('1.1') });

    // accept incident
    await as.connect(staker1).castVotes([0], [true], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();
      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yc.connect(coverBuyer1).redeemPayout(0, 1, 0, parseEther('1'), nonMember1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('0.99')));
    }
    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yc.connect(coverBuyer1).redeemPayout(0, 1, 0, parseEther('1.11'), nonMember1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('1.0989')));
    }

    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yc.connect(coverBuyer1).redeemPayout(0, 1, 0, parseEther('3'), nonMember1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('2.970')));
    }
  });

  it('submits DAI claim and approves claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, dai, yc, ybDAI, gv } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;

    const { period, gracePeriod, amount, priceDenominator } = submitClaimFixture;

    const productId = 3;
    const coverAsset = 1; // DAI

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets cover asset
    await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, asset: dai, cover });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, yToken: ybDAI, yc });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // submit incident
    await submitIncident({ gv, yc, productId, period, priceBefore: parseEther('1.1') });

    // accept incident
    await as.connect(staker1).castVotes([0], [true], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();
      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    {
      const daiBalanceBefore = await dai.balanceOf(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yc.connect(coverBuyer1).redeemPayout(0, 1, 0, parseEther('1'), nonMember1.address, [], { gasPrice: 0 });
      const daiBalanceAfter = await dai.balanceOf(nonMember1.address);
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(parseEther('0.99')));
    }
    {
      const daiBalanceBefore = await dai.balanceOf(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yc.connect(coverBuyer1).redeemPayout(0, 1, 0, parseEther('1.11'), nonMember1.address, [], { gasPrice: 0 });
      const daiBalanceAfter = await dai.balanceOf(nonMember1.address);
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(parseEther('1.0989')));
    }

    {
      const ethBalanceBefore = await dai.balanceOf(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yc.connect(coverBuyer1).redeemPayout(0, 1, 0, parseEther('3'), nonMember1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await dai.balanceOf(nonMember1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('2.970')));
    }
  });

  it('submits ETH claim and rejects claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, yc, ybETH, gv } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;

    const { period, gracePeriod, amount, priceDenominator } = submitClaimFixture;

    const productId = 2; // ybETH
    const coverAsset = 0; // ETH

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, yToken: ybETH, yc });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // submit incident
    await submitIncident({ gv, yc, productId, period, priceBefore: parseEther('1.1') });

    // reject incident (requires at least 1 positive vote)
    await as.connect(staker1).castVotes([0], [true], ['Assessment data hash'], parseEther('100'));
    await as.connect(staker2).castVotes([0], [false], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();
      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await setNextBlockBaseFee('0');
    await expect(
      yc.connect(coverBuyer1).redeemPayout(0, 1, 0, parseEther('1'), nonMember1.address, [], { gasPrice: 0 }),
    ).to.be.revertedWith('The incident needs to be accepted');
  });

  it('submits DAI claim and rejects claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, dai, yc, ybDAI, gv } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;

    const { period, gracePeriod, amount, priceDenominator } = submitClaimFixture;

    const productId = 3;
    const coverAsset = 1; // DAI

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets cover asset
    await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, asset: dai, cover });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, yToken: ybDAI, yc });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // submit incident
    await submitIncident({ gv, yc, productId, period, priceBefore: parseEther('1.1') });

    // reject incident
    await as.connect(staker1).castVotes([0], [true], ['Assessment data hash'], parseEther('100'));
    await as.connect(staker2).castVotes([0], [false], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();
      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yc.connect(coverBuyer1).redeemPayout(0, 1, 0, parseEther('1'), nonMember1.address, []),
    ).to.be.revertedWith('The incident needs to be accepted');
  });

  it('submits and redeems full amount of ETH claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, yc, ybETH, gv } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;

    const { period, gracePeriod, amount, priceDenominator } = submitClaimFixture;

    const productId = 2; // ybETH
    const coverAsset = 0; // ETH

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, yToken: ybETH, yc });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // submit incident
    await submitIncident({ gv, yc, productId, period, priceBefore: parseEther('1') });

    // accept incident
    await as.connect(staker1).castVotes([0], [true], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();
      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    const ethBalanceBefore = await ethers.provider.getBalance(nonMember1.address);
    await setNextBlockBaseFee('0');
    const exactAmountToRedeemFullCover = parseEther('11.111111111111111112');
    await yc
      .connect(coverBuyer1)
      .redeemPayout(0, 1, 0, exactAmountToRedeemFullCover, nonMember1.address, [], { gasPrice: 0 });
    const ethBalanceAfter = await ethers.provider.getBalance(nonMember1.address);
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(amount));
  });

  it('submits and redeems full amount of DAI claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, dai, yc, ybDAI, gv } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;

    const { amount, period, gracePeriod, priceDenominator } = submitClaimFixture;

    const productId = 3;
    const coverAsset = 1; // DAI

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets cover asset
    await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, asset: dai, cover });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, yToken: ybDAI, yc });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // submit incident
    await submitIncident({ gv, yc, productId, period, priceBefore: parseEther('1') });

    // accept incident
    await as.connect(staker1).castVotes([0], [true], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();
      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    const daiBalanceBefore = await dai.balanceOf(nonMember1.address);
    const exactAmountToRedeemFullCover = parseEther('11.111111111111111112');
    await yc.connect(coverBuyer1).redeemPayout(0, 1, 0, exactAmountToRedeemFullCover, nonMember1.address, []);
    const daiBalanceAfter = await dai.balanceOf(nonMember1.address);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(amount));
  });

  it('submits and redeems claims from multiple users', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, yc, ybETH, gv } = this.contracts;
    const [coverBuyer1, coverBuyer2, coverBuyer3, staker1] = this.accounts.members;
    const [nonMember1, nonMember2, nonMember3] = this.accounts.nonMembers;

    const { period, gracePeriod, amount, priceDenominator } = submitClaimFixture;

    const productId = 2; // ybETH
    const coverAsset = 0; // ETH

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // coverBuyer1 gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, yToken: ybETH, yc });

    // coverBuyer2 gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer2, yToken: ybETH, yc });

    // coverBuyer3 gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer3, yToken: ybETH, yc });

    // Buy Cover coverBuyer1
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Buy Cover coverBuyer2
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer2,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Buy Cover coverBuyer3
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer3,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // submit incident
    await submitIncident({ gv, yc, productId, period, priceBefore: parseEther('1') });

    // accept incident
    await as.connect(staker1).castVotes([0], [true], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();
      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    const exactAmountToRedeemFullCover = parseEther('11.111111111111111112');

    // Redeem payout coverBuyer1
    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember1.address);

      await yc.connect(coverBuyer1).redeemPayout(0, 1, 0, exactAmountToRedeemFullCover, nonMember1.address, []);

      const ethBalanceAfter = await ethers.provider.getBalance(nonMember1.address);

      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(amount));
    }

    // Redeem payout coverBuyer2
    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember2.address);

      await yc.connect(coverBuyer2).redeemPayout(0, 2, 0, exactAmountToRedeemFullCover, nonMember2.address, []);

      const ethBalanceAfter = await ethers.provider.getBalance(nonMember2.address);

      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(amount));
    }

    // Redeem payout coverBuyer3
    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember3.address);

      await yc.connect(coverBuyer3).redeemPayout(0, 3, 0, exactAmountToRedeemFullCover, nonMember3.address, []);

      const ethBalanceAfter = await ethers.provider.getBalance(nonMember3.address);

      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(amount));
    }
  });

  it('submits and redeems claims from multiple products', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, yc, ybETH, gv, dai, ybDAI } = this.contracts;
    const [coverBuyer1, coverBuyer2, staker1] = this.accounts.members;
    const [nonMember1, nonMember2] = this.accounts.nonMembers;

    const { period, gracePeriod, amount, priceDenominator } = submitClaimFixture;

    // Buy cover for product 2
    {
      const productId = 2; // ybETH
      const coverAsset = 0; // ETH

      // Stake to open up capacity
      await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

      // cover buyer gets yield token
      await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, yToken: ybETH, yc });

      // Buy Cover
      await buyCover({
        amount,
        productId,
        coverAsset,
        period,
        cover,
        coverBuyer: coverBuyer1,
        targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
        priceDenominator,
      });

      // submit incident
      await submitIncident({ gv, yc, productId, period, priceBefore: parseEther('1') });

      // accept incident
      await as.connect(staker1).castVotes([0], [true], ['Assessment data hash'], parseEther('100'));
    }

    // Buy cover for product 3
    {
      const productId = 3;
      const coverAsset = 1; // DAI

      // Stake to open up capacity
      await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

      // cover buyer gets cover asset
      await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer2, asset: dai, cover });

      // cover buyer gets yield token
      await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer2, yToken: ybDAI, yc });

      // Buy Cover
      await buyCover({
        amount,
        productId,
        coverAsset,
        period,
        cover,
        coverBuyer: coverBuyer2,
        targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
        priceDenominator,
      });

      // submit incident
      await submitIncident({ gv, yc, productId, period, priceBefore: parseEther('1') });

      // accept incident
      await as.connect(staker1).castVotes([1], [true], ['Assessment data hash'], parseEther('100'));
    }

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();
      const { end } = await as.getPoll(1);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    const exactAmountToRedeemFullCover = parseEther('11.111111111111111112');

    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yc
        .connect(coverBuyer1)
        .redeemPayout(0, 1, 0, exactAmountToRedeemFullCover, nonMember1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(amount));
    }

    {
      const daiBalanceBefore = await dai.balanceOf(nonMember2.address);
      await yc.connect(coverBuyer2).redeemPayout(1, 2, 0, exactAmountToRedeemFullCover, nonMember2.address, []);
      const daiBalanceAfter = await dai.balanceOf(nonMember2.address);
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(amount));
    }
  });

  it('submits USDC claim and approves claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, usdc, yc, ybUSDC, gv } = this.contracts;
    const [coverBuyer, staker] = this.accounts.members;
    const [nonMember] = this.accounts.nonMembers;

    const { period, gracePeriod, priceDenominator } = submitClaimFixture;

    const amount = parseUnits('10', usdcDecimals);
    const productId = 5;
    const coverAsset = 4; // usdc

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker, productId, period, gracePeriod });

    // cover buyer gets cover asset
    await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer, asset: usdc, cover });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer, yToken: ybUSDC, yc });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // submit incident
    await submitIncident({ gv, yc, productId, period, priceBefore: parseUnits('1', usdcDecimals) });

    // accept incident
    await as.connect(staker).castVotes([0], [true], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();
      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    const usdcBalanceBefore = await usdc.balanceOf(nonMember.address);
    await yc.connect(coverBuyer).redeemPayout(0, 1, 0, parseUnits('1', usdcDecimals), nonMember.address, []);
    const usdcBalanceAfter = await usdc.balanceOf(nonMember.address);
    expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(parseUnits('0.9', usdcDecimals)));
  });

  it('submits and redeems full amount of USDC claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, usdc, yc, ybUSDC, gv } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;

    const { period, gracePeriod, priceDenominator } = submitClaimFixture;

    const amount = parseUnits('10', usdcDecimals);

    const productId = 5;
    const coverAsset = 4; // usdc

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets cover asset
    await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, asset: usdc, cover });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, yToken: ybUSDC, yc });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // submit incident
    await submitIncident({ gv, yc, productId, period, priceBefore: parseUnits('1', usdcDecimals) });

    // accept incident
    await as.connect(staker1).castVotes([0], [true], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();
      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    const usdcBalanceBefore = await usdc.balanceOf(nonMember1.address);
    const exactAmountToRedeemFullCover = parseUnits('11.111112', usdcDecimals);
    await yc.connect(coverBuyer1).redeemPayout(0, 1, 0, exactAmountToRedeemFullCover, nonMember1.address, []);
    const usdcBalanceAfter = await usdc.balanceOf(nonMember1.address);
    expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(amount));
  });
});
