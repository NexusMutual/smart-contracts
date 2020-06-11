const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsDataMock');

const ClaimsReward = artifacts.require('ClaimsReward');
const DAI = artifacts.require('MockDAI');
const DSValue = artifacts.require('NXMDSValueMock');
const NXMaster = artifacts.require('NXMaster');

const MCR = artifacts.require('MCR');
const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenDataMock');
const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolDataMock');
const Quotation = artifacts.require('Quotation');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const MemberRoles = artifacts.require('MemberRoles');
const Governance = artifacts.require('Governance');
const ProposalCategory = artifacts.require('ProposalCategory');
const FactoryMock = artifacts.require('FactoryMock');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const NewInternalContract = artifacts.require('NewInternalContract');
const NewProxyInternalContract = artifacts.require('NewProxyInternalContract');
const NewDataInternalContract = artifacts.require('NewDataInternalContract');

const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const Exchange_0x = web3.eth.accounts[17];

const {ether, toHex, toWei} = require('./utils/ethTools');
const {increaseTime, duration} = require('./utils/increaseTime');
const {assertRevert} = require('./utils/assertRevert');
const gvProp = require('./utils/gvProposal.js').gvProposal;
const encode = require('./utils/encoder.js').encode;
const encode1 = require('./utils/encoder.js').encode1;
const getValue = require('./utils/getMCRPerThreshold.js').getValue;
const getQuoteValues = require('./utils/getQuote.js').getQuoteValues;
const {latestTime} = require('./utils/latestTime');
const BN = web3.utils.BN;
const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const coverPeriod = 61;
const coverDetails = [1, '3362445813369838', '744892736679184', '7972408607'];

let nxms;
let nxmtk;
let tf;
let tc;
let td;
let pl1;
let pl2;
let pd;
let qt;
let qd;
let cl;
let cr;
let cd;
let mcr;
let addr = [];
let dai;
let dsv;
let newMaster;
let memberRoles;
let gov;
let propCat;
let factory;
let newCL;
let newCR;
let newMC;
let newP1;
let newP2;
let newQT;
let newTF;
let nxmMas;
let mrCon;
let tkCon;

