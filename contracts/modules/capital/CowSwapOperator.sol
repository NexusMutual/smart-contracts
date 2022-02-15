// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "../../external/cow/GPv2Order.sol";

interface ICowSettlement {
    function setPreSignature(bytes calldata orderUid, bool signed) external;
}

contract CowSwapOperator {
    ICowSettlement public immutable cowSettlement;
    address public immutable cowVaultRelayer;

    constructor(address _cowSettlement, address _cowVaultRelayer) {
        cowSettlement = ICowSettlement(_cowSettlement);
        cowVaultRelayer = _cowVaultRelayer;
    }

    function setPreSignature(bytes calldata orderUID, bool signed) public {
        cowSettlement.setPreSignature(orderUID, signed);
    }

    function approveVaultRelayer(address token) public {
        IERC20(token).approve(cowVaultRelayer, 2 ** 256 - 1); // infinite approval
    }

    function getDigest(GPv2Order.Data calldata order, bytes32 domainSeparator) public pure returns (bytes32) {
        bytes32 hash = GPv2Order.hash(order, domainSeparator);
        return hash;
    }

    function getUID(GPv2Order.Data calldata order, bytes32 domainSeparator, address owner, uint32 validTo) public pure returns (bytes memory){
        bytes memory uid = new bytes(56);
        bytes32 digest = getDigest(order, domainSeparator);
        GPv2Order.packOrderUidParams(uid, digest, owner, validTo);
        return uid;
    }
}