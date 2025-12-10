// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Minimal mock for INetworkMiddlewareService used in tests.
contract DSRMockNetworkMiddlewareService {
    mapping(address => address) private _middlewareByNetwork;

    function setMiddleware(address network, address middleware_) external {
        _middlewareByNetwork[network] = middleware_;
    }

    function middleware(address network) external view returns (address) {
        return _middlewareByNetwork[network];
    }
}
