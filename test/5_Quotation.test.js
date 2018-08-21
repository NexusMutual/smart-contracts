const Pool1 = artifacts.require("Pool1");
const NXMToken1 = artifacts.require("NXMToken1");
const NXMToken2 = artifacts.require("NXMToken2");
const ClaimsReward = artifacts.require("ClaimsReward");
const { getvrs } = require("./utils/getvrs");
const member = web3.eth.accounts[1];
const coverHolder = web3.eth.accounts[4];
const fee = web3.toWei(0.002);
const PID = 0;
const smartConAdd = "0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf";
const coverPeriod = 61;
const coverDetails = [5,1176856034679443,260712457837714,7972408607];
const v = 27;
const r = "0x30c1449cd8c7e4c25760e3eb31e6f5812efe9622a3db4a525b8f0e53cb749ed9";
const s = "0x11ec3139bf601c2a31bd5e4af8e05b6f9ced428da9f4654ba5feb9018f828ee4";
let P1;
let nxmtk1;
let nxmtk2;
let cr;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

describe('Contract: 5_Quotation', function () {
	const BN_100 = new BigNumber(100);
	const BN_5 = new BigNumber(5);
	const BN_20 = new BigNumber(20);
	it('should able to Purchase Cover With Ether', async function () {
		this.timeout(0);
		P1 = await Pool1.deployed();
		nxmtk1 = await NXMToken1.deployed();
		nxmtk2 = await NXMToken2.deployed();
		cr = await ClaimsReward.deployed();
		await nxmtk2.payJoiningFee({from: coverHolder, value:fee});
		let initialLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
		let initialAvailableToken = await cr.getTotalStakeCommission(member); // member=staker for smart contract
		let initialPoolBalance = await P1.getEtherPoolBalance();
		await P1.makeCoverBegin(PID, smartConAdd, "ETH", coverDetails, coverPeriod, v, r, s, {from: coverHolder, value: coverDetails[1]});
		let presentLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
		let presentAvailableToken = await cr.getTotalStakeCommission(member); // staker should get 20% of premium.
		let presentPoolBalance = await P1.getEtherPoolBalance();
		let newLockedCN = (initialLockedCN.plus(BN_5.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))).toFixed(0);
		let newAvailableToken = (initialAvailableToken.plus(BN_20.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))).toFixed(0);
		let newPoolBalance = (initialPoolBalance.plus(new BigNumber(coverDetails[1].toString()))).toFixed(0);
		newLockedCN.should.be.bignumber.equal(presentLockedCN);
		newAvailableToken.should.be.bignumber.equal(presentAvailableToken);
		newPoolBalance.should.be.bignumber.equal(presentPoolBalance);

	});

});

