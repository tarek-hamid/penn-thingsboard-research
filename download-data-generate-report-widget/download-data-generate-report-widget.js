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
        var action = "download";
        buttonClickAction(action);
    };

    reportButton.onclick = function() {
        var action = "generate report";
        buttonClickAction(action);
    };
};

self.onDestroy = function() {};

const buttonClickAction = function(action) {
    const http = self.ctx.http;

    var select = document.getElementById("select"),
        date = document.getElementById("datePicker");

    var deviceId = select.value,
        deviceName = select.options[select
            .selectedIndex].text;

    var dates = date.value.split(' '),
        startDate = moment(dates[0] +
            ' 00:00:00.000'),
        endDate = moment(dates[2] +
            ' 23:59:59.999');

    var limit = Math.floor((endDate / 1000) - (startDate /
        1000) + 1000);

    if (!select.value || !date.value) {
        document.getElementById("user-interaction")
            .textContent =
            'Please select a device and date range.';
        return;
    }

    $("#download").prop('disabled', true);
    $("#report").prop('disabled', true);
    $("#select").prop('disabled', true);
    $("#datePicker").prop('disabled', true);
    document.getElementById("user-interaction")
        .textContent = 'Processing...';

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
            if (Object.entries(data).length === 0) {
                // Reset card
                $("#download").removeAttr('disabled');
                $("#select").removeAttr('disabled');
                $("#report").removeAttr('disabled');
                $("#datePicker").removeAttr('disabled');
                document.getElementById("user-interaction")
                    .textContent = 'No Data';
            }
            else {
                downloadData(dataToCsv(data),
                    deviceName,
                    startDate, endDate);
            }
        });
    }

    if (action == "generate report") {
        result.forEach((data) => {
            if (Object.entries(data).length === 0) {
                // Reset card
                $("#download").removeAttr('disabled');
                $("#select").removeAttr('disabled');
                $("#report").removeAttr('disabled');
                $("#datePicker").removeAttr('disabled');
                document.getElementById("user-interaction")
                    .textContent = 'No Data';
            }
            else {
                downloadData(analyzeData(data),
                    deviceName, startDate,
                    endDate);
            }
        });
    }
};

const appendByDuration = function(totalByDuration, newData) {
    if (newData.length < 2) {
        if (newData.length === 1) {
            totalByDuration.less30s.push(newData);
        }
    }
    else {
        const diff = newData.slice(-1)[0] - newData[0];
        if (diff >= 60000) {
            totalByDuration.over60s.push(newData);
        }
        else if (diff >= 30000) {
            totalByDuration.over30s.push(newData);
        }
        else {
            totalByDuration.less30s.push(newData);
        }
    }
};

const dumpSaturationTimes = function(title, dataSet, dataLength) {
    let newRow = title + ',';
    newRow += 'Number of Data: ' + dataSet.length + ',';
    newRow += 'Percentage: ' + (dataSet.length /
        dataLength * 100).toFixed(2);
    newRow += ' %'
    
    return newRow;
};

const dumpSatWithDuration = function(title, durationData, dataLength) {
    const outArray = [''];
    const episodes = {};
    let totalCount = 0;
    durationData.forEach((dur) => {
        const start = dur[0];
        const end = dur.slice(-1)[0];
        const duration = end - start;
        totalCount += dur.length;
        
        newRow = ',' + moment(start).format('YYYY-MM-DD HH:mm:ss') +
            ' - ' + moment(end).format('YYYY-MM-DD HH:mm:ss') +
            ' : ' + moment.utc(duration).format('HH:mm:ss');
        outArray.push(newRow);

        const dayKey = moment(start).format('MM/DD/YYYY');
        if (!episodes[dayKey]) {
            episodes[dayKey] = 1;
        }
        else {
            episodes[dayKey] += 1;
        }
    });
    
    newRow = title + ',';
    newRow += 'Number of Data: ' + totalCount + ',';
    newRow += 'Percentage: ' + (totalCount /
        dataLength * 100).toFixed(2);
    newRow += ' %';
    outArray[0] = newRow;

    Object.keys(episodes).forEach((dayKey) => {
        newRow = ',' + dayKey + ' : ' + episodes[dayKey] + ' episode(s)';
        outArray.push(newRow);
    });
    
    return outArray;
};

