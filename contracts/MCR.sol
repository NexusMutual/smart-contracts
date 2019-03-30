/* Copyright (C) 2017 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity 0.4.24;

import "./PoolData.sol";
import "./QuotationData.sol";
import "./TokenData.sol";
import "./NXMToken.sol";
import "./Pool1.sol";
import "./MemberRoles.sol";


contract MCR is Iupgradable {
    using SafeMath for uint;

    Pool1 internal p1;
    PoolData internal pd;
    NXMToken internal tk;
    QuotationData internal qd;
    MemberRoles internal mr;
    TokenData internal td;

    uint private constant DECIMAL1E18 = uint(10) ** 18;
    uint private constant DECIMAL1E05 = uint(10) ** 5;
    uint private constant DECIMAL1E19 = uint(10) ** 19;

    event MCREvent(
        uint indexed date,
        uint blockNumber,
        bytes4[] allCurr,
        uint[] allCurrRates,
        uint mcrEtherx100,
        uint mcrPercx100,
        uint vFull
    );

    /** 
     * @dev Adds new MCR data.
     * @param mcrP  Minimum Capital Requirement in percentage.
     * @param vF Pool1 fund value in Ether used in the last full daily calculation of the Capital model.
     * @param onlyDate  Date(yyyymmdd) at which MCR details are getting added.
     */ 
    function addMCRData(
        uint mcrP,
        uint mcrE,
        uint vF,
        bytes4[] curr,
        uint[] _threeDayAvg,
        uint64 onlyDate
    )
        external
        checkPause
    {
        require(pd.isnotarise(msg.sender));
        uint _days = (uint(now).sub(mr.launchedOn())).div(1 days);
        if (mr.launched() && pd.capReached() != 1 && _days <= 30) {
            
            if (mcrP >= 10000)
                pd.setCapReached(1);  
            if (pd.capReached() != 1 && _days == 30)
                pd.setCapReached(2);

        }
        uint len = pd.getMCRDataLength();
        _addMCRData(len, onlyDate, curr, mcrE, mcrP, vF, _threeDayAvg);
    }

    /**
     * @dev Adds MCR Data for last failed attempt.
     */  
    function addLastMCRData(uint64 date) external checkPause  onlyInternal {
        uint64 lastdate = uint64(pd.getLastMCRDate());
        uint64 failedDate = uint64(date);
        if (failedDate >= lastdate) {
            uint mcrP;
            uint mcrE;
            uint vF;
            (mcrP, mcrE, vF, ) = pd.getLastMCR();
            uint len = pd.getAllCurrenciesLen();
            pd.pushMCRData(mcrP, mcrE, vF, date);
            for (uint j = 0; j < len; j++) {
                bytes4 currName = pd.getCurrenciesByIndex(j);
                pd.updateCAAvgRate(currName, pd.getCAAvgRate(currName));
            }

            emit MCREvent(date, block.number, new bytes4[](0), new uint[](0), mcrE, mcrP, vF);
            // Oraclize call for next MCR calculation
            _callOracliseForMCR();
        }
    }

    /**
     * @dev Iupgradable Interface to update dependent contract address
     */
    function changeDependentContractAddress() public onlyInternal {
        qd = QuotationData(ms.getLatestAddress("QD"));
        p1 = Pool1(ms.getLatestAddress("P1"));
        pd = PoolData(ms.getLatestAddress("PD"));
        tk = NXMToken(ms.tokenAddress());
        mr = MemberRoles(ms.getLatestAddress("MR"));
        td = TokenData(ms.getLatestAddress("TD"));
    }

    /** 
     * @dev Gets total sum assured(in ETH).
     * @return amount of sum assured
     */  
    function getAllSumAssurance() public view returns(uint amount) {
        uint len = pd.getAllCurrenciesLen();
        for (uint i = 0; i < len; i++) {
            bytes4 currName = pd.getCurrenciesByIndex(i);
            if (currName == "ETH") {
                amount = amount.add(qd.getTotalSumAssured(currName));
            } else {
                if (pd.getCAAvgRate(currName) > 0)
                    amount = amount.add((qd.getTotalSumAssured(currName).mul(100)).div(pd.getCAAvgRate(currName)));
            }
        }
    }

    /**
     * @dev Calculates V(Tp) and MCR%(Tp), i.e, Pool Fund Value in Ether 
     * and MCR% used in the Token Price Calculation.
     * @return vtp  Pool Fund Value in Ether used for the Token Price Model
     * @return mcrtp MCR% used in the Token Price Model. 
     */ 
    function _calVtpAndMCRtp(uint poolBalance) public view returns(uint vtp, uint mcrtp) {
        vtp = 0;
        IERC20 erc20;
        uint currTokens = 0;
        uint i;
        for (i = 1; i < pd.getAllCurrenciesLen(); i++) {
            bytes4 currency = pd.getCurrenciesByIndex(i);
            erc20 = IERC20(pd.getCurrencyAssetAddress(currency));
            currTokens = erc20.balanceOf(address(p1));
            if (pd.getCAAvgRate(currency) > 0)
                vtp = vtp.add((currTokens.mul(100)).div(pd.getCAAvgRate(currency)));
        }

        vtp = vtp.add(poolBalance).add(p1.getInvestmentAssetBalance());
        uint mcrFullperc;
        uint vFull;
        (mcrFullperc, , vFull, ) = pd.getLastMCR();
        if (vFull > 0) {
            mcrtp = (mcrFullperc.mul(vtp)).div(vFull);
        }
    }

    /**
     * @dev Calculates the Token Price of NXM in a given currency.
     * @param curr Currency name.
     
     */
    function calculateStepTokenPrice(
        bytes4 curr,
        uint mcrtp
    ) 
        public
        view
        onlyInternal
        returns(uint tokenPrice)
    {
        return _calculateTokenPrice(curr, mcrtp);
    }

    /**
     * @dev Calculates the Token Price of NXM in a given currency 
     * with provided token supply for dynamic token price calculation
     * @param curr Currency name.
     */ 
    function calculateTokenPrice (bytes4 curr) public view returns(uint tokenPrice) {
        uint mcrtp;
        (, mcrtp) = _calVtpAndMCRtp(address(p1).balance); 
        return _calculateTokenPrice(curr, mcrtp);
    }
    
    function calVtpAndMCRtp() public view returns(uint vtp, uint mcrtp) {
        return _calVtpAndMCRtp(address(p1).balance);
    }

    function calculateVtpAndMCRtp(uint poolBalance) public view returns(uint vtp, uint mcrtp) {
        return _calVtpAndMCRtp(poolBalance);
    }

    /**
     * @dev Gets max numbers of tokens that can be sold at the moment.
     */ 
    function getMaxSellTokens() public view returns(uint maxTokens) {
        uint baseMin = pd.getCurrencyAssetBaseMin("ETH");
        if (address(p1).balance > baseMin.mul(50).div(100))
            uint maxTokensAccPoolBal  = address(p1).balance.sub(
            (baseMin.mul(50)).div(100));        
        maxTokensAccPoolBal = (maxTokensAccPoolBal.mul(DECIMAL1E18)).div(
            (calculateTokenPrice("ETH").mul(975)).div(1000));
        uint lastMCRPerc = pd.getLastMCRPerc();
        if (lastMCRPerc > 10000)
            maxTokens = (((uint(lastMCRPerc).sub(10000)).mul(2000)).div(10000)).mul(DECIMAL1E18);
        // require (false,'rofl'); 
        if (maxTokens > maxTokensAccPoolBal)
            maxTokens = maxTokensAccPoolBal;     
    }

    /** 
     * @dev Calls oraclize query to calculate MCR details after 24 hours.
     */ 
    function _callOracliseForMCR() internal {
        p1.mcrOraclise(pd.mcrTime());
    }

    /**
     * @dev Calculates the Token Price of NXM in a given currency 
     * with provided token supply for dynamic token price calculation
     * @param _curr Currency name.  
     * @return tokenPrice Token price.
     */ 
    function _calculateTokenPrice(
        bytes4 _curr,
        uint mcrtp
    )
        internal
        view
        returns(uint tokenPrice)
    {
        uint getA;
        uint getC;
        uint getCAAvgRate;
        uint tokenExponentValue = td.tokenExponent();
        // uint max = (mcrtp.mul(mcrtp).mul(mcrtp).mul(mcrtp));
        uint max = mcrtp ** tokenExponentValue;
        uint dividingFactor = tokenExponentValue.mul(4); 
        (getA, getC, getCAAvgRate) = pd.getTokenPriceDetails(_curr);
        uint mcrEth = pd.getLastMCREther();
        getC = getC.mul(DECIMAL1E18);
        tokenPrice = (mcrEth.mul(DECIMAL1E18).div(getC).mul(max)).div(10 ** dividingFactor);
        tokenPrice = tokenPrice.add(getA.mul(DECIMAL1E18).div(DECIMAL1E05));
        tokenPrice = tokenPrice.mul(getCAAvgRate * 10); 
        tokenPrice = (tokenPrice).div(10**3);
    } 
    
    /**
     * @dev Adds MCR Data. Checks if MCR is within valid 
     * thresholds in order to rule out any incorrect calculations 
     */  
    function _addMCRData(
        uint len,
        uint64 newMCRDate,
        bytes4[] curr,
        uint mcrE,
        uint mcrP,
        uint vF,
        uint[] _threeDayAvg
    ) 
        internal
    {
        uint vtp = 0;
        uint lower = 0;
        uint lowerThreshold = 0;
        uint upperThreshold = 0;
        if (len > 1) {
            (vtp, ) = _calVtpAndMCRtp(address(p1).balance);
            if (vtp >= vF) {
                upperThreshold = vtp.mul(100).div(pd.minCap());
            } else {
                upperThreshold = vF.mul(100).div(pd.minCap());
            }

            if (vtp > 0) {
                lower = (getAllSumAssurance().mul(100).mul(DECIMAL1E18)).div(pd.shockParameter());
            }
            if (lower > 0) {
                lowerThreshold = vtp.div(lower);
            }
        }
        if (len == 1 || (mcrP.div(100)) >= lowerThreshold 
            && (mcrP.div(100)) <= upperThreshold) {
            vtp = pd.getLastMCRDate(); // due to stack to deep error,we are reusing already declared variable
            pd.pushMCRData(mcrP, mcrE, vF, newMCRDate);
            for (uint i = 0; i < curr.length; i++) {
                pd.updateCAAvgRate(curr[i], _threeDayAvg[i]);
            }
            emit MCREvent(newMCRDate, block.number, curr, _threeDayAvg, mcrE, mcrP, vF);
            // Oraclize call for next MCR calculation
            if (vtp < newMCRDate) {
                _callOracliseForMCR();
            }
        } else {
            p1.mcrOracliseFail(newMCRDate, pd.mcrFailTime());
        }
    }

}
