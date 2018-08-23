const NXMToken1 = artifacts.require("NXMToken1");
const NXMToken2 = artifacts.require("NXMToken2");
const NXMTokenData = artifacts.require("NXMTokenData");
const Pool1 = artifacts.require("Pool1");

const member = web3.eth.accounts[1];
const receiver = web3.eth.accounts[2];
const nonMember = web3.eth.accounts[3];

const LockDays = 30;
const ExtendLockDays = 10*24*3600;
const contractAdd = "0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf";
const { assertRevert } = require('./utils/assertRevert');
const CLA = "0x434c41";

let P1;
let nxmtk1;
let nxmtd;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

describe("Contract: NXMToken1", function () {
    const ExtendLockAmount = new BigNumber(6e17);
    const tokensToTransfer = new BigNumber(9e17);
    const allowanceTokens = new BigNumber(8e17);
    const spendAllowanceTokens = new BigNumber(5e17);
    const stakeTokens = new BigNumber(1e18);
    const Tokens = new BigNumber(1e18);

    before(function() {
        NXMToken1.deployed().then(function(instance) {
            nxmtk1 = instance;
            return NXMToken2.deployed();
        }).then(function(instance) {
            nxmtk2 = instance;
            return NXMTokenData.deployed();
        }).then(function(instance) {
            nxmtd = instance;
            return Pool1.deployed();
        }).then(function(instance) {
            P1 = instance;
        });
    });
    
    it('should able to lock tokens under Claim Assesment', async function () {
        let NOW = Math.floor(Date.now()/1000);
        let initialLocked = await nxmtk1.tokensLocked(member, CLA, NOW);
        let initialAvailableTokens = await nxmtk1.balanceOf(member);
        initialLocked.should.be.bignumber.equal(new BigNumber(0));
        let validity = NOW + (LockDays*24*3600);
        await nxmtk1.lock(CLA, Tokens, validity, {from:member});
        let tokenLocked = await nxmtk1.tokensLocked(member, CLA, NOW);
        let availableTokens = await nxmtk1.balanceOf(member);
        availableTokens.should.be.bignumber.equal(initialAvailableTokens.minus(Tokens));
        tokenLocked.should.be.bignumber.equal(Tokens);
    });

    it('should able to extend validity of tokens for Claim Assesment', async function () {
        let NOW = Math.floor(Date.now()/1000);
        let initialLocked = await nxmtk1.tokensLocked(member, CLA, NOW);
        initialLocked.should.be.bignumber.not.equal(new BigNumber(0));
        let lockedTokens = await nxmtd.locked(member, CLA);
        let initialValidity = lockedTokens[0];
        await nxmtk1.extendLock(CLA, ExtendLockDays, {from:member});
        let lockedTokensAfter = await nxmtd.locked(member, CLA);
        let newValidity = lockedTokensAfter[0];
        newValidity.should.be.bignumber.equal(initialValidity.plus(ExtendLockDays));
    });

    it('should able to extend amount of tokens for Claim Assesment', async function () {
        let NOW = Math.floor(Date.now()/1000);
        let initialLocked = await nxmtk1.tokensLocked(member, CLA, NOW);
        initialLocked.should.be.bignumber.not.equal(new BigNumber(0));
        let initialTokenAvailable = await nxmtk1.balanceOf(member);
        let lockedTokens = await nxmtd.locked(member, CLA);
        let initialAmount = lockedTokens[1];
        await nxmtk1.increaseLockAmount(CLA, ExtendLockAmount, {from:member});
        let newTokenAvailable = await nxmtk1.balanceOf(member);
        let lockedTokensAfter = await nxmtd.locked(member, CLA);
        let newAmount = lockedTokensAfter[1];
        newAmount.should.be.bignumber.equal(initialAmount.plus(ExtendLockAmount));
        newTokenAvailable.should.be.bignumber.equal(initialTokenAvailable.minus(ExtendLockAmount));
    });

    it('should able to transfer tokens to any other member', async function () {
        let initialTokenOfMember = await nxmtk1.balanceOf(member);
        let initialTokenOfReceiver = await nxmtk1.balanceOf(receiver);
        await nxmtk1.transfer(receiver, tokensToTransfer, {from: member});
        let presentTokenOfMember = await nxmtk1.balanceOf(member);
        let presentTokenOfReceiver = await nxmtk1.balanceOf(receiver);
        presentTokenOfMember.should.be.bignumber.equal(initialTokenOfMember.minus(tokensToTransfer));
        presentTokenOfReceiver.should.be.bignumber.equal(initialTokenOfReceiver.plus(tokensToTransfer));

    });

    it('should able to stake NXMs on Smart Contracts', async function () {
        let initialTokenAvailable = await nxmtk1.balanceOf(member);
        let initialStaked = await nxmtd.getTotalStakedAmtByStakerAgainstScAddress(member, contractAdd);
        await nxmtk2.addStake(contractAdd, stakeTokens, {from: member});
        let currentTokenAvailable = await nxmtk1.balanceOf(member);
        let currentStaked = await nxmtd.getTotalStakedAmtByStakerAgainstScAddress(member, contractAdd);
        currentTokenAvailable.should.be.bignumber.equal(initialTokenAvailable.minus(stakeTokens));
        currentStaked.should.be.bignumber.equal(initialStaked.plus(currentStaked));
    });

    it('should able to allows a Member(Spender) to spend a given amount of the money on behalf of another Member', async function () {
        let setAllowance = await nxmtk1.approve(receiver, allowanceTokens, {from: member});
        let verifyAllowance = await nxmtd.getAllowerSpenderAllowance(member, receiver);
        verifyAllowance.should.be.bignumber.equal(allowanceTokens);
    });


    it('should able to transfer on behalf of the other user', async function () {
        let allowanceTokens = await nxmtd.getAllowerSpenderAllowance(member, receiver);
        let initialTokensOfReceiver = await nxmtk1.balanceOf(receiver);
        let initialTokenOfSpender = await nxmtk1.balanceOf(member);
        await nxmtk1.transferFrom(member, receiver, spendAllowanceTokens, {from: receiver});
        let remainedAllowanceTokens = await nxmtd.getAllowerSpenderAllowance(member, receiver);
        let currentTokensOfReceiver =  await nxmtk1.balanceOf(receiver);
        let currentTokensOfSpender = await nxmtk1.balanceOf(member);
        remainedAllowanceTokens.should.be.bignumber.equal(allowanceTokens.minus(spendAllowanceTokens));
        currentTokensOfReceiver.should.be.bignumber.equal(initialTokensOfReceiver.plus(spendAllowanceTokens));
        currentTokensOfSpender.should.be.bignumber.equal(initialTokenOfSpender.minus(spendAllowanceTokens));

    });

    it('should not able to exceed transfer on behalf of the other user', async function () {
        let allowanceTokens = await nxmtd.getAllowerSpenderAllowance(member, receiver);
        let initialTokensOfReceiver = await nxmtk1.balanceOf(receiver);
        let initialTokenOfSpender = await nxmtk1.balanceOf(member);
        await assertRevert(nxmtk1.transferFrom(member, receiver, spendAllowanceTokens, {from: receiver}));
        let remainedAllowanceTokens = await nxmtd.getAllowerSpenderAllowance(member, receiver);
        let currentTokensOfReceiver =  await nxmtk1.balanceOf(receiver);
        let currentTokensOfSpender = await nxmtk1.balanceOf(member);
        remainedAllowanceTokens.should.be.bignumber.equal(allowanceTokens);
        currentTokensOfReceiver.should.be.bignumber.equal(initialTokensOfReceiver);
        currentTokensOfSpender.should.be.bignumber.equal(initialTokenOfSpender);
    });

    it('should have zero token balance for Non-Member', async function () {
        let tokensOfNonMember = await nxmtk1.balanceOf(nonMember);
        tokensOfNonMember.should.be.bignumber.equal(new BigNumber(0));
    });

    it('should not able to purchase NXM Tokens if not a memberr', async function () {
        await assertRevert(P1.buyTokenBegin({from: nonMember, value: Tokens}));
        let tokensOfNonMember = await nxmtk1.balanceOf(nonMember);
        tokensOfNonMember.should.be.bignumber.equal(new BigNumber(0));
    });

    it('should not able to transfer Tokens to Non-Member', async function () {
        let initialTokenMember = await nxmtk1.balanceOf(member);
        let initialTokenOfNonMember = await nxmtk1.balanceOf(nonMember);
        await assertRevert(nxmtk1.transfer(nonMember, tokensToTransfer));
        let presentTokenMember = await nxmtk1.balanceOf(member);
        let presentTokenOfNonMember = await nxmtk1.balanceOf(nonMember);
        presentTokenMember.should.be.bignumber.equal(initialTokenMember);
        presentTokenOfNonMember.should.be.bignumber.equal(initialTokenOfNonMember);

    });

    it('should not able to lock Tokens under CA more than once', async function () {
        let NOW = Math.floor(Date.now()/1000);
        let initialLocked = await nxmtk1.tokensLocked(member, CLA, NOW);
        let validity = NOW+(LockDays*24*3600);
        await assertRevert(nxmtk1.lock(CLA, Tokens, validity));
        let currentLocked = await nxmtk1.tokensLocked(member, CLA, NOW);
        currentLocked.should.be.bignumber.equal(initialLocked);
    });

    it('should not able to transfer locked Tokens', async function () {
        let totalTokens = await nxmtd.getBalanceOf(member);
        await assertRevert(nxmtk1.transfer(receiver, totalTokens));
    });
});
