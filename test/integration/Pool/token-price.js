const { ethers } = require('hardhat');
const { parseEther, defaultAbiCoder } = ethers.utils;
const { BigNumber } = ethers;
const { assert, expect } = require('chai');
const Decimal = require('decimal.js');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');
const { ProposalCategory } = require('../utils').constants;

const { calculateEthForNXMRelativeError, calculateNXMForEthRelativeError, getTokenSpotPrice } =
  require('../utils').tokenPrice;

const { buyCover } = require('../utils').buyCover;
const { hex } = require('../utils').helpers;
const { PoolAsset } = require('../utils').constants;

const increaseTime = async interval => {
  const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
  const timestamp = currentTime + interval;
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const ratioScale = BigNumber.from(10000);

describe('Token price functions', function () {
  beforeEach(async function () {
    const { tc, tk } = this.contracts;
    const [, , , , member4] = this.accounts.members;

    await tk.connect(member4).approve(tc.address, ethers.constants.MaxUint256);
    await tk.transfer(member4.address, parseEther('1000'));
  });

  it('getTokenPrice returns spot price for all assets', async function () {
    const { p1: pool, mcr } = this.contracts;
    const { ethToDaiRate } = this.rates;

    const ethTokenPrice = await pool.getTokenPrice(0);
    const daiTokenPrice = await pool.getTokenPrice(1);

    const totalAssetValue = await pool.getPoolValueInEth();
    const mcrEth = await mcr.getMCR();
    const expectedEthTokenPrice = BigNumber.from(getTokenSpotPrice(totalAssetValue, mcrEth).toString());

    const ethPriceDiff = ethTokenPrice.sub(expectedEthTokenPrice).abs();
    assert(
      ethPriceDiff.lte(BigNumber.from(1)),
      `token price ${ethTokenPrice.toString()} not close enough to ${expectedEthTokenPrice.toString()}`,
    );

    const expectedDaiPrice = BigNumber.from(ethToDaiRate / 100).mul(expectedEthTokenPrice);
    const daiPriceDiff = daiTokenPrice.sub(expectedDaiPrice);
    assert(
      daiPriceDiff.lte(BigNumber.from(10000)), // negligible amount of wei
      `DAI token price ${daiTokenPrice.toString()} not close enough to ${expectedDaiPrice.toString()}`,
    );
  });

  it('buyNXM reverts for non-member', async function () {
    const { p1: pool } = this.contracts;
    const [nonMember1] = this.accounts.nonMembers;

    const buyValue = parseEther('10');
    await expect(pool.connect(nonMember1).buyNXM('0', { value: buyValue })).to.be.revertedWith(
      'Caller is not a member',
    );
  });

  it('sellNXM reverts for non-member', async function () {
    const { p1: pool } = this.contracts;
    const [nonMember1] = this.accounts.nonMembers;

    await expect(pool.connect(nonMember1).sellNXM('1', '0')).to.be.revertedWith('Caller is not a member');
  });

  it('sellNXM reverts if member does not have enough NXM balance', async function () {
    const { p1: pool, tk: token } = this.contracts;

    const [member1] = this.accounts.members;
    const memberBalance = await token.balanceOf(member1.address);

    await expect(pool.connect(member1).sellNXM(memberBalance.add(1), '0')).to.be.revertedWith(
      'Pool: Not enough balance',
    );
  });

  it('buyNXM mints tokens for member in exchange of ETH', async function () {
    const { tk: token, p1: pool, mcr } = this.contracts;

    const [member] = this.accounts.members;
    const buyValue = parseEther('1000');
    const expectedTokensReceived = await pool.getNXMForEth(buyValue);
    const totalAssetValue = await pool.getPoolValueInEth();
    const mcrEth = await mcr.getMCR();

    const preBuyBalance = await token.balanceOf(member.address);
    await pool.connect(member).buyNXM(expectedTokensReceived, { value: buyValue });

    const postBuyBalance = await token.balanceOf(member.address);
    const tokensReceived = postBuyBalance.sub(preBuyBalance);

    expect(tokensReceived).to.be.equal(expectedTokensReceived);

    const maxRelativeError = new Decimal(0.0006);
    const { relativeError } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokensReceived);
    assert(
      relativeError.lt(maxRelativeError),
      `Relative error too high ${relativeError.toString()} > ${maxRelativeError.toFixed()}`,
    );
  });

  it('sellNXM burns tokens for member and returns ETH', async function () {
    const { tk: token, p1: pool } = this.contracts;

    const [member] = this.accounts.members;
    const ethIn = parseEther('500');
    const nxmAmount = await pool.getNXMForEth(ethIn);

    // buy tokens first
    await pool.connect(member).buyNXM(nxmAmount, { value: ethIn });

    // sell them back
    const preNXMSellBalance = await token.balanceOf(member.address);
    const preSellTokenSupply = await token.totalSupply();
    const preSellEthBalance = await ethers.provider.getBalance(member.address);

    await pool.connect(member).sellNXM(nxmAmount, '0');

    const postSellEthBalance = await ethers.provider.getBalance(member.address);
    const postSellNXMBalance = await token.balanceOf(member.address);
    const postSellTokenSupply = await token.totalSupply();

    const tokensTakenAway = preNXMSellBalance.sub(postSellNXMBalance);
    const tokensBurned = preSellTokenSupply.sub(postSellTokenSupply);

    expect(tokensTakenAway).to.be.equal(nxmAmount);
    expect(tokensBurned).to.be.equal(nxmAmount);

    const ethOut = postSellEthBalance.sub(preSellEthBalance);

    const maxRelativeError = new Decimal(0.0002);
    const { relativeError } = calculateEthForNXMRelativeError(ethIn, ethOut);

    assert(
      relativeError.lt(maxRelativeError),
      `Relative error too high ${relativeError.toString()} > ${maxRelativeError.toFixed()}`,
    );
  });

  it('buyNXM token price reflects the latest lower MCR value (lower MCReth -> higher price)', async function () {
    const { p1: pool, mcr } = this.contracts;

    const [member1] = this.accounts.members;

    const buyValue = parseEther('1000');
    const expectedNXMOutPreMCRPosting = await pool.getNXMForEth(buyValue);
    const spotTokenPricePreMCRPosting = await pool.getTokenPrice(PoolAsset.ETH);
    await pool.getPoolValueInEth();

    // trigger an MCR update and post a lower MCR since lowering the price (higher MCR percentage)
    const minUpdateTime = await mcr.minUpdateTime();

    await increaseTime(minUpdateTime + 1);

    // perform a buy with a negligible amount of ETH
    await pool.connect(member1).buyNXM('0', { value: '1' });
    // let time pass so that mcr decreases towards desired MCR
    await increaseTime(6 * 3600);

    const spotTokenPricePostMCRPosting = await pool.getTokenPrice(PoolAsset.ETH);
    const expectedNXMOutPostMCRPosting = await pool.getNXMForEth(buyValue);

    assert(
      spotTokenPricePostMCRPosting.gt(spotTokenPricePreMCRPosting),
      `Expected token price to be higher than ${spotTokenPricePreMCRPosting.toString()} at a lower mcrEth.
       Price: ${spotTokenPricePostMCRPosting.toString()}`,
    );
    assert(
      expectedNXMOutPostMCRPosting.lt(expectedNXMOutPreMCRPosting),
      `Expected to receive less tokens than ${expectedNXMOutPreMCRPosting.toString()} at a lower mcrEth.
       Receiving: ${expectedNXMOutPostMCRPosting.toString()}`,
    );
  });

  // [todo]: enable with issue https://github.com/NexusMutual/smart-contracts/issues/387
  it.skip('buyNXM token price reflects the latest higher MCR value (higher MCReth -> lower price)', async function () {
    const { p1: pool, mcr } = this.contracts;
    const [member1, coverHolder] = this.accounts.members;

    const ETH = await pool.ETH();
    const buyValue = parseEther('1000');
    const expectedNXMOutPreMCRPosting = await pool.getNXMForEth(buyValue);
    const spotTokenPricePreMCRPosting = await pool.getTokenPrice(PoolAsset.ETH);
    await pool.getPoolValueInEth();

    const coverTemplate = {
      amount: 1, // 1 eth
      price: '3000000000000000', // 0.003 eth
      priceNXM: '1000000000000000000', // 1 nxm
      expireTime: '8000000000',
      generationTime: '1600000000000',
      currency: hex('ETH'),
      period: 60,
      contractAddress: '0xc0ffeec0ffeec0ffeec0ffeec0ffeec0ffee0000',
    };

    const gearingFactor = await mcr.gearingFactor();
    const currentMCR = await mcr.getMCR();
    const coverAmount = BigNumber.from(gearingFactor)
      .mul(currentMCR.add(parseEther('300')))
      .div(parseEther('1'))
      .div(ratioScale);
    const cover = { ...coverTemplate, amount: coverAmount };

    // increase totalSumAssured to trigger MCR increase
    await buyCover({ ...this.contracts, cover, coverHolder });

    // trigger an MCR update and post a lower MCR since lowering the price (higher MCR percentage)
    const minUpdateTime = await mcr.minUpdateTime();
    await increaseTime(minUpdateTime + 1);

    // perform a buy with a negligible amount of ETH
    await pool.connect(member1).buyNXM('0', { value: '1' });
    // let time pass so that mcr increases towards desired MCR
    await increaseTime(6 * 3600); // 6 hours

    const spotTokenPricePostMCRPosting = await pool.getTokenPrice(ETH);
    const expectedNXMOutPostMCRPosting = await pool.getNXMForEth(buyValue);

    assert(
      spotTokenPricePostMCRPosting.lt(spotTokenPricePreMCRPosting),
      `Expected token price to be lower than ${spotTokenPricePreMCRPosting.toString()} at a higher mcrEth.
       Price: ${spotTokenPricePostMCRPosting.toString()}`,
    );
    assert(
      expectedNXMOutPostMCRPosting.gt(expectedNXMOutPreMCRPosting),
      `Expected to receive more tokens than ${expectedNXMOutPreMCRPosting.toString()} at a higher mcrEth.
       Receiving: ${expectedNXMOutPostMCRPosting.toString()}`,
    );
  });

  it('getPoolValueInEth calculates pool value correctly', async function () {
    const { p1: pool, dai } = this.contracts;
    const { daiToEthRate } = this.rates;

    const poolBalance = BigNumber.from(await ethers.provider.getBalance(pool.address));
    const daiBalance = await dai.balanceOf(pool.address);
    const expectedDAiValueInEth = daiToEthRate.mul(daiBalance).div(parseEther('1'));
    const expectedTotalAssetValue = poolBalance.add(expectedDAiValueInEth);
    const totalAssetValue = await pool.getPoolValueInEth();
    assert(totalAssetValue.toString(), expectedTotalAssetValue.toString());
  });

  it('getMCRRatio calculates MCR ratio correctly', async function () {
    const { p1: pool } = this.contracts;
    const mcrRatio = await pool.getMCRRatio();
    assert.equal(mcrRatio.toString(), '22000'); // ETH + DAI + USDC
  });

  it('sellNXM reverts for member if tokens are locked for member vote', async function () {
    // [todo] Use new contracts
    const { gv, master, p1: pool } = this.contracts;

    const [member] = this.accounts.members;

    const mcrCode = hex('MC');
    const MCR = await ethers.getContractFactory('MCR');
    const newMCR = await MCR.deploy(master.address);

    const contractCodes = [mcrCode];
    const newAddresses = [newMCR.address];

    const upgradeContractsData = defaultAbiCoder.encode(['bytes2[]', 'address[]'], [contractCodes, newAddresses]);

    const proposalId = await gv.getProposalLength();
    await gv.createProposal('', '', '', '0');
    await gv.categorizeProposal(proposalId, ProposalCategory.upgradeProxy, 0);
    await gv.submitProposalWithSolution(proposalId, '', upgradeContractsData);

    await gv.connect(member).submitVote(proposalId, 1, []);

    await expect(pool.connect(member).sellNXM('1', '0')).to.be.revertedWith('Pool: NXM tokens are locked for voting');
  });
});
