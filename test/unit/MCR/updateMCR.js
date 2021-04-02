const { assert } = require('chai');
const { artifacts, web3 } = require('hardhat');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');
const { initMCR, MAX_PERCENTAGE_ADJUSTMENT } = require('./common');
const { hex } = require('../utils').helpers;

const accounts = require('../utils').accounts;
const { MCRUintParamType } = require('../utils').constants;

const {
  nonMembers: [nonMember],
  members: [member],
  advisoryBoardMembers: [advisoryBoardMember],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
  generalPurpose: [generalPurpose],
} = accounts;

const DEFAULT_MCR_PARAMS = {
  mcrValue: ether('150000'),
  mcrFloor: ether('150000'),
  desiredMCR: ether('150000'),
  mcrFloorIncrementThreshold: '13000',
  maxMCRFloorIncrement: '100',
  maxMCRIncrement: '500',
  gearingFactor: '48000',
  minUpdateTime: '3600',
};

describe.only('updateMCR', function () {

  it('does not update if minUpdateTime has not passed', async function () {

    const { master, pool } = this;

    const poolValueInEth = ether('200000');
    await pool.setPoolValueInEth(poolValueInEth);
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    const previousLastUpdateTime = await mcr.lastUpdateTime();

    const tx = await mcr.updateMCR();

    const storedMCR = await mcr.mcr();
    const desiredMCR = await mcr.desiredMCR();
    const lastUpdateTime = await mcr.lastUpdateTime();

    assert(storedMCR.toString(), DEFAULT_MCR_PARAMS.mcrValue.toString());
    assert(desiredMCR.toString(), DEFAULT_MCR_PARAMS.desiredMCR.toString());
    assert(lastUpdateTime.toString(), previousLastUpdateTime.toString());
  });

  it('keeps values the same if MCR = MCR floor and mcrWithGear is too low', async function () {

    const { master, quotationData, pool } = this;

    const poolValueInEth = ether('160000');
    await pool.setPoolValueInEth(poolValueInEth);
    await quotationData.setTotalSumAssured(hex('ETH'), '100000');
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    const minUpdateTime = await mcr.minUpdateTime();
    await time.increase(minUpdateTime.addn(1));

    const tx = await mcr.updateMCR();

    const block = await web3.eth.getBlock(tx.receipt.blockNumber);

    const storedMCR = await mcr.mcr();
    const desiredMCR = await mcr.desiredMCR();
    const lastUpdateTime = await mcr.lastUpdateTime();

    assert.equal(storedMCR.toString(), DEFAULT_MCR_PARAMS.mcrValue.toString());
    assert.equal(desiredMCR.toString(), DEFAULT_MCR_PARAMS.desiredMCR.toString());

    // FIXME: read correct block
    // assert.equal(lastUpdateTime.toString(), block.timestamp.toString());
  });

  it('increases desiredMCR when mcrWithGear exceeds current MCR', async function () {

    const { master, quotationData, pool } = this;

    const poolValueInEth = ether('160000');
    await pool.setPoolValueInEth(poolValueInEth);
    await quotationData.setTotalSumAssured(hex('ETH'), '800000');
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    const minUpdateTime = await mcr.minUpdateTime();
    await time.increase(minUpdateTime.addn(1));

    const tx = await mcr.updateMCR();
    const block = await web3.eth.getBlock(tx.receipt.blockNumber);

    const storedMCR = await mcr.mcr();
    const desiredMCR = await mcr.desiredMCR();
    const lastUpdateTime = await mcr.lastUpdateTime();

    const totalSumAssured = await mcr.getAllSumAssurance();
    const gearingFactor = await mcr.gearingFactor();
    const expectedDesiredMCR = totalSumAssured.muln(10000).div(gearingFactor);

    assert.equal(storedMCR.toString(), DEFAULT_MCR_PARAMS.mcrValue.toString());
    assert.equal(desiredMCR.toString(), expectedDesiredMCR.toString());

    // FIXME: read correct block
    // assert.equal(lastUpdateTime.toString(), block.timestamp.toString());
  });

  it('increases desiredMCR when mcrFloor increases (MCR% > 130%)', async function () {

    const { master, quotationData, pool } = this;

    const poolValueInEth = DEFAULT_MCR_PARAMS.mcrValue.muln(131).divn(100);
    await pool.setPoolValueInEth(poolValueInEth);
    await quotationData.setTotalSumAssured(hex('ETH'), '100000');
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    const minUpdateTime = await mcr.minUpdateTime();
    await time.increase(time.duration.days(1));

    const tx = await mcr.updateMCR();
    const block = await web3.eth.getBlock(tx.receipt.blockNumber);

    const storedMCR = await mcr.mcr();
    const desiredMCR = await mcr.desiredMCR();
    const mcrFloor = await mcr.mcrFloor();
    const lastUpdateTime = await mcr.lastUpdateTime();

    const expectedMCRFloor = DEFAULT_MCR_PARAMS.mcrFloor.muln(101).divn(100);

    assert.equal(mcrFloor.toString(), expectedMCRFloor.toString());
    assert.equal(storedMCR.toString(), DEFAULT_MCR_PARAMS.mcrValue.toString());
    assert.equal(desiredMCR.toString(), mcrFloor.toString());

    // FIXME: read correct block
    // assert.equal(lastUpdateTime.toString(), block.timestamp.toString());
  });
});