contract('NXMaster', function([
  owner,
  newOwner,
  member,
  nonMember,
  anotherAccount,
  govVoter1,
  govVoter2,
  govVoter3,
  govVoter4
]) {
  // const fee = ether(0.002);
  const fee = toWei(0.002);
  const poolEther = ether(2);
  const founderAddress = web3.eth.accounts[19];
  const INITIAL_SUPPLY = ether(1500000);
  const pauseTime = new web3.utils.BN(2419200);
  const BOOK_TIME = new BN(duration.hours(13).toString());
  const UNLIMITED_ALLOWANCE = new BN((2).toString())
    .pow(new BN((256).toString()))
    .sub(new BN((1).toString()));

  before(async function() {
    let dsv = await DSValue.deployed();
    factory = await FactoryMock.deployed();
    qd = await QuotationDataMock.deployed();
    nxms = await NXMaster.at(await qd.ms());
    td = await TokenData.deployed();
    tf = await TokenFunctions.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress(toHex('TC')));
    cd = await ClaimsData.deployed();
    pd = await PoolData.deployed();
    qt = await Quotation.deployed();
    nxmtk = await NXMToken.deployed();
    cl = await Claims.deployed();
    cr = await ClaimsReward.deployed();
    pl1 = await Pool1.deployed();
    pl2 = await Pool2.deployed();
    mcr = await MCR.deployed();
    dai = await DAI.deployed();
    propCat = await ProposalCategory.at(
      await nxms.getLatestAddress(toHex('PC'))
    );
    memberRoles = await MemberRoles.new();
    let oldMR = await MemberRoles.at(await nxms.getLatestAddress(toHex('MR')));
    mrCon = oldMR;
    let oldTk = await NXMToken.deployed();
    tkCon = oldTk;
    let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
    gov = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
    const Web3 = require('web3');
    const web3 = new Web3(
      new Web3.providers.HttpProvider('http://localhost:8545')
    );
    await oldMR.addMembersBeforeLaunch([], []);
    (await oldMR.launched()).should.be.equal(true);
    await mcr.addMCRData(
      await getValue(toWei(2), pd, mcr),
      toWei(100),
      toWei(2),
      ['0x455448', '0x444149'],
      [100, 65407],
      20181011
    );
    (await pd.capReached()).toString().should.be.equal((1).toString());

    addr.push(qd.address);
    addr.push(td.address);
    addr.push(cd.address);
    addr.push(pd.address);
    addr.push(qt.address);
    addr.push(tf.address);
    addr.push(tc.address);
    addr.push(cl.address);
    addr.push(cr.address);
    addr.push(pl1.address);
    addr.push(pl2.address);
    addr.push(mcr.address);
    addr.push(oldGv.address);
    addr.push(propCat.address);
    addr.push(oldMR.address);
    for (let itr = 5; itr < 9; itr++) {
      await oldMR.payJoiningFee(web3.eth.accounts[itr], {
        from: web3.eth.accounts[itr],
        value: fee
      });
      await oldMR.kycVerdict(web3.eth.accounts[itr], true);
      let isMember = await nxms.isMember(web3.eth.accounts[itr]);
      isMember.should.equal(true);

      await oldTk.transfer(web3.eth.accounts[itr], toWei(37500));
    }
    await tkCon.approve(
      await nxms.getLatestAddress(toHex('TC')),
      UNLIMITED_ALLOWANCE,
      {from: govVoter4}
    );
    await tc.lock(toHex('CLA'), ether(400), duration.days(500), {
      from: govVoter4
    });
    async function updateCategory(nxmAdd, functionName, updateCat) {
      let abReq = 80;
      if (updateCat == 27) abReq = 60;
      let actionHash = encode1(
        [
          'uint256',
          'string',
          'uint256',
          'uint256',
          'uint256',
          'uint256[]',
          'uint256',
          'string',
          'address',
          'bytes2',
          'uint256[]',
          'string'
        ],
        [
          updateCat,
          'Edit Category',
          2,
          50,
          15,
          [2],
          604800,
          '',
          nxmAdd,
          toHex('MS'),
          [0, 0, abReq, 0],
          functionName
        ]
      );
      await gvProp(4, actionHash, oldMR, oldGv, 1);
    }
    await updateCategory(
      nxms.address,
      'upgradeMultipleContracts(bytes2[],address[])',
      29
    );
    await updateCategory(
      nxms.address,
      'upgradeMultipleImplementations(bytes2[],address[])',
      5
    );
    await updateCategory(nxms.address, 'upgradeTo(address)', 27);
  });

  describe('Update master address', function() {
    it('Update master address after posting data in governance implementation', async function() {
      let proxy = await OwnedUpgradeabilityProxy.at(gov.address);
      let implementation = await Governance.at(await proxy.implementation());
      await implementation.changeMasterAddress(owner);
      proxy = await OwnedUpgradeabilityProxy.at(
        await nxms.getLatestAddress(toHex('PC'))
      );
      implementation = await ProposalCategory.at(await proxy.implementation());
      await implementation.changeMasterAddress(owner);
      proxy = await OwnedUpgradeabilityProxy.at(
        await nxms.getLatestAddress(toHex('MR'))
      );
      implementation = await MemberRoles.at(await proxy.implementation());
      await implementation.changeMasterAddress(owner);
      assert.equal(await implementation.ms(), owner);
      let newMaster = await NXMaster.new();
      let actionHash = encode1(['address'], [newMaster.address]);
      await gvProp(
        27,
        actionHash,
        await MemberRoles.at(await nxms.getLatestAddress(toHex('MR'))),
        gov,
        2
      );
      let implInc = await OwnedUpgradeabilityProxy.at(nxms.address);
      assert.equal(await implInc.implementation(), newMaster.address);
    });

    it('Create a sample proposal after updating master', async function() {
      let actionHash = encode(
        'updateUintParameters(bytes8,uint256)',
        toHex('MAXFOL'),
        7
      );
      await gvProp(
        22,
        actionHash,
        await MemberRoles.at(await nxms.getLatestAddress(toHex('MR'))),
        gov,
        2
      );
      assert.equal(
        (await gov.getUintParameters(toHex('MAXFOL')))[1].toNumber(),
        7
      );
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
    });

    it('Status=12 issue should be resolved after upgrade', async function() {
      await tkCon.approve(
        await nxms.getLatestAddress(toHex('TC')),
        UNLIMITED_ALLOWANCE,
        {from: govVoter4}
      );
      coverDetails[4] = '7972408607006';
      var vrsdata = await getQuoteValues(
        coverDetails,
        toHex('ETH'),
        coverPeriod,
        smartConAdd,
        qt.address
      );
      await pl1.makeCoverBegin(
        smartConAdd,
        toHex('ETH'),
        coverDetails,
        coverPeriod,
        vrsdata[0],
        vrsdata[1],
        vrsdata[2],
        {from: govVoter4, value: coverDetails[1]}
      );
      await cl.submitClaim((await qd.getCoverLength()) - 1, {from: govVoter4});
      let clid = (await cd.actualClaimLength()) - 1;
      await cl.submitCAVote(clid, 1, {from: govVoter4});
      let maxVoteTime = await cd.maxVotingTime();
      await increaseTime(maxVoteTime / 1 + 10);
      let BalE = await web3.eth.getBalance(pl1.address);
      let BalD = await dai.balanceOf(pl1.address);
      await tf.upgradeCapitalPool(DAI.address);
      clid = (await cd.actualClaimLength()) - 1;
      let payOutRetry = await cd.payoutRetryTime();
      await increaseTime(payOutRetry / 1);
      let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await pl1.__callback(apiid, '');
      let cStatus = await cd.getClaimStatusNumber(clid);
      (12).should.be.equal(parseFloat(cStatus[1]));

      apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 2);
      await assertRevert(pl1.__callback(apiid, ''));
      await assertRevert(nxms.closeClaim(clid));
      await increaseTime(payOutRetry / 1);
      await nxms.closeClaim(clid);
      assert.equal(await cd.getClaimState12Count(clid), 1);
      await increaseTime(payOutRetry / 1);
      await pl1.__callback(apiid, '');
      assert.equal(await cd.getClaimState12Count(clid), 2);
      await pl1.sendEther({from: owner, value: BalE});
      await dai.transfer(pl1.address, BalD);
      await increaseTime(payOutRetry / 1);
      await nxms.closeClaim(clid);
    });

    it('Creating scenario for external liquidity trade, Should not allow to call before call time is reached', async function() {
      await pl1.transferFundToOtherAdd(owner, toWei(999));
      // await pl1.upgradeInvestmentPool(owner);
      await pl1.sendEther({from: owner, value: toWei(1000)});
      await dai.transfer(pl2.address, toWei(20));
      await pl1.internalLiquiditySwap(toHex('ETH'));
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await assertRevert(pl1.__callback(APIID, ''));
    });

    it('Creating scenario for external liquidity trade, Should not allow to call multiple times when time is reached', async function() {
      await increaseTime(5 * 60 * 60);
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await pl1.__callback(APIID, '');
      await assertRevert(pl1.__callback(APIID, ''));
      await assertRevert(pl1.__callback(APIID, ''));
    });

    it('Create scenario start emergency pause, should be closed by callback after pauseTime', async function() {
      let actionHash = encode('startEmergencyPause()');
      await gvProp(
        6,
        actionHash,
        await MemberRoles.at(await nxms.getLatestAddress(toHex('MR'))),
        gov,
        1
      );
      assert.equal(await nxms.isPause(), true);
      await increaseTime(5 * 7 * 24 * 60 * 60);
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await pl1.__callback(APIID, '');
      await assertRevert(pl1.__callback(APIID, ''));
      assert.equal(await nxms.isPause(), false);
    });

    it('Emergency pasue started for second time, Should not allow to close emergency pause using previous callback id', async function() {
      let actionHash = encode('startEmergencyPause()');
      await gvProp(
        6,
        actionHash,
        await MemberRoles.at(await nxms.getLatestAddress(toHex('MR'))),
        gov,
        1
      );
      assert.equal(await nxms.isPause(), true);
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 2);
      await assertRevert(pl1.__callback(APIID, ''));
      assert.equal(await nxms.isPause(), true);
      await increaseTime(5 * 7 * 24 * 60 * 60);
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await pl1.__callback(APIID, '');
      assert.equal(await nxms.isPause(), false);
    });

    // it('Edit categories for upgrading multiple implementation, upgrading multiple contracts', async function() {
    //   propCat = await ProposalCategory.at(
    //     await nxms.getLatestAddress(toHex('PC'))
    //   );
    //   // Update category for upgrading multiple contracts
    //   let actionHash = encode(
    //     'updateCategory(uint,string,uint,uint,uint,uint[],uint,string,address,bytes2,uint[])',
    //     29,
    //     'Release new smart contract code',
    //     2,
    //     80,
    //     15,
    //     [1],
    //     604800,
    //     '',
    //     nxms.address,
    //     toHex('MS'),
    //     [0, 0, 0]
    //   );
    //   let oldMR = await MemberRoles.at(
    //     await nxms.getLatestAddress(toHex('MR'))
    //   );
    //   // let oldTk = await NXMToken.deployed();

    //   let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
    //   let p1 = await oldGv.getProposalLength();
    //   await oldGv.createProposalwithSolution(
    //     'Update category',
    //     'Update category',
    //     'Update category',
    //     3,
    //     'Update category',
    //     actionHash
    //   );
    //   await oldGv.submitVote(p1.toNumber(), 1);
    //   await oldGv.closeProposal(p1.toNumber());
    //   // Update category for upgrading multiple implementation
    //   actionHash = encode(
    //     'updateCategory(uint,string,uint,uint,uint,uint[],uint,string,address,bytes2,uint[])',
    //     5,
    //     'Upgrade a contract Implementation',
    //     2,
    //     80,
    //     15,
    //     [1],
    //     604800,
    //     '',
    //     nxms.address,
    //     toHex('MS'),
    //     [0, 0, 0]
    //   );
    //   p1 = await oldGv.getProposalLength();
    //   await oldGv.createProposalwithSolution(
    //     'Update category',
    //     'Update category',
    //     'Update category',
    //     3,
    //     'Update category',
    //     actionHash
    //   );
    //   await oldGv.submitVote(p1.toNumber(), 1);
    //   await oldGv.closeProposal(p1.toNumber());
    // });

    it('Sending funds to funds to QT, CR, P1, P2', async function() {
      await qt.sendEther({from: owner, value: toWei(100)});
      await pl1.sendEther({from: owner, value: toWei(100)});
      await pl2.sendEther({from: owner, value: toWei(100)});
      await dai.transfer(pl1.address, toWei(100));
      await dai.transfer(pl2.address, toWei(100));
      await tf.mint(cr.address, toWei(1));
      await tf.mint(await nxms.getLatestAddress(toHex('TC')), toWei(1));
    });

    it('Upgrade multiple contract contracts', async function() {
      let crBalnxm = await nxmtk.balanceOf(cr.address);
      let p1balDai = await dai.balanceOf(pl1.address);
      let p2balDai = await dai.balanceOf(pl2.address);
      let qtbalEth = await web3.eth.getBalance(qt.address);
      let p1balEth = await web3.eth.getBalance(pl1.address);
      let p2balEth = await web3.eth.getBalance(pl2.address);
      let tokPrice = await tf.getTokenPrice(toHex('ETH'));
      let claimDetails = await cl.getClaimbyIndex(0);
      let catId = 29;
      newCL = await Claims.new();
      newCR = await ClaimsReward.new();
      newMC = await MCR.new();
      newP1 = await Pool1.new();
      newP2 = await Pool2.new(await pl2.uniswapFactoryAddress());
      newQT = await Quotation.new();
      newTF = await TokenFunctions.new();
      actionHash = encode1(
        ['bytes2[]', 'address[]'],
        [
          [
            toHex('CL'),
            toHex('CR'),
            toHex('MC'),
            toHex('P1'),
            toHex('P2'),
            toHex('QT'),
            toHex('TF')
          ],
          [
            newCL.address,
            newCR.address,
            newMC.address,
            newP1.address,
            newP2.address,
            newQT.address,
            newTF.address
          ]
        ]
      );

      await gvProp(
        catId,
        actionHash,
        await MemberRoles.at(await nxms.getLatestAddress(toHex('MR'))),
        await Governance.at(await nxms.getLatestAddress(toHex('GV'))),
        2
      );

      console.log('====== Checking Upgraded Contract addresses =====');
      assert.equal(newCL.address, await nxms.getLatestAddress(toHex('CL')));
      assert.equal(newCR.address, await nxms.getLatestAddress(toHex('CR')));
      assert.equal(newMC.address, await nxms.getLatestAddress(toHex('MC')));
      assert.equal(newP1.address, await nxms.getLatestAddress(toHex('P1')));
      assert.equal(newP2.address, await nxms.getLatestAddress(toHex('P2')));
      assert.equal(newQT.address, await nxms.getLatestAddress(toHex('QT')));
      assert.equal(newTF.address, await nxms.getLatestAddress(toHex('TF')));
      console.log('====== Checking Master address in upgraded Contracts =====');
      assert.equal(await newCL.nxMasterAddress(), nxms.address);
      assert.equal(await newCR.nxMasterAddress(), nxms.address);
      assert.equal(await newMC.nxMasterAddress(), nxms.address);
      assert.equal(await newP1.nxMasterAddress(), nxms.address);
      assert.equal(await newP2.nxMasterAddress(), nxms.address);
      assert.equal(await newQT.nxMasterAddress(), nxms.address);
      assert.equal(await newTF.nxMasterAddress(), nxms.address);
      console.log('====== Checking Funds transfer in upgraded Contracts =====');
      assert.equal((await nxmtk.balanceOf(newCR.address)) / 1, crBalnxm / 1);
      assert.equal((await dai.balanceOf(newP1.address)) / 1, p1balDai / 1);
      assert.equal((await dai.balanceOf(newP2.address)) / 1, p2balDai / 1);
      assert.equal(
        (await web3.eth.getBalance(newQT.address)) / 1,
        qtbalEth / 1
      );
      assert.equal(
        (await web3.eth.getBalance(newP1.address)) / 1,
        p1balEth / 1
      );
      assert.equal(
        (await web3.eth.getBalance(newP2.address)) / 1,
        p2balEth / 1
      );
      console.log('====== Checking getters in upgraded Contracts =====');
      assert.equal((await newTF.getTokenPrice(toHex('ETH'))) / 1, tokPrice / 1);
      assert.equal(
        (await newMC.calculateTokenPrice(toHex('ETH'))) / 1,
        tokPrice / 1
      );
      assert.equal(
        (await newCL.getClaimbyIndex(0)).toString(),
        claimDetails.toString()
      );
    });

    it('Upgrade multiple contract implemenations', async function() {
      oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      oldMR = await MemberRoles.at(await nxms.getLatestAddress(toHex('MR')));
      oldTC = await TokenController.at(
        await nxms.getLatestAddress(toHex('TC'))
      );
      oldPC = await ProposalCategory.at(
        await nxms.getLatestAddress(toHex('PC'))
      );
      let tcbalNxm = await nxmtk.balanceOf(
        await nxms.getLatestAddress(toHex('TC'))
      );
      let proposalDetails = await oldGv.proposal(1);
      let totalSupply = await oldTC.totalSupply();
      let catDetails = await oldPC.category(5);
      let members = await oldMR.members(2);
      let catId = 5;
      let newGV = await Governance.new();
      let newPC = await ProposalCategory.new();
      let newMR = await MemberRoles.new();
      let newTC = await TokenController.new();
      actionHash = encode1(
        ['bytes2[]', 'address[]'],
        [
          [toHex('GV'), toHex('PC'), toHex('MR'), toHex('TC')],
          [newGV.address, newPC.address, newMR.address, newTC.address]
        ]
      );

      await gvProp(
        catId,
        actionHash,
        await MemberRoles.at(await nxms.getLatestAddress(toHex('MR'))),
        await Governance.at(await nxms.getLatestAddress(toHex('GV'))),
        2
      );
      console.log('====== Checking Upgraded Contract addresses =====');
      assert.equal(newGV.address, await qd.getImplementationAdd(toHex('GV')));
      assert.equal(newPC.address, await qd.getImplementationAdd(toHex('PC')));
      assert.equal(newMR.address, await qd.getImplementationAdd(toHex('MR')));
      assert.equal(newTC.address, await qd.getImplementationAdd(toHex('TC')));
      oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      oldMR = await MemberRoles.at(await nxms.getLatestAddress(toHex('MR')));
      console.log('====== Checking Master address in upgraded Contracts =====');
      assert.equal(nxms.address, await oldGv.ms());
      assert.equal(nxms.address, await oldMR.ms());
      assert.equal(nxms.address, await oldTC.ms());
      assert.equal(nxms.address, await oldPC.ms());
      console.log('====== Checking Funds transfer in upgraded Contracts =====');
      assert.equal(
        (await nxmtk.balanceOf(await nxms.getLatestAddress(toHex('TC')))) / 1,
        tcbalNxm / 1
      );
      console.log('====== Checking getters in upgraded Contracts =====');
      assert.equal(
        (await oldGv.proposal(1)).toString(),
        proposalDetails.toString()
      );
      assert.equal((await oldMR.members(2)).toString(), members.toString());
      assert.equal((await oldTC.totalSupply()) / 1, totalSupply / 1);
      assert.equal((await oldPC.category(5)).toString(), catDetails.toString());
    });

    it('Add new category to add internal contracts', async function() {
      // Creating category for adding new internal contracts
      actionHash = encode1(
        [
          'string',
          'uint256',
          'uint256',
          'uint256',
          'uint256[]',
          'uint256',
          'string',
          'address',
          'bytes2',
          'uint256[]',
          'string'
        ],
        [
          'Adding new category',
          2,
          1,
          0,
          [1],
          604800,
          '',
          nxms.address,
          toHex('MS'),
          [0, 0, 0, 0],
          'addNewInternalContract(bytes2,address,uint256)'
        ]
      );
      await gvProp(3, actionHash, oldMR, oldGv, 1);
    });

    it('Add new Upgradable Internal contract', async function() {
      let nic = await NewInternalContract.new();
      let CatId = await oldPC.totalCategories();
      // Creating proposal for adding new internal contract
      actionHash = encode(
        'addNewInternalContract(bytes2,address,uint256)',
        toHex('NW'),
        nic.address,
        1
      );

      await gvProp(
        CatId - 1,
        actionHash,
        await MemberRoles.at(await nxms.getLatestAddress(toHex('MR'))),
        await Governance.at(await nxms.getLatestAddress(toHex('GV'))),
        2
      );
      p1 = await oldGv.getProposalLength();

      assert.equal(nic.address, await nxms.getLatestAddress(toHex('NW')));
      assert.equal(nxms.address, await nic.ms());
      assert.equal(await nxms.isUpgradable(toHex('NW')), true);
      assert.equal(await nxms.isProxy(toHex('NW')), false);
      assert.equal(await nxms.isInternal(nic.address), true);
      assert.notEqual(await nxms.pauseTime(), 152);
      await nic.callUpdatePauseTime(152);
      assert.equal(await nxms.pauseTime(), 152);
    });
    it('Add new Proxy Internal contract', async function() {
      let nic = await NewProxyInternalContract.new();
      let CatId = await oldPC.totalCategories();
      // Creating proposal for adding new proxy internal contract
      actionHash = encode(
        'addNewInternalContract(bytes2,address,uint256)',
        toHex('NP'),
        nic.address,
        2
      );

      await gvProp(
        CatId - 1,
        actionHash,
        await MemberRoles.at(await nxms.getLatestAddress(toHex('MR'))),
        await Governance.at(await nxms.getLatestAddress(toHex('GV'))),
        2
      );
      p1 = await oldGv.getProposalLength();
      assert.equal(nic.address, await qd.getImplementationAdd(toHex('NP')));
      let proxyINS = await NewProxyInternalContract.at(
        await nxms.getLatestAddress(toHex('NP'))
      );
      assert.equal(nxms.address, await proxyINS.ms());
      assert.equal(await nxms.isUpgradable(toHex('NP')), false);
      assert.equal(await nxms.isProxy(toHex('NP')), true);
      assert.equal(await nxms.isInternal(nic.address), false);
      assert.equal(await nxms.isInternal(proxyINS.address), true);
      assert.notEqual(await nxms.pauseTime(), 200);
      await proxyINS.callUpdatePauseTime(200);
      assert.equal(await nxms.pauseTime(), 200);
    });
    it('Add new Non-Proxy, Non-Upgradable Internal contract', async function() {
      let nic = await NewDataInternalContract.new();
      let CatId = await oldPC.totalCategories();
      // Creating proposal for adding new proxy internal contract
      actionHash = encode(
        'addNewInternalContract(bytes2,address,uint256)',
        toHex('ND'),
        nic.address,
        3
      );

      await gvProp(
        CatId - 1,
        actionHash,
        await MemberRoles.at(await nxms.getLatestAddress(toHex('MR'))),
        await Governance.at(await nxms.getLatestAddress(toHex('GV'))),
        2
      );
      p1 = await oldGv.getProposalLength();
      assert.equal(nic.address, await nxms.getLatestAddress(toHex('ND')));
      assert.equal(nxms.address, await nic.ms());
      assert.equal(await nxms.isUpgradable(toHex('ND')), false);
      assert.equal(await nxms.isProxy(toHex('ND')), false);
      assert.equal(await nxms.isInternal(nic.address), true);
      assert.notEqual(await nxms.pauseTime(), 300);
      await nic.callUpdatePauseTime(300);
      assert.equal(await nxms.pauseTime(), 300);
    });
    it('Check if new master is updated properly', async function() {
      let tcProxy = await TokenController.at(
        await nxms.getLatestAddress(toHex('TC'))
      );
      let mrProxy = await MemberRoles.at(
        await nxms.getLatestAddress(toHex('MR'))
      );
      let catProxy = await ProposalCategory.at(
        await nxms.getLatestAddress(toHex('PC'))
      );

      assert.equal(nxms.address, await qd.ms());
      assert.equal(nxms.address, await td.ms());
      assert.equal(nxms.address, await cd.ms());
      assert.equal(nxms.address, await pd.ms());
      assert.equal(nxms.address, await newQT.ms());
      assert.equal(nxms.address, await newTF.ms());
      assert.equal(nxms.address, await tcProxy.ms());
      assert.equal(nxms.address, await newCL.ms());
      assert.equal(nxms.address, await newCR.ms());
      assert.equal(nxms.address, await newP1.ms());
      assert.equal(nxms.address, await newP2.ms());
      assert.equal(nxms.address, await newMC.ms());
      assert.equal(nxms.address, await gov.ms());
      assert.equal(nxms.address, await mrProxy.ms());
      assert.equal(nxms.address, await catProxy.ms());
    });
  });
  describe('Negative Test Cases', function() {
    it('Upgrade contract should revert if called directly', async function() {
      await assertRevert(
        nxms.upgradeMultipleContracts([toHex('P1')], [pl1.address])
      );
      await assertRevert(
        nxms.upgradeMultipleImplementations([toHex('GV')], [gov.address])
      );
    });
    it('Upgrade contract should revert if array length is different for contract code and address', async function() {
      await assertRevert(
        nxms.upgradeMultipleContracts([toHex('P1'), toHex('P2')], [pl1.address])
      );
      await assertRevert(
        nxms.upgradeMultipleImplementations(
          [toHex('GV')],
          [gov.address, pl1.address]
        )
      );
    });
    it('Add internal contract should revert if called directly', async function() {
      await assertRevert(
        nxms.addNewInternalContract(toHex('PS'), pl1.address, 1)
      );
    });
    it('Add internal contract should revert if new contract code already exist', async function() {
      await assertRevert(
        nxms.addNewInternalContract(toHex('P1'), pl1.address, 1)
      );
    });
    it('Add internal contract should revert if new contract address is null', async function() {
      await assertRevert(
        nxms.addNewInternalContract(toHex('PS'), ZERO_ADDRESS, 1)
      );
    });
    it('Upgrade contract implementation should revert if new address is null', async function() {
      oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      oldMR = await MemberRoles.at(await nxms.getLatestAddress(toHex('MR')));
      gvImplementation = await qd.getImplementationAdd(toHex('GV'));
      oldPC = await ProposalCategory.at(
        await nxms.getLatestAddress(toHex('PC'))
      );

      let catId = 5;

      actionHash = encode1(
        ['bytes2[]', 'address[]'],
        [[toHex('GV')], [ZERO_ADDRESS]]
      );

      await gvProp(
        catId,
        actionHash,
        await MemberRoles.at(await nxms.getLatestAddress(toHex('MR'))),
        await Governance.at(await nxms.getLatestAddress(toHex('GV'))),
        2
      );
      assert.equal(
        gvImplementation,
        await qd.getImplementationAdd(toHex('GV'))
      );
    });
    it('Upgrade contract should revert if new address is null', async function() {
      let catId = 29;
      let clAddress = await nxms.getLatestAddress(toHex('CL'));

      actionHash = encode1(
        ['bytes2[]', 'address[]'],
        [[toHex('CL')], [ZERO_ADDRESS]]
      );

      await gvProp(
        catId,
        actionHash,
        await MemberRoles.at(await nxms.getLatestAddress(toHex('MR'))),
        await Governance.at(await nxms.getLatestAddress(toHex('GV'))),
        2
      );
      assert.equal(clAddress, await nxms.getLatestAddress(toHex('CL')));
    });
    it('Upgrade contract implementation should revert if contract type is not isProxy', async function() {
      oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      oldMR = await MemberRoles.at(await nxms.getLatestAddress(toHex('MR')));
      clAddress = await nxms.getLatestAddress(toHex('CL'));
      oldPC = await ProposalCategory.at(
        await nxms.getLatestAddress(toHex('PC'))
      );
      let newCL = await Claims.new();
      let catId = 5;

      actionHash = encode1(
        ['bytes2[]', 'address[]'],
        [[toHex('CL')], [newCL.address]]
      );

      await gvProp(
        catId,
        actionHash,
        await MemberRoles.at(await nxms.getLatestAddress(toHex('MR'))),
        await Governance.at(await nxms.getLatestAddress(toHex('GV'))),
        2
      );
      assert.equal(clAddress, await nxms.getLatestAddress(toHex('CL')));
    });
    it('Upgrade contract should revert if contract type is not isUpgradable', async function() {
      let catId = 29;
      let gvImplementation = await qd.getImplementationAdd(toHex('GV'));
      let gvNew = await Governance.new();

      actionHash = encode1(
        ['bytes2[]', 'address[]'],
        [[toHex('GV')], [gvNew.address]]
      );

      await gvProp(
        catId,
        actionHash,
        await MemberRoles.at(await nxms.getLatestAddress(toHex('MR'))),
        await Governance.at(await nxms.getLatestAddress(toHex('GV'))),
        2
      );
      assert.equal(
        gvImplementation,
        await qd.getImplementationAdd(toHex('GV'))
      );
    });
    it('Should revert if passed invalid _by param in addEmergencyPause', async function() {
      await assertRevert(nxms.addEmergencyPause(true, toHex('ABC')));
    });

    it('Should revert if caller is not proxyOwner', async function() {
      nxmMas = await NXMaster.new();
      nxmMas = await OwnedUpgradeabilityProxy.new(nxmMas.address);
      nxmMas = await NXMaster.at(nxmMas.address);
      await assertRevert(
        nxmMas.initiateMaster(nxmtk.address, {from: newOwner})
      );
      await nxmMas.initiateMaster(nxmtk.address);
    });
    it('Should revert if master already initiated', async function() {
      await assertRevert(nxmMas.initiateMaster(nxmtk.address));
    });
  });
});
