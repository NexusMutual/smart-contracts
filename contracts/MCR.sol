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

import "./NXMToken.sol";
import "./Pool1.sol";
import "./PoolData.sol";
import "./QuotationData.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMath.sol";
import "./imports/openzeppelin-solidity/token/ERC20/ERC20.sol";


contract MCR is Iupgradable {
    using SafeMath for uint;

    Pool1 internal p1;
    PoolData internal pd;
    NXMToken internal tk;
    QuotationData internal qd;

    uint private constant DECIMAL1E18 = uint(10) ** 18;
    uint private constant DECIMAL1E08 = uint(10) ** 8;

    event MCREvent(
        uint indexed date,
        uint blockNumber,
        bytes4[] allCurr,
        uint[] allCurrRates,
        uint mcrEtherx100,
        uint mcrPercx100,
        uint vFull
    );

    modifier onlyOwner {
        require(ms.isOwner(msg.sender) == true);
        _;
    }

    modifier checkPause {
        require(ms.isPause() == false);
        _;
    }

    /**
     * @dev Changes minimum Capital Requirement for system to sustain.
     */  
    function changeMinReqMCR(uint32 minMCR) external onlyInternal {
        pd.changeMinReqMCR(minMCR);
    }
    
    /**
     * @dev Changes time period for obtaining new MCR data from external oracle query.
     */  
    function changeMCRTime(uint64 _time) external onlyOwner {

        pd.changeMCRTime(_time);
    }

    /** 
     * @dev Stores name of currencies accepted by the system.
     * @param curr Currency Name.
     */  
    function addCurrency(bytes4 curr) external checkPause {

        require(ms.isInternal(msg.sender) == true || ms.isOwner(msg.sender) == true);
        pd.addCurrency(curr);
    }

    /** 
     * @dev Changes scaling factor which determines token price.
     */  
    function changeSF(uint32 val) external onlyOwner {
        pd.changeSF(val);
    }

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
        bytes4[] memory curr,
        uint[] _threeDayAvg,
        uint64 onlyDate
    )
        public
        checkPause
    {
        require(pd.isnotarise(msg.sender));
        uint len = pd.getMCRDataLength();
        _addMCRData(len, onlyDate, curr, mcrE, mcrP, vF, _threeDayAvg);
    }

    /**
     * @dev Adds MCR Data for last failed attempt.
     */  
    function addLastMCRData(uint64 date) external checkPause
     {
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
                pd.updateCurr3DaysAvg(currName, pd.getCurr3DaysAvg(currName));
            }

            emit MCREvent(date, block.number, new bytes4[](0), new uint[](0), mcrE, mcrP, vF);
            // Oraclize call for next MCR calculation
            callOracliseForMCR();
        }
    }

    /**
     * @dev Checks if last notarised Minimum Capital Requirement(MCR) 
     * percentage is less than minimum capital required or not.
     * @return check 1 if last added MCR% < Minimum MCR value
     */  
    function checkForMinMCR() external view returns(uint8 check) {
        check = 0;
        if (pd.getLastMCRPerc() < pd.minMCRReq())
            check = 1;
    }

    function changeDependentContractAddress() public onlyInternal {
        qd = QuotationData(ms.getLatestAddress("QD"));
        p1 = Pool1(ms.getLatestAddress("P1"));
        pd = PoolData(ms.getLatestAddress("PD"));
        tk = NXMToken(ms.tokenAddress());
    }

    /** 
     * @dev Gets total sum assured(in ETH).
     */  
    function getAllSumAssurance() public view returns(uint amount) {
        uint len = pd.getAllCurrenciesLen();
        for (uint i = 0; i < len; i++) {
            bytes4 currName = pd.getCurrenciesByIndex(i);
            if (currName == "ETH") {
                amount = amount.add(qd.getTotalSumAssured(currName));
            } else {
                if (pd.getCurr3DaysAvg(currName) > 0)
                    amount = amount.add((qd.getTotalSumAssured(currName).mul(100)).div(pd.getCurr3DaysAvg(currName)));
            }
        }
    }

    /**
     * @dev Calculates V(Tp) and MCR%(Tp), i.e, Pool Fund Value in Ether 
     * and MCR% used in the Token Price Calculation.
     * @return vtp  Pool Fund Value in Ether used for the Token Price Model
     * @return mcrtp MCR% used in the Token Price Model. 
     */ 
    function calVtpAndMCRtp(uint poolBalance) public view returns(uint vtp, uint mcrtp) {
        vtp = 0;
        ERC20 erc20;
        uint currTokens = 0;
        for (uint i = 1; i < pd.getAllCurrenciesLen(); i++) {
            bytes4 currency = pd.getCurrenciesByIndex(i);
            erc20 = ERC20(pd.getCurrencyAssetAddress(currency));
            currTokens = erc20.balanceOf(address(p1));
            if (pd.getCurr3DaysAvg(currency) > 0)
                vtp = vtp.add((currTokens.mul(100)).div(pd.getCurr3DaysAvg(currency)));
        }
        vtp = vtp.add(poolBalance);
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
     * @param totalSupply Tokens in circulation
     */
    function calculateStepTokenPrice(
        bytes4 curr,
        uint totalSupply,
        uint mcrtp
    ) 
        public
        view
        onlyInternal
        returns(uint tokenPrice)
    {
        return _calculateTokenPrice(curr, totalSupply, mcrtp);
    }

    /**
     * @dev Calculates the Token Price of NXM in a given currency 
     * with provided token supply for dynamic token price calculation
     * @param curr Currency name.
     */ 
    function calculateTokenPrice (bytes4 curr) public view returns(uint tokenPrice) {
        uint mcrtp;
        (, mcrtp) = calVtpAndMCRtp(address(p1).balance); 
        return _calculateTokenPrice(curr, tk.totalSupply(), mcrtp);
    }
    
    /**
     * @dev Gets max numbers of tokens that can be sold at the moment.
     */ 
    function getMaxSellTokens() public view returns(uint maxTokens) {
        uint maxTokensAccPoolBal  = address(p1).balance.sub(
            (pd.getCurrencyAssetBaseMin("ETH").mul(50)).div(100));
        maxTokensAccPoolBal = (maxTokensAccPoolBal.mul(DECIMAL1E18)).div(
            (calculateTokenPrice("ETH").mul(975)).div(1000));
        maxTokens = (((uint(pd.getLastMCRPerc()).sub(10000)).mul(2000)).div(10000)).mul(DECIMAL1E18); 
        if (maxTokens > maxTokensAccPoolBal)
            maxTokens = maxTokensAccPoolBal;     
    }

    /** 
     * @dev Calls oraclize query to calculate MCR details after 24 hours.
     */ 
    function callOracliseForMCR() internal {
        p1.mcrOraclise(pd.mcrTime());
    }

    /**
     * @dev Calculates the Token Price of NXM in a given currency 
     * with provided token supply for dynamic token price calculation
     * @param _curr Currency name.
     * @param _totalSupply token supply
     * @return tokenPrice Token price.
     */ 
    function _calculateTokenPrice(
        bytes4 _curr,
        uint _totalSupply,
        uint mcrtp
    )
        internal
        view
        returns(uint tokenPrice)
    {
        uint getSFx100000;
        uint getGrowthStep;
        uint getCurr3DaysAvg;
        uint max = (mcrtp.mul(mcrtp)); 
        (getSFx100000, getGrowthStep, getCurr3DaysAvg) = pd.getTokenPriceDetails(_curr);
        if (max <= DECIMAL1E08) {
            max = DECIMAL1E08; 
        }
        getGrowthStep = getGrowthStep.mul(DECIMAL1E18);
        tokenPrice = getSFx100000.mul(getGrowthStep.add(_totalSupply));
        tokenPrice = (tokenPrice.mul(max)).mul(DECIMAL1E18);
        tokenPrice = (tokenPrice.mul(getCurr3DaysAvg * 10)).div(getGrowthStep); 
        tokenPrice = (tokenPrice).div(DECIMAL1E08 ** 2);
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
            (vtp, ) = calVtpAndMCRtp(address(p1).balance);
            if (vtp >= vF) {
                upperThreshold = vtp.div(pd.minCap());
                upperThreshold = upperThreshold.mul(100);
            } else {
                upperThreshold = vF.div(pd.minCap());
                upperThreshold = upperThreshold.mul(100);
            }

            if (vtp > 0) {
                lower = (getAllSumAssurance().mul(100)).div(pd.shockParameter());
                lower = lower.mul(DECIMAL1E18);
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
                pd.updateCurr3DaysAvg(curr[i], _threeDayAvg[i]);
            }
            emit MCREvent(newMCRDate, block.number, curr, _threeDayAvg, mcrE, mcrP, vF);
            // Oraclize call for next MCR calculation
            if (vtp < newMCRDate) {
                callOracliseForMCR();
            }
        } else {
            p1.mcrOracliseFail(newMCRDate, pd.mcrFailTime());
        }
    }

}
