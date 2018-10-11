const MCR = artifacts.require('MCR');
const MCRData = artifacts.require('MCRData');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');
const CA_ETH = '0x45544800';
let mcr;
let mcrd;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('MCR', function([owner, notOwner]) {
  before(async function() {
    await advanceBlock();
    mcr = await MCR.deployed();
    mcrd = await MCRData.deployed();
  });

  describe('if owner/internal contract address', function() {
    describe('Change MCRTime', function() {
      it('should be able to change MCRTime', async function() {
        await mcr.changeMCRTime(1, { from: owner });
        (await mcrd.getMCRTime()).should.be.bignumber.equal(1);
      });
    });
    describe('Change MinReqMCR', function() {
      it('should be able to change MinReqMCR', async function() {
        await mcr.changeMinReqMCR(1, { from: owner });
        (await mcrd.getMinCap()).should.be.bignumber.equal(1);
      });
    });
    describe('Change Scaling Factor', function() {
      it('should be able to change Scaling Factor', async function() {
        await mcr.changeSF(1, { from: owner });
      });
    });
    describe('Add new MCR Data', function() {
      it('should be able to add MCR data', async function() {
        await mcr.addMCRData(
          18000,
          10000,
          2,
          ['0x455448', '0x444149'],
          [100, 65407],
          20181011,
          { from: owner }
        );
      });
    });

    describe('Adds MCR Data for last failed attempt', function() {
      it('should be able to add MCR data', async function() {
        await mcr.addLastMCRData(20181009, { from: owner });
        await mcr.addLastMCRData(20181011, { from: owner });
        console.log(await mcrd.getLastMCRDate());
        await mcr.addLastMCRData(20181012, { from: owner });
        console.log(await mcrd.getLastMCRDate());
      });
    });
  });

  describe('Misc', function() {
    it('should be able to change MinReqMCR', async function() {
      await assertRevert(mcr.changeMinReqMCR(1, { from: notOwner }));
    });
    it('should be able to change MCRTime', async function() {
      await assertRevert(mcr.changeMCRTime(1, { from: notOwner }));
    });
    it('should be return CA ETH at 0th index', async function() {
      (await mcr.getCurrencyByIndex(0))[1].should.equal(CA_ETH);
    });
    it('should be able to get all Sum Assurance', async function() {
      await mcr.getAllSumAssurance();
      await mcrd.updateCurr3DaysAvg('0x44414900', 0, { from: owner });
      await mcr.getAllSumAssurance();
    });
    it('should not be able to change master address', async function() {
      await assertRevert(
        mcr.changeMasterAddress(mcr.address, { from: notOwner })
      );
    });
    it('should not be able to add currency', async function() {
      await assertRevert(mcr.addCurrency('0x4c4f4c', { from: notOwner }));
    });
    it('should return 1 if required MCR is more than last MCR percentage', async function() {
      await mcrd.changeMinReqMCR(19000, { from: owner });
      (await mcr.checkForMinMCR()).should.be.bignumber.equal(1);
    });
    it('should not be able to add MCR data', async function() {
      //TODO: use mock contract
      await mcrd.pushMCRData(10000, 0, 0, 0, { from: owner });
      await mcr.getMaxSellTokens();
      await mcr.calculateTokenPrice(CA_ETH);
      console.log((await mcr.calVtpAndMCRtp())[0].toString());
      await mcr.addMCRData(
        18000,
        10000,
        ether(4),
        ['0x455448', '0x444149'],
        [100, 65407],
        20181013,
        { from: owner }
      );
      await assertRevert(
        mcr.addMCRData(
          18000,
          10000,
          2,
          ['0x455448', '0x444149'],
          [100, 65407],
          20181011,
          { from: notOwner }
        )
      );
    });
  });
});
