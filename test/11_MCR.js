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
    });
  });
});
