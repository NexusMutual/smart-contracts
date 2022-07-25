const { accounts, web3, ethers } = require('hardhat');
const { constants: { ZERO_ADDRESS } } = require('@openzeppelin/test-helpers');
const { assert,
  expect
} = require('chai');
const { ProposalCategory } = require('../utils').constants;
const { hex } = require('../utils').helpers;
const { submitProposal } = require('../utils').governance;
const { buyCover, coverToCoverDetailsArray } = require('../utils').buyCover;
const { getQuoteSignature } = require('../utils').getQuote;
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const {
  ASSET,
  daysToSeconds
} = require('../../unit/IndividualClaims/helpers');
const { toBN } = web3.utils;

const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');
const { assertCoverFields } = require('../../unit/Cover/helpers');
const { BigNumber } = require('ethers');

const { parseEther } = ethers.utils;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

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

const priceDenominator = '10000';

describe('submitClaim', function () {


  it('submits claim and approves claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { individualClaims, cover } = this.withEthers.contracts;
    const [ coverBuyer1 ] = this.accounts.members;
    const coverAmount = parseEther('100');

    const { timestamp } = await ethers.provider.getBlock('latest');

    const productId = 0;
    const payoutAsset = 0; // ETH
    const period = 3600 * 24 * 364; // 30 days

    const amount = parseEther('1000');

    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));


    const tx = await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: payoutAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZERO_ADDRESS,
        ipfsData: ''
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );
    const receipt = await tx.wait();

    console.log({
      gasUsed: receipt.gasUsed.toString(),
    });

    const expectedCoverId = '0';

    const coverId = 0;
    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 0, coverAmount, '', {
        value: ethers.constants.Zero,
      }),
    ).to.be.revertedWith('Assessment deposit is insufficient');
  });
});
