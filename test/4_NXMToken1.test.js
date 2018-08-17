const NXMToken1 = artifacts.require("NXMToken1");
const NXMToken2 = artifacts.require("NXMToken2");
const NXMTokenData = artifacts.require("NXMTokenData");
const member = web3.eth.accounts[1];
const receiver = web3.eth.accounts[2];
const nonMember = web3.eth.accounts[3];
const amount = web3.toWei(1);
const Tokens = web3.toWei(2);
const LockDays = 30;
const ExtendLockDays = 10*24*3600;
const ExtendLockAmount = web3.toWei(300);
const tokensToTransfer = web3.toWei(20);
const allowanceTokens = web3.toWei(100);
const stakeTokens = web3.toWei(100);
const contractAdd = "0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf";
const { assertRevert } = require('./utils/assertRevert');
const CLA = "0x434c41";
let nxmtk1;
let nxmtk2;
let P1;	
let nxmData;
const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

describe('Contract: 4_NXMToken1', function () {
	it('should able to lock tokens under Claim Assesment', async function () {	
		nxmtk1 = await NXMToken1.deployed();		
		let NOW = Math.floor(Date.now()/1000);
		let initialLocked = await nxmtk1.tokensLocked(member, CLA, NOW);
		let initialAvailableTokens = await nxmtk1.balanceOf(member);
		initialLocked.should.be.bignumber.equal(new BigNumber(0));
		let validity = NOW + (LockDays*24*3600);
		await nxmtk1.lock(CLA, Tokens, validity, {from:member});
		let tokenLocked = await nxmtk1.tokensLocked(member, CLA, NOW);
		let availableTokens = (await nxmtk1.balanceOf(member)).toNumber();
		let verifyAvailableTokens = (initialAvailableTokens - Tokens);
		availableTokens.should.equal(verifyAvailableTokens);
		tokenLocked.should.be.bignumber.equal(Tokens);
	});

	it('should able to extend validity of tokens for Claim Assesment', async function () {
	    nxmData = await NXMTokenData.deployed();
	    let NOW = Math.floor(Date.now()/1000);
	    let initialLocked = await nxmtk1.tokensLocked(member, CLA, NOW);
		initialLocked.should.be.bignumber.not.equal(new BigNumber(0));
		let lockedTokens = await nxmData.locked(member, CLA);
		let initialValidity = lockedTokens[0];
		await nxmtk1.extendLock(CLA, ExtendLockDays,{from:member});	
		let lockedTokensAfter = await nxmData.locked(member, CLA);
		let newValidity = lockedTokensAfter[0];
		newValidity.should.be.bignumber.equal(new BigNumber(initialValidity.plus(ExtendLockDays)));	
	});

	/*it('should able to extend amount of tokens for Claim Assesment', async function () {
	
		
		initialLocked.should.not.equal(0);
		let initialTokenAvailable = await nxmtk1.balanceOf(member);
		let lockedTokens = await nxmData.locked(member, CLA);
		let initialAmount = lockedTokens[1];
		await nxmtk1.increaseLockAmount(CLA, ExtendLockAmount);	
		let newTokenAvailable = await nxmtk1.balanceOf(member);
		let lockedTokensAfter = await nxmData.locked(member, CLA);
		let newAmount = lockedTokensAfter[1];
		newAmount.should.equal(initialAmount+ExtendLockAmount);	
		newTokenAvailable.should.equal(initialTokenAvailable - ExtendLockAmount);
		
	});

	it('should able to transfer tokens to any other member', async function () {
	
		let initialTokenMember = await nxmtk1.balanceOf(member);
		let initialTokenReceiver = await nxmtk1.balanceOf(receiver);
		await nxmtk1.transfer(receiver, tokensToTransfer);
		let presentTokenMember = await nxmtk1.balanceOf(member);
		let presentTokenReceiver = await nxmtk1.balanceOf(receiver);
		presentTokenMember.should.equal(initialTokenMember - tokensToTransfer);
		presentTokenReceiver.should.equal(initialTokenReceiver + tokensToTransfer);
	
	});

	it('should able to allows a given address (Spender) to spend a given amount of the money on behalf of the other user', async function () {
	
		let setAllowance = await nxmtk1.approve(receiver, allowanceTokens);
		setAllowance.should.equal(true);

	});

	it('should able to stake NXMs on Smart Contracts', async function () {
	
		let initialTokenAvailable = await nxmtk1.balanceOf(member);
		nxmtk2 = await NXMToken2.deployed();
		let initialStaked = await nxmData.getTotalStakedAmtByStakerAgainstScAddress(member, contractAdd);
		await nxmtk2.addStake(contractAdd, stakeTokens);
		let currentTokenAvailable = await nxmtk1.balanceOf(member);
		let currentStaked = await nxmData.getTotalStakedAmtByStakerAgainstScAddress(member, contractAdd);
		currentTokenAvailable.should.equal(initialTokenAvailable - stakeTokens);
		currentStaked.should.equal(initialStaked + currentStaked);
		
	});*/
/*
	it('should able to transfer on behalf of the other user', async function () {
	
		

	});

	it('should not able to exceed transfer on behalf of the other user', async function () {
	

		

	});*/

	/*it('should not able to  transfer Tokens to Non-Member', async function () {
	
		let initialTokenMember = await nxmtk1.balanceOf(member);
		let initialTokenReceiver = await nxmtk1.balanceOf(nonMember);
		await assertRevert (nxmtk1.transfer(nonMember, tokensToTransfer));
		let presentTokenMember = await nxmtk1.balanceOf(member);
		let presentTokenReceiver = await nxmtk1.balanceOf(receiver);
		presentTokenMember.should.equal(initialTokenMember);
		presentTokenReceiver.should.equal(initialTokenReceiver);

	});

	it('should not able to  lock Tokens under CA more than once', async function () {
	
		let NOW = Math.floor(Date.now()/1000);
		let initialLocked = await nxmtk1.tokensLocked(member, CLA, NOW);
		let validity = NOW+(LockDays*24*3600);
		await assertRevert(nxmtk1.lock(CLA, Tokens, validity));
		let currentLocked = await nxmtk1.tokensLocked(member, CLA, NOW);
		currentLocked.should.equal(initialLocked);


	});

	it('should not able to  transfer locked Tokens', async function () {
	
		let totalTokens = await nxmData.getBalanceOf(member);
		await assertRevert(nxmtk1.transfer(receiver, totalTokens));


	});*/

/*	it('should not able to  transfer staked Tokens', async function () {
	
		

	});

	it('should not able to  call internal functions', async function () {
	
		await assertRevert(nxmtk1.changeLock());

	});
*/

});
