const claims = artifacts.require("claims");
const claimsData = artifacts.require("claimsData");
const claimsReward = artifacts.require("claimsReward");
const master = artifacts.require("master");
const master2 = artifacts.require("masters2");
const mcr = artifacts.require("mcr");
const mcrData = artifacts.require("mcrData");
const nxmToken = artifacts.require("nxmToken");
const nxmToken2 = artifacts.require("nxmToken2");
const nxmTokenData = artifacts.require("nxmTokenData");
const pool = artifacts.require("pool");
const pool2 = artifacts.require("pool2");
const pool3 = artifacts.require("pool3");
const poolData = artifacts.require("poolData");
const quotation2 = artifacts.require("quotation2");
const quotationData = artifacts.require("quotationData");

const addr = [quotationData.address, nxmTokenData.address, claimsData.address, poolData.address, mcrData.address, quotation2.address, nxmToken.address, nxmToken2.address, claims.address, claimsReward.address, pool.address, pool2.address, master2.address, mcr.address, pool3.address];

contract('master', function(_, owner) {
  beforeEach(async function () {
    this.master = await master.new({from: owner});
    this.quotationData = await quotationData.new({ from: owner });
    this.nxmTokenData = await nxmTokenData.new("0","NXM","18","NXM", {from: owner});
    this.claimsData = await claimsData.new({ from: owner });
    this.poolData = await poolData.new({ from: owner });
    this.mcrData = await mcrData.new({ from: owner });
    this.quotation2 = await quotation2.new({ from: owner });
    this.nxmToken = await nxmToken.new({ from: owner });
    this.nxmToken2 = await nxmToken2.new({ from: owner });
    this.claims = await claims.new({ from: owner });
    this.claimsReward = await claimsReward.new({ from: owner });
    this.pool = await pool.new({ from: owner });
    this.pool2 = await pool2.new({ from: owner });
    this.mcr = await mcr.new({ from: owner });
    this.master2 = await master2.new({ from: owner });
    this.pool3 = await pool3.new({ from: owner });
    this.pool3 = await pool3.new({ from: owner });
  });

  it('should add a new version', async function () {
    const addr = [this.quotationData.address, this.nxmTokenData.address, this.claimsData.address, this.poolData.address, this.mcrData.address, this.quotation2.address, this.nxmToken.address, this.nxmToken2.address, this.claims.address, this.claimsReward.address, this.pool.address, this.pool2.address, this.master2.address, this.mcr.address, this.pool3.address];
    await this.master.addNewVersion(addr, { from: owner })
    const versionLength = await master.versionLength();
    assert.equal(versionLength, 0);
  });

});  

