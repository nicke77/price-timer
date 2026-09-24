module.exports = function(RED) {
	'use strict';
	const moment = require('moment');

	function PriceTimer (config) {
    	RED.nodes.createNode(this,config);
    	var node = this;
    	var now = moment();
    	var sampleCount = 24;
    	node.on('input', function(msg) {
			now = moment();
			var ret={};
			ret.payload={};
			var prices = msg.prices != null && msg.prices !== '' ? msg.prices : config.prices;
			if (typeof prices === 'string') {
				if (prices === '') {
					prices = null;
				} else {
					try {
						prices = JSON.parse(prices);
					} catch (e) {
						node.error('prices must be a JSON array or { spotprice: [...] }', msg);
						return;
					}
				}
			}
			var spotprice = Array.isArray(prices) ? prices : (prices && prices.spotprice);
			spotprice = spotprice || [];
			if (!spotprice.length) {
				node.error('msg.prices (or node Prices) must provide a non-empty 24-hour price series', msg);
				return;
			}
			sampleCount = spotprice.length;
			var samplesPerHour = sampleCount / 24;
			var priceCap = msg.priceCap != null && msg.priceCap !== '' ? msg.priceCap : config.priceCap;
			var priceLevel = msg.priceLevel != null && msg.priceLevel !== '' ? msg.priceLevel : config.priceLevel;
			var minHours = msg.minHours != null && msg.minHours !== '' ? msg.minHours : config.minHours;
			var topic = msg.topic != null && msg.topic !== '' ? msg.topic : config.topic;
			var startValue = msg.startValue != null && msg.startValue !== '' ? msg.startValue : config.startValue;
			var stopValue = msg.stopValue != null && msg.stopValue !== '' ? msg.stopValue : config.stopValue;
			ret.payload.prices = prices;
			ret.payload.nbrOfHours = msg.hours != null && msg.hours !== '' ? msg.hours : config.hours;
			ret.payload.price_cap = priceCap != null && priceCap !== '' ? priceCap : Infinity;
			var hasPriceLevel = priceLevel != null && priceLevel !== '';
			ret.payload.priceLevel = hasPriceLevel ? priceLevel : null;
			ret.payload.min_hours = minHours || 0;
			var samplesBelowPriceCap = below_price_cap(spotprice, ret.payload.price_cap);
			ret.payload.hoursBelowPriceCap = samplesBelowPriceCap / samplesPerHour;
			var levelIndexes = hasPriceLevel ? indexesAtOrBelow(spotprice, priceLevel) : [];
			ret.payload.hoursBelowPriceLevel = hasPriceLevel ? levelIndexes.length / samplesPerHour : null;
			var requestedSamples = Math.round(Number(ret.payload.nbrOfHours) * samplesPerHour);
			if (requestedSamples > sampleCount)
			{
			    requestedSamples = sampleCount;
			}
			if (requestedSamples < 0)
			{
			    requestedSamples = 0;
			}
			ret.payload.extended = hasPriceLevel && levelIndexes.length > requestedSamples;
			if (ret.payload.extended)
			{
			    var minSamples = Math.round(Number(ret.payload.min_hours) * samplesPerHour);
			    if (minSamples > sampleCount)
			    {
			        minSamples = sampleCount;
			    }
			    ret.payload.slots = levelIndexes.length < minSamples
			        ? padCheapest(spotprice, levelIndexes, minSamples)
			        : levelIndexes.slice();
			}
			else
			{
			    var hours = ret.payload.hoursBelowPriceCap<ret.payload.nbrOfHours?ret.payload.hoursBelowPriceCap:ret.payload.nbrOfHours;
			    if (hours < ret.payload.min_hours)
			    {
			        hours = ret.payload.min_hours;
			    }
			    var samples = Math.round(hours * samplesPerHour);
			    if (samples > sampleCount)
			    {
			        samples = sampleCount;
			    }
			    ret.payload.slots = getLowestIndexes(spotprice, samples);
			}
			ret.payload.startStop=times(ret.payload.slots, topic);
			ret.startStopArray = startStopArray(ret.payload.slots);

			var value = stopValue;
			if (checkActive(ret.startStopArray))
			{
			    value = startValue;
			}
			node.send([ret, {"payload":value, "time": now.format("LLLL"), "topic": topic}]);
		});

		function below_price_cap(arr, priceCap)
		{
		    var ret = 0;
		    for(let i=0; i<arr.length; i++)
		    {
				if (arr[i] <= priceCap)
				{
			    	ret++;
				}
		    }
		    return ret;
		}

		function indexesAtOrBelow(arr, level)
		{
		    var ret = [];
		    for (let i = 0; i < arr.length; i++)
		    {
		        if (arr[i] <= level)
		        {
		            ret.push(i);
		        }
		    }
		    return ret;
		}

		function padCheapest(arr, selected, target)
		{
		    var chosen = {};
		    var result = selected.slice();
		    for (let i = 0; i < result.length; i++)
		    {
		        chosen[result[i]] = true;
		    }
		    var order = [];
		    for (let i = 0; i < arr.length; i++)
		    {
		        order.push(i);
		    }
		    order.sort(function(a, b) {
		        if (arr[a] !== arr[b])
		        {
		            return arr[a] - arr[b];
		        }
		        return a - b;
		    });
		    for (let i = 0; i < order.length && result.length < target; i++)
		    {
		        if (!chosen[order[i]])
		        {
		            chosen[order[i]] = true;
		            result.push(order[i]);
		        }
		    }
		    result.sort(function(a, b) { return a - b; });
		    return result;
		}


		function getLowestIndexes(arr, len) {
		// Returns a sorted array with <len> indexes of the lowest values in arr
		    let array = Array.from(arr);
		    var lowIndex = new Array(len).fill(0);
			for (let k = 0; k < len; k++) {
			    for (let i = 0; i < array.length; i++)
			    {
				    if (array[i] < array[lowIndex[k]])
				    {
						lowIndex[k] = i;
				    }
			    }
			    array[lowIndex[k]] = Infinity;
			}
		    return lowIndex.sort(function(a, b){return a-b});
		}

		function nbrToTime(nbr)
		{
			var minutes = Math.round(nbr * 1440 / sampleCount);
			if (minutes >= 1440)
			{
			    return '23:59';
			}
			var hours = Math.floor(minutes / 60);
			var mins = minutes % 60;
			var ret = '';
			if (hours < 10)
			{
				ret += '0';
			}
			ret += hours;
			ret += ':';
			if (mins < 10)
			{
				ret += '0';
			}
			ret += mins;
			return ret;
		}


		function checkActive(startStopArray)
		{
		    for (let i = 0; i + 1 < startStopArray.length; i += 2)
			{
			    if (active(startStopArray[i], startStopArray[i + 1]))
			    {
					return true;
			    }
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
				return now.isSameOrAfter(moment(start, "HH:mm"));
		    }
		    return now.isSameOrAfter(moment(start, "HH:mm")) && now.isBefore(moment(stop, "HH:mm"))
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
    
    RED.nodes.registerType("price-timer", PriceTimer);
}
