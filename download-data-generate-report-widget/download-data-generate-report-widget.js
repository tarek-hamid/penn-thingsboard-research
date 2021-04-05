self.onInit = function() {

    var configObject = {
        // Max days chosen in UI can be configured here
        // maxDays: 30
    };


    $('#datePicker').dateRangePicker(configObject);

    var downloadButton = document.getElementById(
            "download"),
        reportButton = document.getElementById(
            "report");

    getDevices();

    downloadButton.onclick = function() {
        var action = "download"
        buttonClickAction(action);
    }

    reportButton.onclick = function() {
        var action = "generate report"
        buttonClickAction(action);
    }
}

self.onDestroy = function() {}

const buttonClickAction = function(action) {
    const http = self.ctx.http;

    var select = document.getElementById("select"),
        date = document.getElementById("datePicker");

    var deviceId = select.value,
        deviceName = select.options[select
            .selectedIndex].text

    var dates = date.value.split(' '),
        startDate = moment(dates[0] +
            ' 00:00:00'),
        endDate = moment(dates[2] +
            ' 23:59:59');

    var limit = (endDate / 1000) - (startDate /
        1000) + 1;

    if (!select.value || !date.value) {
        document.getElementById("user-interaction")
            .textContent =
            'Please select a device and date range.'
        return
    }

    $("#download").prop('disabled', true)
    $("#report").prop('disabled', true)
    $("#select").prop('disabled', true)
    $("#datePicker").prop('disabled', true)
    document.getElementById("user-interaction")
        .textContent = 'Processing...'

    ////////////////////////
    //// Call Data API ////
    ///////////////////////
    
    const result = http.get(
        '/api/plugins/telemetry/DEVICE/' +
        deviceId.toString() +
        '/values/timeseries?keys=data' +
        '&limit=' + limit + '&startTs=' +
        startDate + '&endTs=' + endDate, {
            headers: {
                'Content-type': 'application/json'
            }
        });

    if (action == "download") {
        result.forEach((data) => {
            downloadData(dataToCsv(data),
                deviceName,
                startDate, endDate);
        });
    }

    if (action == "generate report") {
        result.forEach((data) => {
            downloadData(analyzeData(data),
                deviceName, startDate,
                endDate)
        });
    }
}

