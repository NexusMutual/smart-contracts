const Pool1 = artifacts.require('Pool1');
const NXMToken1 = artifacts.require('NXMToken1');
const NXMToken2 = artifacts.require('NXMToken2');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationData = artifacts.require('QuotationData');
const Quotation = artifacts.require('Quotation');
const DAI = artifacts.require('DAI');
const NXMTokenData = artifacts.require('NXMTokenData');
const CA_ETH = '0x45544800';
const CA_DAI = '0x44414900';
const member = web3.eth.accounts[1];
const coverHolder = web3.eth.accounts[4];
const fee = web3.toWei(0.002);
const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const PID = 0;
const PNAME = '0x5343430000000000';
const PHASH = 'Smart Contract Cover';
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const coverPeriod = 61;
const coverDetails = [5, 1176856034679443, 260712457837714, 7972408607];
const coverDetailsDai = [5, 16812229066849188, 5694231991898, 7972408607];
const v = 27;
const r = '0x30c1449cd8c7e4c25760e3eb31e6f5812efe9622a3db4a525b8f0e53cb749ed9';
const s = '0x11ec3139bf601c2a31bd5e4af8e05b6f9ced428da9f4654ba5feb9018f828ee4';
const r_dai =
  '0xdcaa177410672d90890f1c0a42a965b3af9026c04caedbce9731cb43827e8556';
const s_dai =
  '0x2b9f34e81cbb79f9af4b8908a7ef8fdb5875dedf5a69f84cd6a80d2a4cc8efff';

let P1;
let nxmtk1;
let nxmtk2;
let cr;
let qd;
let qt;
let cad;
let td;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

