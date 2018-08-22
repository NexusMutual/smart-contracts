const NXMToken1 = artifacts.require("NXMToken1");
const NXMToken2 = artifacts.require("NXMToken2");
const NXMTokenData = artifacts.require("NXMTokenData");
const Claims = artifacts.require("Claims");
const ClaimsData = artifacts.require("ClaimsData");
const QuotationData = artifacts.require("QuotationData");
const PoolData = artifacts.require("PoolData");
const member = web3.eth.accounts[1];
const receiver = web3.eth.accounts[2];
const nonMember = web3.eth.accounts[3];
const coverHolder = web3.eth.accounts[4];


const { assertRevert } = require('./utils/assertRevert');
const CLA = "0x434c41";
let cl;
let nxmtk1;
let nxmtd;
let qd;
let cd;
let pd;
const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

describe("Contract: 06_claims", function () {
	
	it('should able to submit Claim for his cover', async function () {
		this.timeout(0);
		td = await NXMTokenData.deployed();
		qd = await QuotationData.deployed();
		cl = await Claims.deployed();
		cd = await ClaimsData.deployed();
		pd = await PoolData.deployed();
		let coverID = qd.getAllCoversOfUser(coverHolder);
		let coverOwner = qd.getCoverMemberAddress(coverID[0]);
		coverOwner.should.equal(coverHolder);
		let cStatus = qd.getCoverDetailsByCoverID1(coverID[0]);
		cStatus[4].should.equal("Active" || "Claim Denied" || "Requested");
		let sumAssured = await qd.getCoverSumAssured(coverID[0]);
		let coverCurr = await qd.getCurrencyOfCover(coverID[0]);
		let claimId = await cd.actualClaimLength();
		let initialCurrencyAssetVarMin = await pd.getCurrencyAssetVarMin();
		await cl.submitClaim(coverID[0]);
		let presentCurrencyAssetVarMin = await pd.getCurrencyAssetVarMin();
		let claimDetails = await cd.getAllClaimsByIndex(claimId);
		claimDetails[0].should.equal(coverID[0]);
		let coverStatus = await qd.getCoverStatus(coverID[0]);
		coverStatus.should.equal("Claim Submitted");
		let calculatedCurrencyAssetVarMin = initialCurrencyAssetVarMin + sumAssured;
		calculatedCurrencyAssetVarMin.should.equal(presentCurrencyAssetVarMin);
	});

	it('should not able to submit Claim for cover with status submmited,accepted,5 times denied', async function () {
		this.timeout(0);
		let coverID = qd.getAllCoversOfUser(coverHolder);
		let coverOwner = qd.getCoverMemberAddress(coverID[0]);
		await assertRevert(cl.submitClaim(coverID[0]));
		
	});

});
