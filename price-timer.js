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
			var spotprice = parsePriceSeries(prices);
			if (spotprice === false) {
				node.error('prices must be a JSON array or { spotprice: [...] }', msg);
				return;
			}
			if (!spotprice.length) {
				node.error('msg.prices (or node Prices) must provide a non-empty 24-hour price series', msg);
				return;
			}
			sampleCount = spotprice.length;
			var samplesPerHour = sampleCount / 24;
			var todayKey = now.format('YYYY-MM-DD');
			if (node.pendingTomorrow && node.pendingTomorrow.date === todayKey)
			{
			    if (!samePriceSeries(node.pendingTomorrow.prices, spotprice))
			    {
			        node.error('tomorrow prices from yesterday do not match msg.prices; using the newest prices', msg);
			    }
			    node.pendingTomorrow = null;
			}
			else if (node.pendingTomorrow && node.pendingTomorrow.date < todayKey)
			{
			    node.pendingTomorrow = null;
			}
			var tomorrowRaw = msg.tomorrowPrices;
			var tomorrowSeries = null;
			if (tomorrowRaw != null && tomorrowRaw !== '')
			{
			    tomorrowSeries = parsePriceSeries(tomorrowRaw);
			    if (tomorrowSeries === false)
			    {
			        node.error('tomorrowPrices must be a JSON array or { spotprice: [...] }', msg);
			        return;
			    }
			    if (tomorrowSeries.length !== sampleCount)
			    {
			        node.error('tomorrowPrices must have the same length as prices', msg);
			        return;
			    }
			    node.pendingTomorrow = {
			        date: now.clone().add(1, 'day').format('YYYY-MM-DD'),
			        prices: tomorrowSeries.slice()
			    };
			}
			var priceCap = nodeOrMessage(config.priceCap, msg.priceCap);
			var priceLevel = nodeOrMessage(config.priceLevel, msg.priceLevel);
			var minHours = msg.minHours != null && msg.minHours !== '' ? msg.minHours : config.minHours;
			var topic = nodeOrMessage(config.topic, msg.topic);
			var startValue = msg.startValue != null && msg.startValue !== '' ? msg.startValue : config.startValue;
			var stopValue = msg.stopValue != null && msg.stopValue !== '' ? msg.stopValue : config.stopValue;
			ret.payload.prices = prices;
			ret.payload.nbrOfHours = msg.hours != null && msg.hours !== '' ? msg.hours : config.hours;
			ret.payload.price_cap = priceCap != null && priceCap !== '' ? priceCap : Infinity;
			var hasPriceLevel = priceLevel != null && priceLevel !== '';
			ret.payload.priceLevel = hasPriceLevel ? priceLevel : null;
			ret.payload.min_hours = minHours || 0;
			var timeSpanRaw = msg.timeSpan != null && msg.timeSpan !== '' ? msg.timeSpan : config.timeSpan;
			var windowIndexes = null;
			var parsedSpan = null;
			var schedulePrices = spotprice;
			ret.payload.tomorrowPrices = null;
			if (timeSpanRaw != null && timeSpanRaw !== '')
			{
			    parsedSpan = parseTimeSpan(timeSpanRaw);
			    if (!parsedSpan)
			    {
			        node.error('time span must be a range like 08:00-16:00', msg);
			        return;
			    }
			    windowIndexes = indexesInsideSpan(sampleCount, parsedSpan.from, parsedSpan.to);
			    ret.payload.timeSpan = formatTimeSpan(parsedSpan);
			    if (!windowIndexes.length)
			    {
			        node.warn('time span does not cover any price samples', msg);
			    }
			    if (tomorrowSeries && parsedSpan.from > parsedSpan.to)
			    {
			        var merged = mergeOvernightPrices(spotprice, tomorrowSeries, windowIndexes);
			        schedulePrices = merged.prices;
			        windowIndexes = merged.indexes;
			        ret.payload.tomorrowPrices = tomorrowRaw;
			    }
			}
			else
			{
			    ret.payload.timeSpan = null;
			}
			var poolCount = windowIndexes ? windowIndexes.length : sampleCount;
			var samplesBelowPriceCap = below_price_cap(schedulePrices, ret.payload.price_cap, windowIndexes);
			ret.payload.hoursBelowPriceCap = samplesBelowPriceCap / samplesPerHour;
			var levelIndexes = hasPriceLevel ? indexesAtOrBelow(schedulePrices, priceLevel, windowIndexes) : [];
			ret.payload.hoursBelowPriceLevel = hasPriceLevel ? levelIndexes.length / samplesPerHour : null;
			var requestedSamples = Math.round(Number(ret.payload.nbrOfHours) * samplesPerHour);
			if (requestedSamples > poolCount)
			{
			    requestedSamples = poolCount;
			}
			if (requestedSamples < 0)
			{
			    requestedSamples = 0;
			}
			ret.payload.extended = hasPriceLevel && levelIndexes.length > requestedSamples;
			if (ret.payload.extended)
			{
			    var minSamples = Math.round(Number(ret.payload.min_hours) * samplesPerHour);
			    if (minSamples > poolCount)
			    {
			        minSamples = poolCount;
			    }
			    ret.payload.slots = levelIndexes.length < minSamples
			        ? padCheapest(schedulePrices, levelIndexes, minSamples, windowIndexes)
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
			    if (samples > poolCount)
			    {
			        samples = poolCount;
			    }
			    ret.payload.slots = getLowestIndexes(schedulePrices, samples, windowIndexes);
			}
			ret.payload.startStop=times(ret.payload.slots, topic);
			ret.startStopArray = startStopArray(ret.payload.slots);

			var value = stopValue;
			if (checkActive(ret.startStopArray))
			{
			    value = startValue;
			}
			var control = {"payload":value, "time": now.format("LLLL"), "topic": topic};
			if (parsedSpan && (isChecked(config.onlyDuringSpan) || isChecked(config.stopAtSpanEnd)))
			{
			    var minuteOfDay = now.hours() * 60 + now.minutes();
			    var insideSpan = minuteInsideSpan(minuteOfDay, parsedSpan.from, parsedSpan.to);
			    var leftSpan = node.spanInside === true && !insideSpan;
			    node.spanInside = insideSpan;
			    if (!insideSpan)
			    {
			        if (isChecked(config.stopAtSpanEnd) && leftSpan)
			        {
			            control.payload = stopValue;
			        }
			        else if (isChecked(config.onlyDuringSpan))
			        {
			            control = null;
			        }
			    }
			}
			else
			{
			    node.spanInside = null;
			}
			node.send([ret, control]);
		});

		function isChecked(value)
		{
		    return value === true || value === 'true';
		}

		function minuteInsideSpan(minuteOfDay, fromMin, toMin)
		{
		    if (fromMin < toMin)
		    {
		        return minuteOfDay >= fromMin && minuteOfDay < toMin;
		    }
		    return minuteOfDay >= fromMin || minuteOfDay < toMin;
		}

		function parsePriceSeries(value)
		{
		    if (typeof value === 'string')
		    {
		        if (value === '')
		        {
		            return [];
		        }
		        try
		        {
		            value = JSON.parse(value);
		        }
		        catch (e)
		        {
		            return false;
		        }
		    }
		    var series = Array.isArray(value) ? value : (value && value.spotprice);
		    if (series == null)
		    {
		        return [];
		    }
		    if (!Array.isArray(series))
		    {
		        return false;
		    }
		    return series;
		}

		function samePriceSeries(a, b)
		{
		    if (!a || !b || a.length !== b.length)
		    {
		        return false;
		    }
		    for (let i = 0; i < a.length; i++)
		    {
		        if (Number(a[i]) !== Number(b[i]))
		        {
		            return false;
		        }
		    }
		    return true;
		}

		function mergeOvernightPrices(todayArr, tomorrowArr, spanIndexes)
		{
		    var effective = todayArr.slice();
		    var indexes = [];
		    var count = todayArr.length;
		    var nowMin = now.hours() * 60 + now.minutes() + now.seconds() / 60;
		    for (let n = 0; n < spanIndexes.length; n++)
		    {
		        var i = spanIndexes[n];
		        var sampleStart = i * 1440 / count;
		        var sampleEnd = (i + 1) * 1440 / count;
		        if (sampleEnd > nowMin)
		        {
		            indexes.push(i);
		        }
		        else
		        {
		            var minutesUntilTomorrowStart = (1440 - nowMin) + sampleStart;
		            if (minutesUntilTomorrowStart < 1440)
		            {
		                effective[i] = tomorrowArr[i];
		                indexes.push(i);
		            }
		        }
		    }
		    return {prices: effective, indexes: indexes};
		}

		function nodeOrMessage(nodeValue, msgValue) {
			if (nodeValue != null && nodeValue !== '') {
				return nodeValue;
			}
			if (msgValue != null && msgValue !== '') {
				return msgValue;
			}
			return nodeValue != null ? nodeValue : msgValue;
		}

		function parseClock(text)
		{
		    var match = /^(\d{1,2}):(\d{2})$/.exec(text);
		    if (!match)
		    {
		        return null;
		    }
		    var hours = Number(match[1]);
		    var minutes = Number(match[2]);
		    if (minutes > 59 || hours > 24 || (hours === 24 && minutes !== 0))
		    {
		        return null;
		    }
		    return hours * 60 + minutes;
		}

		function parseTimeSpan(value)
		{
		    var match = /^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/.exec(String(value));
		    if (!match)
		    {
		        return null;
		    }
		    var from = parseClock(match[1]);
		    var to = parseClock(match[2]);
		    if (from == null || to == null || from === to || from === 1440)
		    {
		        return null;
		    }
		    return {from: from, to: to};
		}

		function formatClock(minutes)
		{
		    if (minutes === 1440)
		    {
		        return '24:00';
		    }
		    var hours = Math.floor(minutes / 60);
		    var mins = minutes % 60;
		    return (hours < 10 ? '0' : '') + hours + ':' + (mins < 10 ? '0' : '') + mins;
		}

		function formatTimeSpan(span)
		{
		    return formatClock(span.from) + '-' + formatClock(span.to);
		}

		function indexesInsideSpan(count, fromMin, toMin)
		{
		    var indexes = [];
		    for (let i = 0; i < count; i++)
		    {
		        var start = i * 1440;
		        var end = (i + 1) * 1440;
		        var inside;
		        if (fromMin < toMin)
		        {
		            inside = start >= fromMin * count && end <= toMin * count;
		        }
		        else
		        {
		            inside = start >= fromMin * count || end <= toMin * count;
		        }
		        if (inside)
		        {
		            indexes.push(i);
		        }
		    }
		    return indexes;
		}

		function below_price_cap(arr, priceCap, allowed)
		{
		    var ret = 0;
		    if (allowed)
		    {
		        for (let i = 0; i < allowed.length; i++)
		        {
		            if (arr[allowed[i]] <= priceCap)
		            {
		                ret++;
		            }
		        }
		        return ret;
		    }
		    for(let i=0; i<arr.length; i++)
		    {
				if (arr[i] <= priceCap)
				{
			    	ret++;
				}
		    }
		    return ret;
		}

		function indexesAtOrBelow(arr, level, allowed)
		{
		    var ret = [];
		    var indexes = allowed || arr.map(function(_, i) { return i; });
		    for (let i = 0; i < indexes.length; i++)
		    {
		        if (arr[indexes[i]] <= level)
		        {
		            ret.push(indexes[i]);
		        }
		    }
		    return ret;
		}

		function padCheapest(arr, selected, target, allowed)
		{
		    var chosen = {};
		    var result = selected.slice();
		    for (let i = 0; i < result.length; i++)
		    {
		        chosen[result[i]] = true;
		    }
		    var order = [];
		    if (allowed)
		    {
		        order = allowed.slice();
		    }
		    else
		    {
		        for (let i = 0; i < arr.length; i++)
		        {
		            order.push(i);
		        }
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


		function getLowestIndexes(arr, len, allowed) {
		// Returns a sorted array with <len> indexes of the lowest values in arr
		    let array = Array.from(arr);
		    if (allowed)
		    {
		        var allow = {};
		        for (let i = 0; i < allowed.length; i++)
		        {
		            allow[allowed[i]] = true;
		        }
		        for (let i = 0; i < array.length; i++)
		        {
		            if (!allow[i])
		            {
		                array[i] = Infinity;
		            }
		        }
		        if (len > allowed.length)
		        {
		            len = allowed.length;
		        }
		    }
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
