const { ethers } = require('hardhat');
const { expect } = require('chai');
const base64 = require('base64-js');
const { parseEther, formatEther } = ethers.utils;
const { AddressZero, MaxUint256, One } = ethers.constants;
const { daysToSeconds } = require('../../../lib/helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/').evm;
const { assetWithPrecisionLoss } = require('../utils/assetPricing');
const { USDC_ASSET_ID, DAI_ASSET_ID, ETH_ASSET_ID } = require('../utils/cover');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

const JSON_HEADER = 'data:application/json;base64,';
const SVG_HEADER = 'data:image/svg+xml;base64,';

async function coverNFTDescriptorSetup() {
  const fixture = await loadFixture(setup);
  const {
    members: [staker, coverBuyer],
    stakingPoolManagers: [, , stakingPoolManager],
  } = fixture.accounts;
  const {
    stakingProducts,
    stakingPool1,
    stakingPool3,
    cover,
    dai,
    usdc,
    tk: nxm,
    tc: tokenController,
  } = fixture.contracts;

  const { TRANCHE_DURATION } = fixture.config;

  const stakingAmount = parseEther('500');
  const usdcProductId = 3;

  // Move to beginning of next block
  const { timestamp } = await ethers.provider.getBlock('latest');
  const trancheId = Math.floor(timestamp / TRANCHE_DURATION);

  const depositTrancheId = trancheId + 2;
  await stakingPool1.connect(staker).depositTo(
    stakingAmount,
    depositTrancheId,
    0, // new position
    AddressZero,
  );

  // Cover details
  const poolId = await stakingPool1.getPoolId();
  const amount = parseEther('4.20');
  const targetPrice = fixture.DEFAULT_PRODUCTS[0].targetPrice;
  const priceDenominator = 10000;
  const coverAsset = ETH_ASSET_ID; // ETH
  const expectedPremium = amount.mul(targetPrice).div(priceDenominator);

  // buy eth cover (tokenId = 1)
  await cover.connect(coverBuyer).buyCover(
    {
      coverId: 0, // new cover
      owner: coverBuyer.address,
      productId: 0,
      coverAsset,
      amount,
      period: daysToSeconds(30),
      maxPremiumInAsset: expectedPremium,
      paymentAsset: coverAsset,
      payWitNXM: false,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
    },
    [{ poolId, coverAmountInAsset: amount.toString() }],
    {
      value: expectedPremium,
    },
  );

  // buy dai cover (tokenId = 2)
  await dai.mint(coverBuyer.address, amount);
  await dai.connect(coverBuyer).approve(cover.address, MaxUint256);

  await cover.connect(coverBuyer).buyCover(
    {
      coverId: 0, // new cover
      owner: coverBuyer.address,
      productId: 0,
      coverAsset: DAI_ASSET_ID, // DAI
      amount,
      period: daysToSeconds(30),
      maxPremiumInAsset: expectedPremium,
      paymentAsset: DAI_ASSET_ID,
      payWitNXM: false,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
    },
    [{ poolId, coverAmountInAsset: amount.toString() }],
  );

  // buy usdc cover (tokenId = 3)
  const usdcCoverAmount = One.mul(12311e4); // 123.11 USDC
  const usdcStakingAmount = parseEther('100');
  {
    const poolId = await stakingPool3.getPoolId();
    // Add usdc product to pool
    await stakingProducts.connect(stakingPoolManager).setProducts(poolId, [
      {
        productId: usdcProductId,
        targetPrice: 1000,
        targetWeight: 100,
        setTargetWeight: true,
        setTargetPrice: true,
        recalculateEffectiveWeight: true,
      },
    ]);

    // Stake into usdc compatible pool
    nxm.connect(staker).approve(tokenController.address, MaxUint256);
    await stakingPool3.connect(staker).depositTo(
      usdcStakingAmount,
      depositTrancheId,
      0, // new position
      AddressZero,
    );

    await usdc.mint(coverBuyer.address, usdcCoverAmount);
    await usdc.connect(coverBuyer).approve(cover.address, MaxUint256);
    await cover.connect(coverBuyer).buyCover(
      {
        coverId: 0, // new cover
        owner: coverBuyer.address,
        productId: usdcProductId,
        coverAsset: USDC_ASSET_ID, // usdc (0b10000)
        amount: usdcCoverAmount,
        period: daysToSeconds(30),
        maxPremiumInAsset: expectedPremium,
        paymentAsset: USDC_ASSET_ID,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: usdcCoverAmount }],
    );
  }

  return {
    ...fixture,
    amount,
    usdcAmount: usdcCoverAmount,
  };
}