const analyzeData = function(data) {
    const MIN_DIFF_IN_MS = 300000; // 5min
    const MIN_HQ_THR_MS = 30000; // 30s
    const MAX_LQ_THR_MS = 3000; // 3s
    
    let csvRows = [];

    const dataBySat = {
        below80: [],
        below85: [],
        below90: [],
        between90And94: [],
        above94: [],
        above95: [],
    };

    const total80ByDuration = {
        less30s: [],
        over30s: [],
        over60s: [],
    };
    const total85ByDuration = {
        less30s: [],
        over30s: [],
        over60s: [],
    };

    const splitByDay = {};
    const splitByWeek = {};

    var sum = 0,
        dataLength = data.data.length;
    var spo2Values = [];

    startTime = data.data[dataLength - 1].ts,
        endTime = data.data[0].ts;

    var highQualityData = [],
        lowQualityData = [];
        
    ////////////////////////
    /// Saturation Rates ///
    ///////////////////////
    let prev_dt;
    let prev_v;
    let prev_prev_v;
    let temp_v = [];
    
    let temp_80 = [];
    let temp_85 = [];
    let direct_prev_dt;
    
    for (i = dataLength - 1; i >= 0; i--) {
        const dt = data.data[i].ts;
        const value = JSON.parse(data.data[i].value);
        if (!value.hasOwnProperty('SpO2')) continue;
        const val = parseInt(value.SpO2);

        const dayKey = moment(dt).format('MM/DD/YYYY');
        if (!splitByDay[dayKey]) {
            splitByDay[dayKey] = [];
        }

        // check SpO2 value //
        if (val < 80) {
            dataBySat.below80.push(val);
        }
        if (val < 85) {
            dataBySat.below85.push(val);
        }
        if (val < 90) {
            dataBySat.below90.push(val);
        }
        if (val >= 90 && val < 95) {
            dataBySat.between90And94.push(val);
        }
        if (val > 94) {
            dataBySat.above94.push(val);
        }
        if (val > 95) {
            dataBySat.above95.push(val);
        }

        // Get sum for mean 
        sum += val;
        spo2Values.push(val);

        // Check high, low quality data
        if (dt === endTime) { // last data?
            if (prev_v && prev_dt && prev_v === val && (dt - prev_dt) <= MIN_HQ_THR_MS && temp_v.length > 0) {
                temp_v.push({dt, val});
                const delta_t = temp_v.slice(-1)[0].dt - temp_v[0].dt;
                if (delta_t > MIN_HQ_THR_MS) {
                    temp_v.forEach(tv => highQualityData.push(tv.val));
                }
            }
        }
        else if (!prev_v || !prev_dt
            || (dt - prev_dt) > MIN_DIFF_IN_MS
            || prev_v !== val) {
                
            if (temp_v.length > 0) {
                const delta_t = temp_v.slice(-1)[0].dt - temp_v[0].dt;
                if (delta_t > MIN_HQ_THR_MS) {
                    temp_v.forEach(tv => highQualityData.push(tv.val));
                }
                else if (delta_t < MAX_LQ_THR_MS && val === prev_prev_v) {
                    temp_v.forEach(tv => lowQualityData.push(tv.val));
                }
            }
            
            temp_v = [{dt, val}];
            prev_dt = dt;
            
            if (dt - prev_dt > MIN_DIFF_IN_MS) {
                prev_prev_v = undefined;
            }
            else {
                prev_prev_v = prev_v;
            }
            
            prev_v = val;
        }
        else if (prev_v === val) {
            temp_v.push({dt, val});
        }
        
        //
        if (dt === endTime) {
            if (val < 80) {
                temp_80.push(dt);
                temp_85.push(dt);
            }
            else if (val < 85) {
                temp_85.push(dt);
            }

            appendByDuration(total80ByDuration, temp_80);
            temp_80 = [];
            appendByDuration(total85ByDuration, temp_85);
            temp_85 = [];
        }
        else if (!direct_prev_dt || (direct_prev_dt - dt) < MIN_DIFF_IN_MS) {
            if (val < 80) {
                temp_80.push(dt);
                temp_85.push(dt);
            }
            else if (val < 85) {
                appendByDuration(total80ByDuration, temp_80);
                temp_80 = [];
                
                temp_85.push(dt);
            }
            else {
                appendByDuration(total80ByDuration, temp_80);
                temp_80 = [];
                appendByDuration(total85ByDuration, temp_85);
                temp_85 = [];
            }
            
            direct_prev_dt = dt;
        }
        else {
            appendByDuration(total80ByDuration, temp_80);
            temp_80 = [];
            appendByDuration(total85ByDuration, temp_85);
            temp_85 = [];

            if (val < 80) {
                temp_80.push(dt);
                temp_85.push(dt);
            }
            else if (val < 85) {
                temp_85.push(dt);
            }
            
            direct_prev_dt = dt;
        }
        
        const dayLength = splitByDay[dayKey].length;
        if (dayLength === 0) {
            splitByDay[dayKey].push([{dt, val}]);
        }
        else {
            const lastGroup = splitByDay[dayKey][dayLength - 1];
            const last_dt = lastGroup.slice(-1)[0].dt;
            if (dt - last_dt < MIN_DIFF_IN_MS) {
                // append to the last group
                lastGroup.push({dt, val});
            }
            else {
                // start new group
                splitByDay[dayKey].push([{dt, val}]);
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
        spo2Values.length)).toFixed(2);

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
        86400000)
    csvRows.push(newRow)

    newRow = 'Mean: ,'
    newRow += mean.toFixed(2)
    csvRows.push(newRow)

    newRow = 'Std: ,'
    newRow += standardDeviation
    csvRows.push(newRow)

    newRow = 'High Quality,Number of Data: '
    newRow += highQualityData.length + ','
    newRow += 'Percentage: '
    newRow += (highQualityData.length / dataLength * 100)
        .toFixed(2)
    newRow += ' %'
    csvRows.push(newRow)

    newRow = 'Low Quality,Number of Data: '
    newRow += lowQualityData.length + ','
    newRow += 'Percentage: '
    newRow += (lowQualityData.length / dataLength * 100)
        .toFixed(2)
    newRow += ' %'
    csvRows.push(newRow)

    csvRows.push(',')

    // dump saturations
    newRow = 'Saturation Times'
    csvRows.push(newRow)
    
    csvRows.push(dumpSaturationTimes('< 80%', dataBySat.below80, dataLength));
    csvRows.push(dumpSaturationTimes('< 85%', dataBySat.below85, dataLength));
    csvRows.push(dumpSaturationTimes('< 90%', dataBySat.below90, dataLength));
    csvRows.push(dumpSaturationTimes('90%-94%', dataBySat.between90And94, dataLength));
    csvRows.push(dumpSaturationTimes('>= 95%', dataBySat.above94, dataLength));
    csvRows.push(dumpSaturationTimes('>= 96%', dataBySat.above95, dataLength));

    // dump saturation with dudrations
    csvRows = csvRows.concat(dumpSatWithDuration('< 80% - < 30 sec', total80ByDuration.less30s, dataLength));
    csvRows = csvRows.concat(dumpSatWithDuration('< 80% - >= 30 sec', total80ByDuration.over30s, dataLength));
    csvRows = csvRows.concat(dumpSatWithDuration('< 80% - >= 60 sec', total80ByDuration.over60s, dataLength));

    csvRows = csvRows.concat(dumpSatWithDuration('< 85% - < 30 sec', total85ByDuration.less30s, dataLength));
    csvRows = csvRows.concat(dumpSatWithDuration('< 85% - >= 30 sec', total85ByDuration.over30s, dataLength));
    csvRows = csvRows.concat(dumpSatWithDuration('< 85% - >= 60 sec', total85ByDuration.over60s, dataLength));

    csvRows.push(',')

    newRow = 'Data Collected Time'
    csvRows.push(newRow)

    newRow = 'Per Day'
    csvRows.push(newRow)

    let totalDuration = 0;
    for (let dayKey in splitByDay) {
        const dayGroup = splitByDay[dayKey];
        let duration = 0;
        const entries = [];
        dayGroup.forEach((values) => {
            const first = values[0].dt;
            const last = values.slice(-1)[0].dt;
            const d = last - first;
            duration += d;
            entries.push(',' + moment(first).format('YYYY-MM-DD HH:mm:ss') +
                ' - ' + moment(last).format('YYYY-MM-DD HH:mm:ss'));
        });
        
        newRow = dayKey + ':,' + moment.utc(duration).format('HH:mm:ss');
        csvRows.push(newRow);
        csvRows = csvRows.concat(entries);
        totalDuration += duration;
    }
    
    const days = Math.floor(totalDuration / (24 * 3600000));

    newRow = 'Total';
    csvRows.push(newRow);
    newRow = ',';
    if (days > 0) {
        newRow += days + ' day(s); ';
    }
    newRow += moment.utc(totalDuration).format('HH:mm:ss');
    csvRows.push(newRow);

    return csvRows.join('\n');
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
    for (i = data.data.length - 1; i >= 1; i--) {
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

    ////////////////////////
    //// Download as CSV ///
    ///////////////////////

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
    ///////////////////////////////////
    //// Get Devices and Populate ////
    /////////////////////////////////

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
    ///////////////////////////////
    //// Convert s to hh:mm:ss ////
    //////////////////////////////
    var hrs = Math.trunc(seconds / 3600);
    var mins = Math.trunc((seconds % 3600) / 60);
    var secs = Math.trunc(seconds % 60);

    var ret = "";
    ret += "" + hrs + ":" + (mins < 10 ? "0" : "");
    ret += "" + mins + ":" + (secs < 10 ? "0" : "");
    ret += "" + secs;
    return ret;
}