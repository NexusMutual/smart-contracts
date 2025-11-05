const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const base64 = require('base64-js');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { daysToSeconds } = require('../utils/helpers');
const setup = require('../setup');

const { calculatePremium } = nexus.protocol;
const { PoolAsset } = nexus.constants;

const JSON_HEADER = 'data:application/json;base64,';
const SVG_HEADER = 'data:image/svg+xml;base64,';

const buyCoverFixture = {
  coverId: 0,
  owner: ethers.ZeroAddress,
  productId: 0,
  coverAsset: PoolAsset.ETH,
  amount: ethers.parseEther('1'),
  period: daysToSeconds(30),
  maxPremiumInAsset: ethers.MaxUint256,
  paymentAsset: PoolAsset.ETH,
  payWitNXM: false,
  commissionRatio: 0n,
  commissionDestination: ethers.ZeroAddress,
  ipfsData: '',
};

describe('CoverNFTDescriptor', function () {
  it('should format ETH cover tokenURI properly', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverNFT, stakingPool1 } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;

    const poolId = await stakingPool1.getPoolId();
    const amount = ethers.parseEther('4.20');
    const targetPrice = fixture.config.TARGET_PRICE;
    const priceDenominator = 10000n;
    const expectedPremium = (amount * BigInt(targetPrice)) / priceDenominator;

    await cover.connect(coverBuyer).buyCover(
      {
        ...buyCoverFixture,
        owner: await coverBuyer.getAddress(),
        amount,
        maxPremiumInAsset: expectedPremium,
      },
      [{ poolId, coverAmountInAsset: amount.toString() }],
      { value: expectedPremium },
    );

    // Test ETH cover tokenURI
    const uri = await coverNFT.tokenURI(1);
    expect(uri.slice(0, JSON_HEADER.length)).to.be.equal(JSON_HEADER);

    const decoded = base64.toByteArray(uri.slice(JSON_HEADER.length));
    const decodedJson = JSON.parse(Buffer.from(decoded).toString('utf8'));

    expect(decodedJson.name).to.be.equal('Nexus Mutual Cover');
    expect(decodedJson.description.length).to.be.gt(0);
    expect(decodedJson.description).to.contain('ETH');

    expect(decodedJson).to.have.property('image');
    expect(decodedJson.image.slice(0, SVG_HEADER.length)).to.be.equal(SVG_HEADER);

    const decodedSvg = Buffer.from(base64.toByteArray(decodedJson.image.slice(SVG_HEADER.length))).toString('utf8');
    expect(decodedSvg).matches(/<tspan>Product 0<\/tspan>/);
    expect(decodedSvg).to.contain('ETH');
    expect(decodedSvg).to.contain('4.20');
  });

  it('should format USDC cover tokenURI properly', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverNFT, stakingProducts, stakingPool1, pool, usdc } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;

    const usdcCoverAmount = ethers.parseUnits('10000', 6);
    await usdc.mint(await coverBuyer.getAddress(), usdcCoverAmount);

    const period = daysToSeconds(30);
    const poolId = await stakingPool1.getPoolId();
    const usdcRate = await pool.getInternalTokenPriceInAsset(PoolAsset.USDC);
    const usdcProduct = await stakingProducts.getProduct(1, 2);
    const { premiumInAsset: usdcPremium } = calculatePremium(
      usdcCoverAmount,
      usdcRate,
      period,
      usdcProduct.bumpedPrice,
      fixture.config.NXM_PER_ALLOCATION_UNIT,
      PoolAsset.USDC,
    );

    await usdc.connect(coverBuyer).approve(cover.target, ethers.MaxUint256);

    await cover.connect(coverBuyer).buyCover(
      {
        ...buyCoverFixture,
        owner: await coverBuyer.getAddress(),
        productId: 2,
        coverAsset: PoolAsset.USDC,
        amount: usdcCoverAmount,
        period,
        maxPremiumInAsset: usdcPremium,
        paymentAsset: PoolAsset.USDC,
      },
      [{ poolId, coverAmountInAsset: usdcCoverAmount.toString() }],
    );

    const uri = await coverNFT.tokenURI(1);
    expect(uri.slice(0, JSON_HEADER.length)).to.be.equal(JSON_HEADER);

    const decoded = base64.toByteArray(uri.slice(JSON_HEADER.length));
    const decodedJson = JSON.parse(Buffer.from(decoded).toString('utf8'));

    expect(decodedJson.name).to.equal('Nexus Mutual Cover');
    expect(decodedJson.description).to.contain('USDC');

    const decodedSvg = Buffer.from(base64.toByteArray(decodedJson.image.slice(SVG_HEADER.length))).toString('utf8');
    expect(decodedSvg).to.contain('USDC');
    expect(decodedSvg).to.contain('10000');
    expect(decodedSvg).matches(/<tspan>Product 2<\/tspan>/);
  });

  it('should format cbBTC cover tokenURI properly', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverNFT, stakingProducts, stakingPool1, pool, cbBTC } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;

    const cbBTCCoverAmount = ethers.parseUnits('1.5', 8);
    await cbBTC.mint(await coverBuyer.getAddress(), cbBTCCoverAmount);

    const period = daysToSeconds(30);
    const poolId = await stakingPool1.getPoolId();
    const cbBTCRate = await pool.getInternalTokenPriceInAsset(PoolAsset.cbBTC);
    const cbBTCProduct = await stakingProducts.getProduct(1, 2);
    const { premiumInAsset: cbBTCPremium } = calculatePremium(
      cbBTCCoverAmount,
      cbBTCRate,
      period,
      cbBTCProduct.bumpedPrice,
      fixture.config.NXM_PER_ALLOCATION_UNIT,
      PoolAsset.cbBTC,
    );

    await cbBTC.connect(coverBuyer).approve(cover.target, ethers.MaxUint256);

    await cover.connect(coverBuyer).buyCover(
      {
        ...buyCoverFixture,
        owner: await coverBuyer.getAddress(),
        productId: 2,
        coverAsset: PoolAsset.cbBTC,
        amount: cbBTCCoverAmount,
        period,
        maxPremiumInAsset: cbBTCPremium,
        paymentAsset: PoolAsset.cbBTC,
      },
      [{ poolId, coverAmountInAsset: cbBTCCoverAmount.toString() }],
    );

    // Test cbBTC cover tokenURI
    const uri = await coverNFT.tokenURI(1);
    expect(uri.slice(0, JSON_HEADER.length)).to.be.equal(JSON_HEADER);

    const decoded = base64.toByteArray(uri.slice(JSON_HEADER.length));
    const decodedJson = JSON.parse(Buffer.from(decoded).toString('utf8'));

    expect(decodedJson.name).to.equal('Nexus Mutual Cover');
    expect(decodedJson.description).to.contain('cbBTC');

    const decodedSvg = Buffer.from(base64.toByteArray(decodedJson.image.slice(SVG_HEADER.length))).toString('utf8');
    expect(decodedSvg).to.contain('cbBTC');
    expect(decodedSvg).to.contain('1.5');
    expect(decodedSvg).matches(/<tspan>Product 2<\/tspan>/);
  });
});