describe('CoverNFTDescriptor', function () {
  it('tokenURI json output should be formatted properly', async function () {
    const fixture = await loadFixture(coverNFTDescriptorSetup);
    const { coverNFT, p1: pool } = fixture.contracts;

    const uri = await coverNFT.tokenURI(1);
    expect(uri.slice(0, JSON_HEADER.length)).to.be.equal(JSON_HEADER);

    // name/description
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(JSON_HEADER.length))));
    expect(decodedJson.name).to.be.equal('Nexus Mutual Cover');
    expect(decodedJson.description.length).to.be.gt(0);
    expect(decodedJson.description).to.contain('ETH');

    // image
    const expectedAmountWithPrecisionLoss = await assetWithPrecisionLoss(
      pool,
      fixture.amount,
      ETH_ASSET_ID,
      fixture.config,
    );
    const expectedAmountRaw = formatEther(expectedAmountWithPrecisionLoss);
    const expectedAmount = Number(expectedAmountRaw).toFixed(2);

    expect(decodedJson.image.slice(0, SVG_HEADER.length)).to.be.equal(SVG_HEADER);
    const decodedSvg = new TextDecoder().decode(base64.toByteArray(decodedJson.image.slice(SVG_HEADER.length)));

    expect(decodedSvg).matches(/<tspan>Product 0<\/tspan>/);
    expect(decodedSvg).to.contain('ETH');
    expect(decodedSvg).to.not.contain('DAI');
    expect(decodedSvg).to.not.contain('USDC');
    // coverID = 1
    expect(decodedSvg).matches(/<tspan>1<\/tspan>/);
    expect(decodedSvg).to.contain(expectedAmount);
  });

  it('should handle dai covers', async function () {
    const fixture = await loadFixture(coverNFTDescriptorSetup);
    const { coverNFT } = fixture.contracts;

    const uri = await coverNFT.tokenURI(2);
    expect(uri.slice(0, JSON_HEADER.length)).to.be.equal(JSON_HEADER);

    // name/description
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(JSON_HEADER.length))));
    expect(decodedJson.description).to.contain('DAI');
  });

  it('should handle usdc covers', async function () {
    const fixture = await loadFixture(coverNFTDescriptorSetup);
    const { coverNFT, p1: pool } = fixture.contracts;

    const uri = await coverNFT.tokenURI(3);
    expect(uri.slice(0, JSON_HEADER.length)).to.be.equal(JSON_HEADER);

    // let expectedAmountRaw = await assetWithPrecisionLoss(pool, fixture.usdcAmount, USDC_ASSET_ID, fixture.config);
    // placeholder line to calm the linter
    await assetWithPrecisionLoss(pool, fixture.usdcAmount, USDC_ASSET_ID, fixture.config);
    // expectedAmountRaw = ethers.utils.formatUnits(expectedAmountRaw, 6);
    // const expectedAmount = Number(expectedAmountRaw).toFixed(2);

    // name/description
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(JSON_HEADER.length))));
    expect(decodedJson.description).to.contain('USDC');
    // TODO: calculate exact amount
    // expect(decodedJson.description).to.contain(expectedAmount);

    // image
    expect(decodedJson.image.slice(0, SVG_HEADER.length)).to.be.equal(SVG_HEADER);
    const decodedSvg = new TextDecoder().decode(base64.toByteArray(decodedJson.image.slice(SVG_HEADER.length)));

    expect(decodedSvg.length).to.be.gt(0);
    expect(decodedSvg).to.contain('USDC');
    expect(decodedSvg).to.not.contain('ETH');
    expect(decodedSvg).to.not.contain('DAI');
    // coverID = 3
    expect(decodedSvg).matches(/<tspan>3<\/tspan>/);
    // TODO: calculate exact amount
    // expect(decodedSvg).to.contain(expectedAmount);
  });

  it('should handle expired token', async function () {
    const fixture = await loadFixture(coverNFTDescriptorSetup);
    const { coverNFT, cover } = fixture.contracts;

    // expire cover
    const coverData = await cover.getCoverData(1);
    const expiryTimestamp = coverData.start + coverData.period;
    await setNextBlockTime(expiryTimestamp);
    await mineNextBlock();

    // decode uri
    const uri = await coverNFT.tokenURI(1);
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(JSON_HEADER.length))));

    // get expected expiry date string
    const expectedExpiryDate = new Date(expiryTimestamp * 1000 /* milliseconds */);
    const dateStringWithDay = expectedExpiryDate.toDateString();
    // remove day of week
    const dateString = dateStringWithDay.slice(3);

    expect(decodedJson.description).to.contain(dateString);
    expect(decodedJson.description).to.contain('This cover NFT has already expired');

    // check that javascript can parse the date
    expect(new Date(dateString).toDateString()).to.be.equal(dateStringWithDay);
  });

  it('should handle token that expired decades ago', async function () {
    const fixture = await loadFixture(coverNFTDescriptorSetup);
    const { coverNFT, cover } = fixture.contracts;

    // get cover segment
    const coverData = await cover.getCoverData(1);

    const expiryTimestamp = coverData.start + coverData.period;
    const timeAtQuery = expiryTimestamp + daysToSeconds(365 * 20);
    // expire cover
    await setNextBlockTime(timeAtQuery);
    await mineNextBlock();

    const uri = await coverNFT.tokenURI(1);
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(JSON_HEADER.length))));
    const expectedExpiryDate = new Date(expiryTimestamp * 1000 /* milliseconds */);
    const dateStringWithDay = expectedExpiryDate.toDateString();
    // remove day of week
    const dateString = dateStringWithDay.slice(3);

    expect(decodedJson.description).to.contain(dateString);
    expect(decodedJson.description).to.contain('This cover NFT has already expired');

    // check that javascript can parse the date
    expect(new Date(dateString).toDateString()).to.be.equal(dateStringWithDay);
  });
});