describe('Contract: 5_Quotation', function() {
  const BN_100 = new BigNumber(100);
  const BN_5 = new BigNumber(5);
  const BN_20 = new BigNumber(20);
  const BN_95 = new BigNumber(95);
  const tk = new BigNumber(2e18);
  before(function() {
    NXMToken1.deployed()
      .then(function(instance) {
        nxmtk1 = instance;
        return NXMToken2.deployed();
      })
      .then(function(instance) {
        nxmtk2 = instance;
        return ClaimsReward.deployed();
      })
      .then(function(instance) {
        cr = instance;
        return QuotationData.deployed();
      })
      .then(function(instance) {
        qd = instance;
        return Pool1.deployed();
      })
      .then(function(instance) {
        P1 = instance;
        return Quotation.deployed();
      })
      .then(function(instance) {
        qt = instance;
        return DAI.deployed();
      })
      .then(function(instance) {
        cad = instance;
      });
  });

  it('should return correct AuthQuoteEngine address', async function() {
    let authQE = await qd.getAuthQuoteEngine();
    authQE.should.equal(QE);
  });

  it('should return correct AuthQuoteEngine address', async function() {
    let authQE = await qd.getAuthQuoteEngine();
    authQE.should.equal(QE);
  });

  it('should return correct product name', async function() {
    let pname = await qd.getProductName(PID);
    pname.should.equal(PNAME);
  });

  it('should able to Purchase Cover With Ether', async function() {
    this.timeout(0);
    td = await NXMTokenData.deployed();
    await nxmtk2.payJoiningFee({ from: coverHolder, value: fee });
    let initialLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    let initialAvailableToken = await cr.getTotalStakeCommission(member); // member=staker for smart contract
    let initialPoolBalance = await P1.getEtherPoolBalance();
    let initialTotalSA = await qd.getTotalSumAssured(CA_ETH);
    let initialTokensOfCoverHolder = await td.getBalanceOf(coverHolder);
    let initialTotalSupply = await td.totalSupply();
    // let initialUserBal = await web3.eth.getBalance(coverHolder);
    await P1.makeCoverBegin(
      PID,
      smartConAdd,
      'ETH',
      coverDetails,
      coverPeriod,
      v,
      r,
      s,
      { from: coverHolder, value: coverDetails[1] }
    );
    let presentLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    let presentAvailableToken = await cr.getTotalStakeCommission(member); // staker should get 20% of premium.
    let presentPoolBalance = await P1.getEtherPoolBalance();
    let presentTotalSA = await qd.getTotalSumAssured(CA_ETH);
    let presentTokensOfCoverHolder = await td.getBalanceOf(coverHolder);
    let presentTotalSupply = await td.totalSupply();
    // let presentUserBal = await web3.eth.getBalance(coverHolder);
    let newLockedCN = initialLockedCN
      .plus(BN_5.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
      .toFixed(0);
    let newAvailableToken = initialAvailableToken
      .plus(BN_20.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
      .toFixed(0);
    let newPoolBalance = initialPoolBalance
      .plus(new BigNumber(coverDetails[1].toString()))
      .toFixed(0);
    let newTotalCA = initialTotalSA.plus(coverDetails[0]);
    let newTokensOfCoverHolder = initialTokensOfCoverHolder.plus(
      new BigNumber(newLockedCN.toString())
    );
    let newTotalSupply = initialTotalSupply
      .plus(new BigNumber(newLockedCN.toString()))
      .plus(BN_20.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
      .toFixed(0);
    // let newUserBal = initialUserBal.minus(new BigNumber(coverDetails[1].toString()));
    newLockedCN.should.be.bignumber.equal(presentLockedCN);
    newAvailableToken.should.be.bignumber.equal(presentAvailableToken);
    newPoolBalance.should.be.bignumber.equal(presentPoolBalance);
    newTotalCA.should.be.bignumber.equal(presentTotalSA);
    newTokensOfCoverHolder.should.be.bignumber.equal(
      presentTokensOfCoverHolder
    );
    newTotalSupply.should.be.bignumber.equal(presentTotalSupply);
    // newUserBal.should.be.bignumber.equal(presentUserBal);//new BigNumber(presentUserBal.toString()));
  });

  it('should return correct cover details purchased with ether', async function() {
    let CID = await qd.getAllCoversOfUser(coverHolder);
    let checkd = false;
    let cdetails1 = await qd.getCoverDetailsByCoverID1(CID[0]);
    let cdetails2 = await qd.getCoverDetailsByCoverID2(CID[0]);
    if (
      cdetails2[1] == CA_ETH &&
      cdetails1[1] == PNAME &&
      cdetails1[2] == coverHolder &&
      cdetails1[3] == smartConAdd
    ) {
      checkd = true;
    }
    checkd.should.equal(true);
  });

  it('should able to purchase cover with NXM', async function() {
    this.timeout(0);
    await P1.buyTokenBegin({ from: coverHolder, value: tk });
    let initialTokensOfCoverHolder = await nxmtk1.balanceOf(coverHolder);
    let initialLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    let initialAvailableToken = await cr.getTotalStakeCommission(member); // member=staker for smart contract
    let initialTotalSupply = await td.totalSupply();
    console.log(initialTotalSupply.toNumber());
    await qt.makeCoverUsingNXMTokens(
      PID,
      coverDetails,
      coverPeriod,
      'ETH',
      smartConAdd,
      v,
      r,
      s,
      { from: coverHolder }
    );
    let presentTokensOfCoverHolder = await nxmtk1.balanceOf(coverHolder);
    let presentLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    let presentAvailableToken = await cr.getTotalStakeCommission(member); // staker should get 20% of premium.
    let presentTotalSupply = ((await td.totalSupply()) / 1e18).toFixed(10);
    let newTokensOfCoverHolder = initialTokensOfCoverHolder.minus(
      new BigNumber(coverDetails[2])
    );
    let newLockedCN = initialLockedCN
      .plus(BN_5.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
      .toFixed(0);
    let newAvailableToken = initialAvailableToken
      .plus(BN_20.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
      .toFixed(0);
    let newTotalSupply = initialTotalSupply.minus(
      new BigNumber(coverDetails[2].toString())
    );
    newTotalSupply = (
      newTotalSupply
        .plus(BN_5.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
        .plus(
          BN_20.times(new BigNumber(coverDetails[2].toString()).div(BN_100))
        )
        .toFixed(0) / 1e18
    ).toFixed(10);
    console.log(newTotalSupply);
    newLockedCN.should.be.bignumber.equal(presentLockedCN);
    newAvailableToken.should.be.bignumber.equal(presentAvailableToken);
    newTokensOfCoverHolder.should.be.bignumber.equal(
      presentTokensOfCoverHolder
    );
    newTotalSupply.should.be.bignumber.equal(presentTotalSupply);
  });

  it('should return correct cover details purchased with NXM', async function() {
    let CID = await qd.getAllCoversOfUser(coverHolder);
    let checkd = false;
    let cdetails1 = await qd.getCoverDetailsByCoverID1(CID[1]);
    let cdetails2 = await qd.getCoverDetailsByCoverID2(CID[1]);
    if (
      cdetails2[1] == CA_ETH &&
      cdetails1[1] == PNAME &&
      cdetails1[2] == coverHolder &&
      cdetails1[3] == smartConAdd
    ) {
      checkd = true;
    }
    checkd.should.equal(true);
  });

  it('should able to purchase cover using currency assest i.e. DAI ', async function() {
    this.timeout(0);
    await cad.transfer(coverHolder, tk);
    let initialLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    let initialCAbalance = await cad.balanceOf(coverHolder);
    let initialAvailableToken = await cr.getTotalStakeCommission(member); // member=staker for smart contract
    let initialPoolBalanceOfCA = await cad.balanceOf(P1.address);
    let presentaCAbalance = await cad.balanceOf(coverHolder);
    let initialTotalSupply = await td.totalSupply();
    await cad.approve(P1.address, coverDetailsDai[1], { from: coverHolder });
    await P1.makeCoverUsingCA(
      PID,
      smartConAdd,
      'DAI',
      coverDetailsDai,
      coverPeriod,
      v,
      r_dai,
      s_dai,
      { from: coverHolder }
    );
    let presentLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    let presentCAbalance = await cad.balanceOf(coverHolder);
    let presentAvailableToken = await cr.getTotalStakeCommission(member); // staker should get 20% of premium.
    let presentPoolBalanceOfCA = await cad.balanceOf(P1.address);
    let presentTotalSupply = await td.totalSupply();
    let newLockedCN = initialLockedCN
      .plus(
        BN_5.times(new BigNumber(coverDetailsDai[2].toString()).div(BN_100))
      )
      .toFixed(0);
    let newAvailableToken = initialAvailableToken
      .plus(
        BN_20.times(new BigNumber(coverDetailsDai[2].toString()).div(BN_100))
      )
      .toFixed(0);
    let newTotalSupply = initialTotalSupply
      .plus(new BigNumber(newLockedCN - initialLockedCN))
      .plus(newAvailableToken - initialAvailableToken)
      .toFixed(0);
    presentCAbalance.should.be.bignumber.equal(
      initialCAbalance.minus(new BigNumber(coverDetailsDai[1].toString()))
    );
    presentPoolBalanceOfCA.should.be.bignumber.equal(
      initialPoolBalanceOfCA.plus(new BigNumber(coverDetailsDai[1].toString()))
    );
    newLockedCN.should.be.bignumber.equal(presentLockedCN);
    newAvailableToken.should.be.bignumber.equal(presentAvailableToken);
    newTotalSupply.should.be.bignumber.equal(presentTotalSupply);
  });

  it('should return correct cover details purchased with DAI', async function() {
    let CID = await qd.getAllCoversOfUser(coverHolder);
    let checkd = false;
    let cdetails1 = await qd.getCoverDetailsByCoverID1(CID[2]);
    let cdetails2 = await qd.getCoverDetailsByCoverID2(CID[2]);
    if (
      cdetails2[1] == CA_DAI &&
      cdetails1[1] == PNAME &&
      cdetails1[2] == coverHolder &&
      cdetails1[3] == smartConAdd
    ) {
      checkd = true;
    }
    checkd.should.equal(true);
  });
});
