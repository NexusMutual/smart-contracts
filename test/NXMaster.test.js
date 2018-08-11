const Claims = artifacts.require("Claims");
const ClaimsData = artifacts.require("ClaimsData");
const ClaimsReward = artifacts.require("ClaimsReward");
const NXMaster = artifacts.require("NXMaster");
const NXMaster2 = artifacts.require("NXMaster2");
const MCR = artifacts.require("MCR");
const MCRData = artifacts.require("MCRData");
const NXMToken1 = artifacts.require("NXMToken1");
const NXMToken2 = artifacts.require("NXMToken2");
const NXMTokenData = artifacts.require("NXMTokenData");
const Pool1 = artifacts.require("Pool1");
const Pool2 = artifacts.require("Pool2");
const Pool3 = artifacts.require("Pool3");
const PoolData = artifacts.require("PoolData");
const Quotation = artifacts.require("Quotation");
const QuotationData = artifacts.require("QuotationData");

contract('NXMaster', function () {
    let nms;
    let nms2;
    let nxm;
    let nxm2;
    let td;
    let pl1;
    let pl2;
    let pl3;
    let pd;
    let q2;
    let qd;
    let cl;
    let cr;
    let cd;
    let mc;
    let mcd;
    let addr = [];

	context('Contract instance', async function () {
		nms = await NXMaster.deployed();
		qd = await QuotationData.deployed();
		td = await NXMTokenData.deployed();
		cd = await ClaimsData.deployed();
		pd = await PoolData.deployed();
		mcd = await MCRData.deployed();
		q2 = await QuotationData.deployed();
		nxm = await NXMToken1.deployed();
		nxm2 = await NXMToken2.deployed();
		cl = await Claims.deployed();
		cr = await ClaimsReward.deployed();
		pl1 = await Pool1.deployed();
		pl2 = await Pool2.deployed();
		mcr = await MCR.deployed();
		nms2 = await NXMaster2.deployed();
		pl3 = await Pool3.deployed();
		addr.push(qd.address);
		addr.push(td.address);
		addr.push(cd.address);
		addr.push(pd.address);
		addr.push(mcd.address);
		addr.push(q2.address);
		addr.push(nxm.address);
		addr.push(nxm2.address);
		addr.push(cl.address);
		addr.push(cr.address);
		addr.push(pl1.address);
		addr.push(pl2.address);
		addr.push(nms2.address);
		addr.push(mc.address);
		addr.push(pl3.address)
	});

  it('should add a new version', async function () {
    await nms.addNewVersion(addr)
    const versionLength = await nsm.versionLength();
    var vl = versionLength.toNumber();
    assert.equal(vl, vl+1);
  });
});

