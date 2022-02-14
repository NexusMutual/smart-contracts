// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

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
}