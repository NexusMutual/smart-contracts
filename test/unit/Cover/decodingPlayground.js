const { ether, expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const { artifacts, web3 } = require('hardhat');
const { assert } = require('chai');
const { calculateMCRRatio, percentageBN } = require('../utils').tokenPrice;
const { BN } = web3.utils;

const { members: [member] } = require('../utils').accounts;

const DecodingPlayground = artifacts.require('DecodingPlayground');

describe.only('decodingPlayground', function () {

  it('reverts on purchase with msg.value = 0', async function () {
    console.log('deploying contract..');
    const p = await DecodingPlayground.new();

    const sig = { r:
      '0x7be921fd7899e0cdc2bec3b93ebf4710707a191bd6498666b79433239db8569f',
        s:
      '0x2a16cc7022cc4c6440f55dd2b8eb49d567ff2edf9f34063f6da5b3a542c1b5dd'
    };

    console.log('encoding');
    const encoded = web3.eth.abi.encodeParameters(['uint', 'uint', 'uint8', 'bytes32', 'bytes32'], [1, 2, 3, sig.r, sig.s]);
    console.log(encoded);
    console.log('requesting...');
    const r = await p.decodeParam(encoded);
    console.log(r);
  });
});
