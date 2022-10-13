module.exports = function(RED) {
//	const moment = require('moment');
	function PriceTimer(config) {
    	RED.nodes.createNode(this,config);
    	var node = this;
		var now=moment();
    	node.on('input', function(msg) {

			var ret={};
			ret.payload={};
			ret.payload.prices = msg.prices;
			ret.payload.nbrOfHours = msg.hours;
			ret.payload.price_cap = msg.price_cap || Infinity;
			ret.payload.min_hours = msg.min_hours || 0;
			ret.payload.hours_below_price_cap = below_price_cap(msg.prices.spotprice, ret.price_cap);
			var hours = ret.payload.hours_below_price_cap<ret.payload.nbrOfHours?ret.payload.hours_below_price_cap:ret.payload.nbrOfHours;
			if (hours < ret.payload.min_hours)
			{
			    hours = ret.payload.min_hours;
			}
			ret.payload.hours = getLowestIndexes(ret.payload.prices.spotprice, hours);
			ret.payload.startStop=times(ret.payload.hours, msg.topic);
			ret.startStopArray = startStopArray(ret.payload.hours);

			var value = msg.stop_value;
			if (checkActive(ret.startStopArray))
			{
			    value = msg.start_value;
			}
			return {"payload":value, "time": now.format("LLLL"), "topic": msg.topic};
		});
    }
    RED.nodes.registerType("energy-planner",PriceTimer);

	function below_price_cap(arr, price_cap)
	{
	    var ret = 0;
	    for(let i=0; i<=arr.length; i++)
	    {
		if (arr[i] <= price_cap)
		{
		    ret++;
		}
	    }
	    return ret;
	}


	function getLowestIndexes(arr, len) {
	// Returns a sorted array with <len> indexes of the lowest values in arr
	    let array = Array.from(arr);
	    var lowIndex = new Array(len).fill(0);
	    var k, i;
		for (let k = 0; k < len; k++) {
		    for (let i = 0; i < array.length; i++) {
			    if (array[i] < array[lowIndex[k]]) {
				lowIndex[k] = i;
			    }
		    }
		    array[lowIndex[k]] = Infinity;
		}
	    return lowIndex.sort(function(a, b){return a-b});
	}

	function nbrToTime(nbr)
	{
		if(nbr == 24)
		{
		    return '23:59';
		}
		var ret = '';
		if (nbr<10)
		{
			ret+='0';
		}
		ret+=nbr;
		ret=ret+':00';
		return ret;
	}


	function checkActive(startStopArray)
	{
	    if(now.isBefore(moment('00:14', "hh:mm")) && startStopArray[0] != '00:00')
	    {
		return false
	    }
	    for (let i=0; i<=startStopArray.length/2; i++)
		{
		    if(active(startStopArray[i], startStopArray[i+1]))
		    {
			return true;
		    }
		    i++;
		}
		return false;
	}

	function startStopArray(hourArray)
	// returns an array with even indexes, start and odd stop [<start_time_1>, <stop_time_1>, <start_time_2>, <stop_time_2>, ...]
	{
	  	var ret = [];
	    if (hourArray.length>0)
	    {
	      	ret.push(nbrToTime(hourArray[0]));
	      	for (let i=1; i<hourArray.length; i++)
	    	{
	    	    if (hourArray[i-1]+1 != hourArray[i]) //timegap
	    	    {
	    	        ret.push(nbrToTime(hourArray[i-1]+1));
	    	        ret.push(nbrToTime(hourArray[i]));
	    	    }
	    	}
	    	ret.push(nbrToTime(hourArray[hourArray.length-1]+1));
	    }
		return ret;    
	}


	function active(start, stop)
	// checks if we are in the given timespan
	{
	    if (stop === '23:59')
	    {
		return now.isAfter(moment(start, "hh:mm"));
	    }
	    return now.isAfter(moment(start, "hh:mm")) && now.isBefore(moment(stop, "hh:mm"))
	}

	function times(hourArray, topic, start_value=1, end_value=0)
	{
		var ret = [];
		if (hourArray.length>0)
	    {
	    	var k=0;
	    	ret[k] = {"start":{"time":nbrToTime(hourArray[0]), "value":start_value},"end":{"value":end_value}, "topic": topic};
	    	for (let i=1; i<=hourArray.length; i++)
	    	{
	    		if (hourArray[i-1]+1 != hourArray[i]) //timegap
	    		{
	    			if (ret[k]["end"]["time"] == null)
	    			{
	    			    ret[k]["end"]["time"] = nbrToTime(hourArray[i-1]+1);
	    			}
	    			if (i+1<=hourArray.length)
	    			{
	    			    k++;
	    				ret[k] = {"start":{"time":nbrToTime(hourArray[i]), "value":start_value},"end":{"value":end_value}, "topic": topic};
	    			}
	    		}else
	    		{
	    			ret[k]["end"]["time"] = nbrToTime(hourArray[i]+1);
	    		}
	    	}
	    	ret[k]["end"]["time"] = nbrToTime(hourArray[hourArray.length-1]+1);
	    }
		return ret;
	}
}

