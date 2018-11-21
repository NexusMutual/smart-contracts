const MCR = artifacts.require('MCR');
const MCRDataMock = artifacts.require('MCRDataMock');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

let mcr;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('MCRDataMock', function([owner, notOwner]) {
  before(async function() {
    await advanceBlock();
    mcrd = await MCRDataMock.deployed();
  });
  describe('if owner', function() {
    describe('Change Minimum Cap', function() {
      it('should be able to change min cap', async function() {
        await mcrd.changeMinCap(1, { from: owner });
        (await mcrd.getMinCap()).should.be.bignumber.equal(1);
      });
    });
    describe('Change ShockParameter', function() {
      it('should be able to change ShockParameter', async function() {
        await mcrd.changeShockParameter(1, { from: owner });
        (await mcrd.getShockParameter()).should.be.bignumber.equal(1);
      });
    });
    describe('Change GrowthStep', function() {
      it('should be able to change GrowthStep', async function() {
        await mcrd.changeGrowthStep(1, { from: owner });
        (await mcrd.getGrowthStep()).should.be.bignumber.equal(1);
      });
    });
    describe('Change MCRTime', function() {
      it('should be able to change MCRTime', async function() {
        await mcrd.changeMCRTime(1, { from: owner });
        (await mcrd.getMCRTime()).should.be.bignumber.equal(1);
      });
    });
    describe('Change MCRFailTime', function() {
      it('should be able to change MCRFailTime', async function() {
        await mcrd.changeMCRFailTime(1, { from: owner });
        (await mcrd.getMCRFailTime()).should.be.bignumber.equal(1);
      });
    });
    describe('Change MinReqMCR', function() {
      it('should be able to change MinReqMCR', async function() {
        await mcrd.changeMinReqMCR(1, { from: owner });
        (await mcrd.getMinCap()).should.be.bignumber.equal(1);
      });
    });
  });

  describe('if not owner', function() {
    describe('Change Minimum Cap', function() {
      it('should not be able to change min cap', async function() {
        await assertRevert(mcrd.changeMinCap(1, { from: notOwner }));
      });
    });
    describe('Change ShockParameter', function() {
      it('should not be able to change ShockParameter', async function() {
        await assertRevert(mcrd.changeShockParameter(1, { from: notOwner }));
      });
    });
    describe('Change GrowthStep', function() {
      it('should not be able to change GrowthStep', async function() {
        await assertRevert(mcrd.changeGrowthStep(1, { from: notOwner }));
      });
    });
    describe('Change MCRTime', function() {
      it('should not be able to change MCRTime', async function() {
        await assertRevert(mcrd.changeMCRTime(1, { from: notOwner }));
      });
    });
    describe('Change MCRFailTime', function() {
      it('should not be able to change MCRFailTime', async function() {
        await assertRevert(mcrd.changeMCRFailTime(1, { from: notOwner }));
      });
    });
    describe('Change MinReqMCR', function() {
      it('should not be able to change MinReqMCR', async function() {
        await assertRevert(mcrd.changeMinReqMCR(1, { from: notOwner }));
      });
    });
  });

  describe('Misc', function() {
    it('should return true if notarise address', async function() {
      (await mcrd.isnotarise(owner)).should.equal(true);
    });
    it('should return false if not notarise address', async function() {
      (await mcrd.isnotarise(notOwner)).should.equal(false);
    });
    it('should not be able to change master address', async function() {
      await assertRevert(
        mcrd.changeMasterAddress(mcrd.address, { from: notOwner })
      );
    });
    it('should not be able to add Currency', async function() {
      await assertRevert(mcrd.addCurrency('0x4c4f4c', { from: notOwner }));
      await mcrd.getSFx100000();
      await mcrd.getLastMCREther();
      await mcrd.getLastVfull();
    });
  });
});