const analyzeData = function(data) {
    const csvRows = [];
    var spo2Values = [];
    
    const dataBySat = {
        valuesAbove94: [],
        valuesBetween90And94: [],
        valuesBetween85and89: [],
        valuesBetween80and84: [],
        valuesBelow80: []
    };

    const dataByTime = {
        allTimes: [],
        timesBelow85: [],
        timesBelow80: []
    }
    
    const splitByDay = {};
    const splitByWeek = {};
    
    var sum = 0,
        dataLength = data.data.length
    
    
    startTime = data.data[dataLength - 1].ts,
        endTime = data.data[0].ts;

    var highQualityData = 0,
        lowQualityData = 0;
        
    ////////////////////////
    /// Saturation Rates ///
    ///////////////////////

    for (i = dataLength - 1; i >= 0; i--) {
        var value = formatJsonData(data.data[i].value)
        var ts = data.data[i].ts
        
        
        for (const key in value) {
            var variable = value[key].split(':')[0]

            if (variable == "SpO2") {
                var spo2Value = parseInt(value[key]
                    .split(':')[1]);
                spo2Values.push(spo2Value)
                dataByTime.allTimes.push(ts)

                // check SpO2 value //
                if (spo2Value >= 95) {
                    dataBySat.valuesAbove94.push(
                        spo2Value)
                } else if (spo2Value >= 90) {
                    dataBySat.valuesBetween90And94.push(
                        spo2Value)
                } else if (spo2Value >= 85) {
                    dataBySat.valuesBetween85and89.push(
                        spo2Value)
                } else if (spo2Value >= 80) {
                    dataBySat.valuesBetween80and84.push(
                        spo2Value)
                } else {
                    dataBySat.valuesBelow80.push(
                        spo2Value)
                }

                // Check for 30-60s intervals //
                if (spo2Value < 80) {
                    dataByTime.timesBelow80.push(ts)
                } else if (spo2Value < 85) {
                    dataByTime.timesBelow85.push(ts)
                }

                // Get sum for mean 
                sum += spo2Value
                
                // Check high, low quality data
                if(i < dataLength - 1){
                    var prevTs = data.data[i+1].ts
                    var prevValue = formatJsonData(data.data[i+1].value)

                    if(Math.ceil((ts - prevTs)/1000) <= 30){
                        highQualityData += 1
                    }else {
                        lowQualityData += 1
                    }
                }
            }

        }
    }
    
    
    ////////////////////////
    //// Calculate STD ////
    ///////////////////////
    
    var standardDeviation = 0;
    mean = sum / dataLength;

    for (i = 0; i < spo2Values.length; i++) {
        var squaredDiff = Math.pow((spo2Values[i] -
            mean), 2)
        standardDeviation += squaredDiff
    }

    standardDeviation = Math.sqrt((standardDeviation /
        spo2Values.length)).toFixed(2)


    ////////////////////////
    ///// < 80, < 85 //////
    ///////////////////////
    
    var eightyLessThanThirtySecCount = 0,
        eightyGreaterThanThirtySecCount = 0,
        eightyGreaterThanSixtySecCount = 0;

    var eightyLessThanThirtySec = {}
        eightyGreaterThanThirtySec = {}
        eightyGreaterThanSixtySec = {};

    var startTime = dataByTime.timesBelow80[0],
        tempCount = 1;
    
        
    for (i = 1; i < dataByTime['timesBelow80'].length; i++) {
        currentTime = dataByTime['timesBelow80'][i]
        previousTime = dataByTime['timesBelow80'][i - 1]
        var timeDiff = Math.round((currentTime - startTime)/ 1000)

        if (timeDiff <= 1) {
            tempCount += 1
        } else if (tempCount == 1) {
            startTime = currentTime
        } else if (tempCount < 30) {
            eightyLessThanThirtySec[moment(
                startTime).format('YYYY-MM-DD HH:mm:ss') + '  -  ' + moment(previousTime).format('YYYY-MM-DD HH:mm:ss')] = tempCount
            eightyLessThanThirtySecCount += tempCount
            startTime = currentTime
            tempCount = 1
        } else if (tempCount > 60) {
            eightyGreaterThanSixtySec[moment(
                startTime).format('YYYY-MM-DD HH:mm:ss') + '  -  ' + moment(previousTime).format('YYYY-MM-DD HH:mm:ss')] = tempCount
            eightyGreaterThanSixtySec += tempCount
            startTime = currentTime
            tempCount = 1
        } else {
            eightyGreaterThanThirtySec[moment(
                startTime).format('YYYY-MM-DD HH:mm:ss') + '  -  ' + moment(previousTime).format('YYYY-MM-DD HH:mm:ss')] = tempCount
            eightyGreaterThanThirtySec += tempCount
            startTime = currentTime
            tempCount = 1
        }
    }
    

    var eightyFiveLessThanThirtySecCount = 0,
        eightyFiveGreaterThanThirtySecCount = 0,
        eightyFiveGreaterThanSixtySecCount = 0;

    var eightyFiveLessThanThirtySec = {}
        eightyFiveGreaterThanThirtySec = {}
        eightyFiveGreaterThanSixtySec = {};

    var startTime = dataByTime.timesBelow85[0],
        tempCount = 1;
        
    for (i = 1; i < dataByTime['timesBelow85'].length; i++) {
        currentTime = dataByTime['timesBelow85'][i]
        previousTime = dataByTime['timesBelow85'][i - 1]
        var timeDiff = Math.round((currentTime - startTime) / 1000)
        if (timeDiff == 1) {
            tempCount += 1
        } else if (tempCount == 1) {
            startTime = currentTime
        } else if (tempCount < 30) {
            eightyFiveLessThanThirtySec[moment(
                startTime).format('YYYY-MM-DD HH:mm:ss') + '  -  ' + moment(previousTime).format('YYYY-MM-DD HH:mm:ss')] = tempCount
            eightyFiveLessThanThirtySecCount += tempCount
            startTime = currentTime
            tempCount = 1
        } else if (tempCount > 60) {
            eightyFiveGreaterThanSixtySec[moment(
                startTime).format('YYYY-MM-DD HH:mm:ss') + '  -  ' + moment(previousTime).format('YYYY-MM-DD HH:mm:ss')] = tempCount
            eightyFiveGreaterThanSixtySecCount += tempCount
            startTime = currentTime
            tempCount = 1
        } else {
            eightyFiveGreaterThanThirtySec[moment(
                startTime).format('YYYY-MM-DD HH:mm:ss') + '  -  ' + moment(previousTime).format('YYYY-MM-DD HH:mm:ss')] = tempCount
            eightyFiveGreaterThanThirtySecCount += tempCount
            startTime = currentTime
            tempCount = 1
        }
    }
    
    ////////////////////////
    // Split by day, week /
    ///////////////////////
    
    startTime = dataByTime.allTimes[0]
    timesByDay = {};
    timesByWeek = {};
    
    
    for(i = 0; i < dataByTime.allTimes.length; i++){
        currentTime = dataByTime.allTimes[i]
        previousTime = dataByTime.allTimes[i - 1]
        tempCount == 0
        if((currentTime - startTime) / 86400000 > 1 || i == dataByTime.allTimes.length - 1){
            timesByDay[moment(startTime).format('MM-DD-YYYY')] = moment.utc(tempCount * 1000).format('HH:mm:ss')
            startTime = currentTime
            tempCount = 0 
        } else {
            tempCount += 1
        }
    }
    
    startTime = dataByTime.allTimes[0]
    
    ////////////////////////
    //// Push to rows ////
    ///////////////////////
    
    var newRow = "Analysis Result "
    csvRows.push(newRow)

    csvRows.push(',')

    newRow = 'Total Number of Data: ,'
    newRow += dataLength
    csvRows.push(newRow)

    newRow = 'Days: ,'
    newRow += Math.round((endTime - startTime) /
        86000000)
    csvRows.push(newRow)

    newRow = 'Mean: ,'
    newRow += mean.toFixed(2)
    csvRows.push(newRow)

    newRow = 'Std: ,'
    newRow += standardDeviation
    csvRows.push(newRow)

    newRow = 'High Quality - Number of Data: ,'
    newRow += highQualityData + ','
    newRow += 'Percentage:,'
    newRow += (highQualityData/dataLength * 100).toFixed(2)
    csvRows.push(newRow)

    newRow = 'Low Quality - Number of Data: ,'
    newRow += lowQualityData + ','
    newRow += 'Percentage:,'
    newRow += (lowQualityData/dataLength * 100).toFixed(2)
    csvRows.push(newRow)

    csvRows.push(',')

    newRow = 'Saturation Times'
    csvRows.push(newRow)

    newRow = 'SpO2 percentage,'
    newRow += 'Number of Data, '
    newRow += 'Percentage'
    csvRows.push(newRow)

    newRow = '> 94%,'
    newRow += dataBySat['valuesAbove94'].length + ','
    newRow += (dataBySat['valuesAbove94'].length /
        dataLength * 100).toFixed(2)
    csvRows.push(newRow)

    newRow = '90-94%,'
    newRow += dataBySat['valuesBetween90And94'].length +
        ','
    newRow += (dataBySat['valuesBetween90And94']
        .length / dataLength * 100).toFixed(2)
    csvRows.push(newRow)

    newRow = '85-89%,'
    newRow += dataBySat['valuesBetween85and89'].length +
        ','
    newRow += (dataBySat['valuesBetween85and89']
        .length / dataLength * 100).toFixed(2)
    csvRows.push(newRow)

    newRow = '80-84%,'
    newRow += dataBySat['valuesBetween80and84'].length +
        ','
    newRow += (dataBySat['valuesBetween80and84']
        .length / dataLength * 100).toFixed(2)
    csvRows.push(newRow)

    newRow = '< 80%,'
    newRow += dataBySat['valuesBelow80'].length + ','
    newRow += (dataBySat['valuesBelow80'].length /
        dataLength * 100).toFixed(2)
    csvRows.push(newRow)

    newRow = '< 80% - < 30 sec,'
    newRow +=  eightyLessThanThirtySecCount + ','
    newRow += (eightyLessThanThirtySecCount/dataLength * 100).toFixed(2)
    csvRows.push(newRow)
    
    if (Object.keys(eightyLessThanThirtySec).length != 0){
        newRow = ','
        newRow += 'Events'
        csvRows.push(newRow)
        for (key in eightyLessThanThirtySec){
        newRow = ',' + 'Duration: ' + eightyLessThanThirtySec[key] + ' seconds - '
        newRow += key
        csvRows.push(newRow)
        }
    }
    
    newRow = '< 80% - >= 30 sec,'
    newRow += eightyGreaterThanThirtySecCount + ','
    newRow += (eightyGreaterThanThirtySecCount/dataLength * 100).toFixed(2)
    csvRows.push(newRow)
    
    if (Object.keys(eightyGreaterThanThirtySec).length > 0){
        newRow = ','
        newRow += 'Events'
        csvRows.push(newRow)
        for (key in eightyGreaterThanThirtySec){
        newRow = ',' + 'Duration: ' + eightyGreaterThanThirtySec[key] + ' seconds - '
        newRow += key
        csvRows.push(newRow)
        }
    }

    newRow = '< 80% - >= 60 sec,'
    newRow += eightyGreaterThanSixtySecCount + ','
    newRow += (eightyGreaterThanSixtySecCount/dataLength * 100).toFixed(2)
    csvRows.push(newRow)
    
    if (Object.keys(eightyGreaterThanSixtySec).length != 0){
        newRow = ','
        newRow += 'Events'
        csvRows.push(newRow)
        for (key in eightyGreaterThanSixtySec){
        newRow = ',' + 'Duration: ' + eightyGreaterThanSixtySec[key] + ' seconds - '
        newRow += key
        csvRows.push(newRow)
        }
    }

    newRow = '< 85% - < 30 sec,'
    newRow += eightyFiveLessThanThirtySecCount + ','
    newRow += (eightyFiveLessThanThirtySecCount/dataLength * 100).toFixed(2)
    csvRows.push(newRow)
    
    if (Object.keys(eightyFiveLessThanThirtySec).length != 0){
        newRow = ','
        newRow += 'Events'
        csvRows.push(newRow)
        for (key in eightyFiveLessThanThirtySec){
        newRow = ',' + 'Duration: ' + eightyFiveLessThanThirtySec[key] + ' seconds - '
        newRow += key
        csvRows.push(newRow)
        }
    }

    newRow = '< 85% - >= 30 sec,'
    newRow += eightyFiveGreaterThanThirtySecCount + ','
    newRow += (eightyFiveGreaterThanThirtySecCount/dataLength * 100).toFixed(2)
    csvRows.push(newRow)
    
    if (Object.keys(eightyFiveGreaterThanThirtySec).length != 0){
        newRow = ','
        newRow += 'Events'
        csvRows.push(newRow)
        for (key in eightyFiveGreaterThanThirtySecCount){
        newRow = ',' + 'Duration: ' + eightyFiveGreaterThanThirtySecCount[key] + ' seconds - '
        newRow += key
        csvRows.push(newRow)
        }
    }

    newRow = '< 85% - >= 60 sec,'
    newRow += eightyFiveGreaterThanSixtySecCount + ','
    newRow += (eightyFiveGreaterThanSixtySecCount/dataLength * 100).toFixed(2)
    csvRows.push(newRow)
    
    if (Object.keys(eightyFiveGreaterThanSixtySec).length != 0){
        newRow = ','
        newRow += 'Events'
        csvRows.push(newRow)
        for (key in eightyFiveGreaterThanSixtySec){
        newRow = ',' + 'Duration: ' + eightyFiveGreaterThanSixtySec[key] + ' seconds - '
        newRow += key
        csvRows.push(newRow)
        }
    }

    csvRows.push(',')

    newRow = 'Data Collected Time'
    csvRows.push(newRow)

    newRow = 'Per Day'
    csvRows.push(newRow)
    
    var total = formatSecondsTime(dataLength)
    
    for (key in timesByDay){
        newRow = ',' + key + ': ' + timesByDay[key]
        csvRows.push(newRow)
    }
    
    newRow = 'Per Week'
    csvRows.push(newRow)
    var dates = Object.keys(timesByDay),
        weekStart = dates[0],
        totalTime = moment.duration(timesByDay[weekStart]).asSeconds
        ();
    
    for(i = 0; i < dates.length - 1; i++){
        var currentDay = dates[i + 1],
            diff = Math.ceil((moment(currentDay) - moment(weekStart)) / 86400000) + 1,
            timePeriod = moment.duration(timesByDay[currentDay]).asSeconds();
        totalTime += timePeriod
        
        if (diff == 8){
            newRow = ',' + weekStart + ' - ' + currentDay + ': ' + formatSecondsTime(totalTime)
            weekStart = dates[i + 2]
            totalTime = 0
            csvRows.push(newRow)
        } else if (i == dates.length - 2) {
            newRow = ',' + weekStart + ' - ' + currentDay + ': ' + formatSecondsTime(totalTime)
            csvRows.push(newRow)
        } 
    }
    

    newRow = 'Total' + ','
    newRow += total
    csvRows.push(newRow)
    
    return csvRows.join('\n')
    
}

const dataToCsv = function(data) {
    const csvRows = [];

    // get headers and populate csvRows
    var headers = Object.keys(data.data[0])[0]
    var unformattedHeaders = data.data[0].value
    var additionalHeaders = formatJsonData(
        unformattedHeaders)
    for (const key in additionalHeaders) {
        newHeader = additionalHeaders[key].split(':')[0]
        headers += ',' + newHeader
    }

    csvRows.push(headers)

    // populate CSV with data
    for (i = data.data.length - 1; i >= 0; i--) {
        var newRow = moment(data.data[i].ts).format(
            'YYYY-MM-DD HH:mm:ss')
        var value = formatJsonData(data.data[i].value)
        for (const key in value) {
            var newValue = value[key].split(':')[1]
            newRow += ',' + newValue
        }
        csvRows.push(newRow)
    }

    return csvRows.join('\n')
}

const downloadData = function(data, deviceName, startDate,
    endDate) {

    const blob = new Blob([data], {
        type: 'text/csv'
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);

    // Setting document name
    startDate = moment(startDate).format('YYYY-MM-DD')
    endDate = moment(endDate).format('YYYY-MM-DD')
    documentName = String(deviceName) + '_' +
        startDate + '_to_' + endDate
    a.setAttribute('download', documentName + '.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Reset card
    $("#download").removeAttr('disabled')
    $("#report").removeAttr('disabled')
    $("#select").removeAttr('disabled')
    $("#datePicker").removeAttr('disabled')
    document.getElementById("user-interaction")
        .textContent = ''
}

const getDevices = function() {
    const http = self.ctx.http;

    // Load multiple devices
    const deviceQuery = http.get(
        '/api/tenant/devices?pageSize=100&page=0');

    deviceQuery.forEach((devices) => {
        devices.data.forEach((device) => {
            const deviceName = String(
                    device.name),
                deviceId = String(device
                    .id.id)

            var option = document
                .createElement(
                    "option");
            option.value = deviceId;
            option.innerHTML =
                deviceName;
            select.appendChild(option);
        });
    });
}

const formatJsonData = function(valueString) {
    return valueString.replace(/"/g, '').replace(/{/g,
        '').replace(/}/g, '').split(',')
}

const formatSecondsTime = function(seconds) {
    var hrs = Math.trunc(seconds / 3600);
    var mins = Math.trunc((seconds % 3600) / 60);
    var secs = Math.trunc(seconds % 60);

    var ret = "";
    if (hrs > 0) {
        ret += "" + hrs + ":" + (mins < 10 ? "0" : "");
    }
    ret += "" + mins + ":" + (secs < 10 ? "0" : "");
    ret += "" + secs;
    return ret;
}